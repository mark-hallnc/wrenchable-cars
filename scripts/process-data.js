import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DEFAULT_IMPORT_LIMIT = 25;

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    limit: DEFAULT_IMPORT_LIMIT,
    skipImport: false,
    skipRecalculate: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      args.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_IMPORT_LIMIT;
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

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const options = parseCliArgs();

  validateEnvironment();

  const [{ runOpenLaborQueue }, { recalculateScores }] = await Promise.all([
    import('./run-openlabor-queue.js'),
    import('./recalculate-wrenchability-scores.js'),
  ]);

  console.log('Starting Wrenchable Cars data process...');
  console.log(`Import limit: ${options.limit}`);

  if (options.skipImport) {
    console.log('\nStep 1: Processing Open Labor queue... skipped');
  } else {
    console.log('\nStep 1: Processing Open Labor queue...');
    const importSummary = await runOpenLaborQueue({ limit: options.limit, log: false });

    console.log(`attempted: ${importSummary.attempted}`);
    console.log(`completed: ${importSummary.completed}`);
    console.log(`skipped: ${importSummary.skipped}`);
    console.log(`failed: ${importSummary.failed}`);
  }

  if (options.skipRecalculate) {
    console.log('\nStep 2: Recalculating Wrenchability scores... skipped');
  } else {
    console.log('\nStep 2: Recalculating Wrenchability scores...');
    const scoreSummary = await recalculateScores({ log: false });

    console.log(`total labor estimates processed: ${scoreSummary.totalLaborEstimatesProcessed}`);
    console.log(`repair_scores upserted: ${scoreSummary.repairScoresUpserted}`);
    console.log(`vehicle_scores recalculated: ${scoreSummary.vehicleScoresRecalculated}`);
  }

  console.log('\nData process complete.');
}

main().catch((error) => {
  console.error(`Data process failed: ${formatError(error)}`);
  process.exitCode = 1;
});
