import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { importOpenLaborVehicle } from './import-openlabor-vehicle.js';

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

function parseLimit(argv = process.argv.slice(2)) {
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));

  if (!limitArg) {
    return 5;
  }

  const value = Number(limitArg.slice('--limit='.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const limit = parseLimit();
  const { data: pendingRows, error } = await supabase
    .from('openlabor_import_queue')
    .select(
      'id, year, make, model, make_slug, model_slug, engine, engine_slug, priority, created_at',
    )
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows = pendingRows ?? [];
  let attempted = 0;
  let completed = 0;
  let failed = 0;
  let rateLimitRemaining = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    attempted += 1;

    console.log(`Processing queue row ${row.id} (${row.year} ${row.make} ${row.model})...`);

    try {
      const result = await importOpenLaborVehicle({
        year: row.year,
        make: row.make,
        model: row.model,
        makeSlug: row.make_slug,
        modelSlug: row.model_slug,
        engine: row.engine,
        engineSlug: row.engine_slug,
        queueId: row.id,
      });

      completed += 1;
      if (result.rateLimitRemaining !== undefined && result.rateLimitRemaining !== null && result.rateLimitRemaining !== '') {
        rateLimitRemaining = result.rateLimitRemaining;
      }
    } catch (error) {
      failed += 1;
      console.error(`Queue row ${row.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (index < rows.length - 1) {
      await sleep(1000);
    }
  }

  console.log('queue run complete');
  console.log(`attempted: ${attempted}`);
  console.log(`completed: ${completed}`);
  console.log(`failed: ${failed}`);

  if (rateLimitRemaining !== null) {
    console.log(`rate limit remaining: ${rateLimitRemaining}`);
  }
}

main().catch((error) => {
  console.error(`Queue run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
