import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { recalculateScores } from './recalculate-wrenchability-scores.js';

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

// Service role key is used only in this local worker. Never expose it in React/browser code.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    once: false,
    intervalMs: 3000,
  };

  for (const arg of argv) {
    if (arg === '--once') {
      args.once = true;
    } else if (arg.startsWith('--intervalMs=')) {
      const intervalMs = Number(arg.slice('--intervalMs='.length));
      if (Number.isFinite(intervalMs) && intervalMs > 0) {
        args.intervalMs = Math.floor(intervalMs);
      }
    }
  }

  return args;
}

export function formatError(error) {
  if (!error) return 'Unknown error';

  if (error instanceof Error) {
    const detailLines = [];

    if (error.message) detailLines.push(error.message);
    if (error.details) detailLines.push(`details: ${error.details}`);
    if (error.hint) detailLines.push(`hint: ${error.hint}`);
    if (error.code) detailLines.push(`code: ${error.code}`);

    return detailLines.join('\n');
  }

  if (typeof error === 'string') return error;

  if (typeof error === 'object') {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

export async function logJob(jobId, level, message, data = null) {
  const terminalMessage = `[${new Date().toISOString()}] [${level}] ${message}`;
  console.log(terminalMessage);

  const { error } = await supabase
    .from('admin_job_logs')
    .insert({
      job_id: jobId,
      level,
      message,
      data,
    });

  if (error) {
    throw new Error(`Failed to insert admin job log: ${formatError(error)}`);
  }
}

export async function updateJobStatus(jobId, status, fields = {}) {
  const { data, error } = await supabase
    .from('admin_jobs')
    .update({
      status,
      ...fields,
    })
    .eq('id', jobId)
    .select('id, type, status, payload, created_at, started_at, finished_at')
    .single();

  if (error) {
    throw new Error(`Failed to update admin job ${jobId}: ${formatError(error)}`);
  }

  return data;
}

async function fetchNextQueuedJob() {
  const { data, error } = await supabase
    .from('admin_jobs')
    .select('id, type, status, payload, created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch queued admin jobs: ${formatError(error)}`);
  }

  return data?.[0] ?? null;
}

async function processJob(job) {
  await updateJobStatus(job.id, 'running', {
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
    result: null,
  });
  await logJob(job.id, 'info', 'Job started');

  try {
    if (job.type === 'test') {
      await logJob(job.id, 'info', 'Test job received', job.payload ?? {});
      await sleep(1000);
      await logJob(job.id, 'success', 'Test job completed');
      await updateJobStatus(job.id, 'completed', {
        result: { ok: true },
        error: null,
        finished_at: new Date().toISOString(),
      });
      return;
    }

    if (job.type === 'recalculate_scores') {
      await logJob(job.id, 'info', 'Starting score recalculation...', job.payload ?? {});
      const result = await recalculateScores({
        logger: async (level, message, data) => {
          await logJob(job.id, level, message, data);
        },
      });
      await logJob(job.id, 'success', 'Score recalculation completed', result);
      await updateJobStatus(job.id, 'completed', {
        result,
        error: null,
        finished_at: new Date().toISOString(),
      });
      return;
    }

    const message = `Unknown admin job type: ${job.type}`;
    await logJob(job.id, 'warn', message);
    await updateJobStatus(job.id, 'failed', {
      error: message,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = formatError(error);
    try {
      await logJob(job.id, 'error', 'Job failed', { error: message });
    } finally {
      await updateJobStatus(job.id, 'failed', {
        error: message,
        finished_at: new Date().toISOString(),
      });
    }
  }
}

async function runOnce() {
  const job = await fetchNextQueuedJob();

  if (!job) {
    console.log(`[${new Date().toISOString()}] No queued admin jobs.`);
    return false;
  }

  console.log(`[${new Date().toISOString()}] Processing admin job ${job.id} (${job.type})`);
  await processJob(job);
  return true;
}

async function main() {
  const args = parseCliArgs();

  if (args.once) {
    await runOnce();
    return;
  }

  console.log(`Admin worker polling every ${args.intervalMs}ms. Press Ctrl+C to stop.`);
  while (true) {
    await runOnce();
    await sleep(args.intervalMs);
  }
}

main().catch((error) => {
  console.error('Admin worker failed:');
  console.error(formatError(error));
  process.exitCode = 1;
});
