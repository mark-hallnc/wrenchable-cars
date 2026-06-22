import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommonOwnershipRepairSlug } from '../src/lib/commonRepairs.js';

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

// Service role key is used only in local/server-side scripts. Never expose this in React/browser code.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const KNOWN_QUEUE_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed'];

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getVehicleConfiguration(vehicle) {
  if (hasText(vehicle.engine)) {
    return vehicle.engine.trim();
  }

  if (hasText(vehicle.source_engine_slug)) {
    return vehicle.source_engine_slug.trim();
  }

  return 'Base / unspecified engine';
}

function getVehicleLine(vehicle) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model} ${getVehicleConfiguration(vehicle)}`;
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getTopEntries(map, limit = 10) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

async function selectAllRows(tableName, selectColumns) {
  const pageSize = 1000;
  const rows = [];
  let start = 0;

  while (true) {
    let query = supabase
      .from(tableName)
      .select(selectColumns);

    query = query.order('id', { ascending: true });

    const { data, error } = await query.range(start, start + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${tableName}: ${error.message}`);
    }

    const pageRows = data ?? [];
    if (pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);
    start += pageRows.length;
  }

  return rows;
}

function printSection(title) {
  console.log(`\n${title}`);
}

function printExamples(rows) {
  if (rows.length === 0) {
    console.log('examples: none');
    return;
  }

  console.log('examples:');
  for (const row of rows.slice(0, 10)) {
    console.log(`- ${getVehicleLine(row)}`);
  }
}

function getVehicleExample(vehicle) {
  return {
    id: vehicle?.id ?? null,
    year: vehicle?.year ?? null,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    engine: vehicle ? getVehicleConfiguration(vehicle) : null,
  };
}

function printDataStatusReport(report) {
  console.log('Wrenchable Cars data status');

  printSection('Counts');
  console.log(`total vehicles: ${report.counts.totalVehicles}`);
  console.log(`engine-specific vehicles: ${report.counts.engineSpecificVehicles}`);
  console.log(`generic vehicles: ${report.counts.genericVehicles}`);
  console.log(`vehicle_scores: ${report.counts.vehicleScores}`);
  console.log(`repair_scores: ${report.counts.repairScores}`);
  console.log(`labor_estimates: ${report.counts.laborEstimates}`);
  console.log(`repair_tasks: ${report.counts.repairTasks}`);
  console.log(`openlabor_import_queue: ${report.counts.openlaborImportQueue}`);

  printSection('Queue status');
  for (const status of KNOWN_QUEUE_STATUSES) {
    console.log(`${status}: ${report.queueStatus[status] ?? 0}`);
  }

  printSection('Vehicles missing scores');
  console.log(`count: ${report.vehiclesMissingScores.count}`);
  console.log(`with exact common repair scores: ${report.vehiclesMissingScores.withExactCommonRepairScores}`);
  console.log(`with zero exact common repair scores: ${report.vehiclesMissingScores.withZeroExactCommonRepairScores}`);
  printExamples(report.vehiclesMissingScores.exampleVehicles);

  printSection('Scored vehicles with zero repair scores');
  console.log(`count: ${report.scoredVehiclesWithZeroRepairScores.count}`);
  printExamples(report.scoredVehiclesWithZeroRepairScores.exampleVehicles);

  printSection('Top make/model groups');
  for (const entry of report.topMakeModelGroups) {
    console.log(`${entry.group}: ${entry.count}`);
  }

  printSection('Top year/make/model engine variant groups');
  for (const entry of report.topYearMakeModelEngineVariantGroups) {
    console.log(`${entry.group}: ${entry.variantCount} variants`);
  }

  printSection('Recommendation');
  console.log(report.recommendation);
}

async function emitDataStatusLogs(report, logger) {
  if (!logger) return;

  await logger('info', 'Data status report started');
  await logger('info', `Total vehicles: ${report.counts.totalVehicles}`, { totalVehicles: report.counts.totalVehicles });
  await logger('info', `Vehicle scores: ${report.counts.vehicleScores}`, { vehicleScores: report.counts.vehicleScores });

  const pendingQueueRows = report.queueStatus.pending ?? 0;
  const failedQueueRows = report.queueStatus.failed ?? 0;
  await logger(pendingQueueRows > 0 ? 'warn' : 'info', `Pending queue rows: ${pendingQueueRows}`, { pendingQueueRows });
  await logger(failedQueueRows > 0 ? 'warn' : 'info', `Failed queue rows: ${failedQueueRows}`, { failedQueueRows });

  await logger(
    report.vehiclesMissingScores.count > 0 ? 'warn' : 'info',
    `Vehicles missing scores: ${report.vehiclesMissingScores.count}`,
    { vehiclesMissingScores: report.vehiclesMissingScores.count },
  );
  await logger('info', `Recommendation: ${report.recommendation}`, { recommendation: report.recommendation });
  await logger('success', 'Data status report complete', report);
}

