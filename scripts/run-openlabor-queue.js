import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importOpenLaborVehicle } from './import-openlabor-vehicle.js';
import { formatError, formatSupabaseError } from './lib/errors.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL in .env.local');
  process.exit(1);
}

if (!supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function normalizeLimit(value, fallback = 5) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.floor(numericValue) : fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.floor(numericValue) : fallback;
}

const DEFAULT_MIN_RATE_LIMIT_REMAINING = 10;

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    limit: 5,
    minRateLimitRemaining: DEFAULT_MIN_RATE_LIMIT_REMAINING,
    resetFailedRecent: 0,
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      args.limit = normalizeLimit(arg.slice('--limit='.length), 5);
    } else if (arg.startsWith('--minRateLimitRemaining=')) {
      args.minRateLimitRemaining = normalizeNonNegativeInteger(
        arg.slice('--minRateLimitRemaining='.length),
        DEFAULT_MIN_RATE_LIMIT_REMAINING,
      );
    } else if (arg.startsWith('--resetFailedRecent=')) {
      args.resetFailedRecent = normalizeNonNegativeInteger(
        arg.slice('--resetFailedRecent='.length),
        0,
      );
    }
  }

  return args;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPendingQueueRows(limit) {
  const baseColumns = 'id, year, make, model, make_slug, model_slug, engine, engine_slug, priority, created_at';
  const query = (columns) => supabase
    .from('openlabor_import_queue')
    .select(columns)
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  const response = await query(`${baseColumns}, fuel_type`);

  if (!response.error) {
    return response;
  }

  if (String(response.error.message ?? '').includes('fuel_type')) {
    return query(baseColumns);
  }

  return response;
}

function formatQueueVehicle(row) {
  return [
    row.year,
    row.make,
    row.model,
    row.engine,
    row.engine_slug ? `(${row.engine_slug})` : '',
  ].filter(Boolean).join(' ');
}

async function resetFailedQueueRows(limit) {
  const { data, error } = await supabase
    .from('openlabor_import_queue')
    .select('id, year, make, model, engine, engine_slug, updated_at, finished_at')
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .order('finished_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch failed queue rows for reset:\n${formatSupabaseError(error)}`);
  }

  const rows = data ?? [];
  const ids = rows.map((row) => row.id);

  if (ids.length === 0) {
    return { reset: 0, rows };
  }

  const { error: updateError } = await supabase
    .from('openlabor_import_queue')
    .update({
      status: 'pending',
      started_at: null,
      finished_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateError) {
    throw new Error(`Failed to reset failed queue rows:\n${formatSupabaseError(updateError)}`);
  }

  return { reset: ids.length, rows };
}

export async function runOpenLaborQueue(options = {}) {
  const cliOptions = parseCliArgs();
  const limit = normalizeLimit(options.limit ?? cliOptions.limit, 5);
  const minRateLimitRemaining = normalizeNonNegativeInteger(
    options.minRateLimitRemaining ?? cliOptions.minRateLimitRemaining,
    DEFAULT_MIN_RATE_LIMIT_REMAINING,
  );
  const resetFailedRecent = normalizeNonNegativeInteger(
    options.resetFailedRecent ?? cliOptions.resetFailedRecent,
    0,
  );
  const log = options.log ?? true;

  if (resetFailedRecent > 0) {
    const resetSummary = await resetFailedQueueRows(resetFailedRecent);

    if (log) {
      console.log(`reset failed queue rows: ${resetSummary.reset}`);
      for (const row of resetSummary.rows.slice(0, 10)) {
        console.log(`- ${formatQueueVehicle(row)}; queue id: ${row.id}`);
      }
    }

    return {
      attempted: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      resetFailed: resetSummary.reset,
      rateLimitRemaining: null,
      stoppedEarly: false,
      stopReason: '',
    };
  }

  const { data: pendingRows, error } = await fetchPendingQueueRows(limit);

  if (error) {
    throw new Error(`Failed to fetch pending Open Labor queue rows:\n${formatSupabaseError(error)}`);
  }

  const rows = pendingRows ?? [];
  let attempted = 0;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let rateLimitRemaining = null;
  let stoppedEarly = false;
  let stopReason = '';

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    attempted += 1;

    if (log) {
      console.log(`Processing queue row ${row.id} (${row.year} ${row.make} ${row.model})...`);
    }

    try {
      const result = await importOpenLaborVehicle({
        year: row.year,
        make: row.make,
        model: row.model,
        makeSlug: row.make_slug,
        modelSlug: row.model_slug,
        engine: row.engine,
        engineSlug: row.engine_slug,
        fuelType: row.fuel_type,
        queueId: row.id,
      });

      if (result.success === false) {
        throw result.error ?? new Error('Raw import returned success: false');
      }

      if (result.skipped) {
        skipped += 1;
      } else {
        completed += 1;
      }

      if (result.rateLimitRemaining !== undefined && result.rateLimitRemaining !== null && result.rateLimitRemaining !== '') {
        rateLimitRemaining = Number(result.rateLimitRemaining);

        if (Number.isFinite(rateLimitRemaining) && rateLimitRemaining < minRateLimitRemaining) {
          stoppedEarly = true;
          stopReason = `Stopping early because Open Labor daily rate limit is low: ${rateLimitRemaining} remaining.`;

          if (log) {
            console.log(stopReason);
          }

          break;
        }
      }
    } catch (error) {
      failed += 1;
      if (log) {
        console.error(`Queue row ${row.id} failed: ${formatQueueVehicle(row)}`);
        console.error(`year: ${row.year}`);
        console.error(`make: ${row.make}`);
        console.error(`model: ${row.model}`);
        console.error(`engine: ${row.engine ?? 'Base / unspecified engine'}`);
        console.error(`source_engine_slug: ${row.engine_slug ?? 'none'}`);
        console.error(formatError(error));
      }
    }

    if (index < rows.length - 1) {
      await sleep(1000);
    }
  }

  const summary = {
    attempted,
    completed,
    skipped,
    failed,
    resetFailed: 0,
    rateLimitRemaining,
    stoppedEarly,
    stopReason,
  };

  if (log) {
    console.log('queue run complete');
    console.log(`attempted: ${attempted}`);
    console.log(`completed: ${completed}`);
    console.log(`skipped: ${skipped}`);
    console.log(`failed: ${failed}`);

    if (rateLimitRemaining !== null) {
      console.log(`rate limit remaining: ${rateLimitRemaining}`);
    }

    if (stoppedEarly) {
      console.log(stopReason);
    }
  }

  return summary;
}

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const cliOptions = parseCliArgs();

  runOpenLaborQueue(cliOptions).catch((error) => {
    console.error('Queue run failed:');
    console.error(formatError(error));
    process.exitCode = 1;
  });
}
