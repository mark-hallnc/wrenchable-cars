import dotenv from 'dotenv';
import path from 'node:path';
import { formatError } from './lib/errors.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DEFAULT_IMPORT_LIMIT = 25;
const DEFAULT_MIN_RATE_LIMIT_REMAINING = 10;

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    limit: DEFAULT_IMPORT_LIMIT,
    minRateLimitRemaining: DEFAULT_MIN_RATE_LIMIT_REMAINING,
    skipImport: false,
    skipRecalculate: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      args.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_IMPORT_LIMIT;
    } else if (arg.startsWith('--minRateLimitRemaining=')) {
      const value = Number(arg.slice('--minRateLimitRemaining='.length));
      args.minRateLimitRemaining = Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : DEFAULT_MIN_RATE_LIMIT_REMAINING;
    } else if (arg === '--skip-import') {
      args.skipImport = true;
    } else if (arg === '--skip-recalculate') {
      args.skipRecalculate = true;
    }
  }

  return args;
}

function validateEnvironment() {
  const requiredVariables = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OLP_API_KEY',
  ];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variables in .env.local: ${missingVariables.join(', ')}`);
  }
}

async function main() {
  const options = parseCliArgs();
  let importHadFailures = false;

  validateEnvironment();

  const [{ runOpenLaborQueue }, { recalculateScores }] = await Promise.all([
    import('./run-openlabor-queue.js'),
    import('./recalculate-wrenchability-scores.js'),
  ]);

  console.log('Starting Wrenchable Cars data process...');
  console.log(`Import limit: ${options.limit}`);
  console.log(`Minimum Open Labor daily rate limit remaining: ${options.minRateLimitRemaining}`);

  if (options.skipImport) {
    console.log('\nStep 1: Processing Open Labor queue... skipped');
  } else {
    console.log('\nStep 1: Processing Open Labor queue...');
    const importSummary = await runOpenLaborQueue({
      limit: options.limit,
      minRateLimitRemaining: options.minRateLimitRemaining,
      log: true,
    });

    console.log(`attempted: ${importSummary.attempted}`);
    console.log(`completed: ${importSummary.completed}`);
    console.log(`skipped: ${importSummary.skipped}`);
    console.log(`failed: ${importSummary.failed}`);
    importHadFailures = importSummary.failed > 0;
    if (importHadFailures) {
      console.error(`Raw import completed with failures: ${importSummary.failed} queue rows failed.`);
    }
    if (importSummary.stoppedEarly) {
      console.log(importSummary.stopReason);
    }
  }

  if (options.skipRecalculate) {
    console.log('\nStep 2: Recalculating Wrenchability scores... skipped');
  } else {
    console.log('\nStep 2: Recalculating Wrenchability scores...');
    let scoreSummary;

    try {
      scoreSummary = await recalculateScores({ log: false });
    } catch (error) {
      console.error('Imports completed, but score recalculation failed.');
      console.error(formatError(error));
      process.exitCode = 1;
      return;
    }

    console.log(`total labor estimates processed: ${scoreSummary.totalLaborEstimatesProcessed}`);
    console.log(`repair_scores upserted: ${scoreSummary.repairScoresUpserted}`);
    console.log(`vehicle_scores recalculated: ${scoreSummary.vehicleScoresRecalculated}`);
  }

  console.log('\nData process complete.');

  if (importHadFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Data process failed:');
  console.error(formatError(error));
  process.exitCode = 1;
});