export async function getDataStatus({ logger = null, limit = 10 } = {}) {
  const [
    vehicles,
    vehicleScores,
    repairScores,
    laborEstimates,
    repairTasks,
    queueRows,
  ] = await Promise.all([
    selectAllRows('vehicles', 'id, year, make, model, engine, source_engine_slug'),
    selectAllRows('vehicle_scores', 'id, vehicle_id'),
    selectAllRows('repair_scores', 'id, vehicle_id, repair_task_id, wrenchability_score'),
    selectAllRows('labor_estimates', 'id'),
    selectAllRows('repair_tasks', 'id, source_job_slug'),
    selectAllRows('openlabor_import_queue', 'id, status'),
  ]);

  const vehicleScoresByVehicleId = new Set(vehicleScores.map((score) => score.vehicle_id));
  const repairScoresByVehicleId = new Set(repairScores.map((score) => score.vehicle_id));
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const repairTasksById = new Map(repairTasks.map((task) => [task.id, task]));
  const exactCommonScoreCountsByVehicleId = new Map();

  for (const repairScore of repairScores) {
    const task = repairTasksById.get(repairScore.repair_task_id);
    const score = Number(repairScore.wrenchability_score);

    if (isCommonOwnershipRepairSlug(task?.source_job_slug) && Number.isFinite(score)) {
      incrementMap(exactCommonScoreCountsByVehicleId, repairScore.vehicle_id);
    }
  }

  const engineSpecificVehicles = vehicles.filter(
    (vehicle) => hasText(vehicle.engine) || hasText(vehicle.source_engine_slug),
  );
  const genericVehicles = vehicles.filter(
    (vehicle) => !hasText(vehicle.engine) && !hasText(vehicle.source_engine_slug),
  );

  const missingScoreVehicles = vehicles.filter((vehicle) => !vehicleScoresByVehicleId.has(vehicle.id));
  const missingScoreVehiclesWithExactCommonScores = missingScoreVehicles.filter((vehicle) =>
    (exactCommonScoreCountsByVehicleId.get(vehicle.id) ?? 0) > 0,
  );
  const missingScoreVehiclesWithZeroExactCommonScores = missingScoreVehicles.filter((vehicle) =>
    (exactCommonScoreCountsByVehicleId.get(vehicle.id) ?? 0) === 0,
  );
  const scoredVehiclesWithoutRepairScores = vehicleScores
    .filter((score) => !repairScoresByVehicleId.has(score.vehicle_id))
    .map((score) => vehiclesById.get(score.vehicle_id))
    .filter(Boolean);

  const queueStatusCounts = new Map(KNOWN_QUEUE_STATUSES.map((status) => [status, 0]));
  for (const row of queueRows) {
    incrementMap(queueStatusCounts, row.status ?? 'unknown');
  }

  const makeModelCounts = new Map();
  const variantsByYearMakeModel = new Map();

  for (const vehicle of vehicles) {
    incrementMap(makeModelCounts, `${vehicle.make} ${vehicle.model}`);

    const groupKey = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    if (!variantsByYearMakeModel.has(groupKey)) {
      variantsByYearMakeModel.set(groupKey, new Set());
    }

    variantsByYearMakeModel.get(groupKey).add(getVehicleConfiguration(vehicle).toLowerCase());
  }

  const variantCounts = new Map(
    [...variantsByYearMakeModel.entries()].map(([group, variants]) => [group, variants.size]),
  );

  const pendingQueueRows = queueStatusCounts.get('pending') ?? 0;
  let recommendation;

  if (pendingQueueRows > 0) {
    recommendation = 'Next: npm.cmd run data:process -- --limit=25';
  } else if (missingScoreVehiclesWithExactCommonScores.length > 0) {
    recommendation = 'Next: npm.cmd run recalculate:scores';
  } else if (missingScoreVehicles.length > 0) {
    recommendation = 'Database looks ready for frontend testing. Remaining missing scores have zero exact common repair scores.';
  } else {
    recommendation = 'Database looks ready for frontend testing.';
  }

  const report = {
    counts: {
      totalVehicles: vehicles.length,
      engineSpecificVehicles: engineSpecificVehicles.length,
      genericVehicles: genericVehicles.length,
      vehicleScores: vehicleScores.length,
      repairScores: repairScores.length,
      laborEstimates: laborEstimates.length,
      repairTasks: repairTasks.length,
      openlaborImportQueue: queueRows.length,
    },
    queueStatus: Object.fromEntries(queueStatusCounts.entries()),
    vehiclesMissingScores: {
      count: missingScoreVehicles.length,
      withExactCommonRepairScores: missingScoreVehiclesWithExactCommonScores.length,
      withZeroExactCommonRepairScores: missingScoreVehiclesWithZeroExactCommonScores.length,
      examples: missingScoreVehicles.slice(0, limit).map(getVehicleExample),
      exampleVehicles: missingScoreVehicles.slice(0, limit),
    },
    scoredVehiclesWithZeroRepairScores: {
      count: scoredVehiclesWithoutRepairScores.length,
      examples: scoredVehiclesWithoutRepairScores.slice(0, limit).map(getVehicleExample),
      exampleVehicles: scoredVehiclesWithoutRepairScores.slice(0, limit),
    },
    topMakeModelGroups: getTopEntries(makeModelCounts, limit).map(([group, count]) => ({ group, count })),
    topYearMakeModelEngineVariantGroups: getTopEntries(variantCounts, limit).map(([group, variantCount]) => ({
      group,
      variantCount,
    })),
    recommendation,
  };

  await emitDataStatusLogs(report, logger);

  return report;
}

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  getDataStatus().then(printDataStatusReport).catch((error) => {
    console.error(`Data status failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
