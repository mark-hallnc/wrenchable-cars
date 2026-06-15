import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

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
    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .range(start, start + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${tableName}: ${error.message}`);
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }

    start += pageSize;
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

async function main() {
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
    selectAllRows('repair_scores', 'id, vehicle_id'),
    selectAllRows('labor_estimates', 'id'),
    selectAllRows('repair_tasks', 'id'),
    selectAllRows('openlabor_import_queue', 'id, status'),
  ]);

  const vehicleScoresByVehicleId = new Set(vehicleScores.map((score) => score.vehicle_id));
  const repairScoresByVehicleId = new Set(repairScores.map((score) => score.vehicle_id));
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  const engineSpecificVehicles = vehicles.filter(
    (vehicle) => hasText(vehicle.engine) || hasText(vehicle.source_engine_slug),
  );
  const genericVehicles = vehicles.filter(
    (vehicle) => !hasText(vehicle.engine) && !hasText(vehicle.source_engine_slug),
  );

  const missingScoreVehicles = vehicles.filter((vehicle) => !vehicleScoresByVehicleId.has(vehicle.id));
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

  console.log('Wrenchable Cars data status');

  printSection('Counts');
  console.log(`total vehicles: ${vehicles.length}`);
  console.log(`engine-specific vehicles: ${engineSpecificVehicles.length}`);
  console.log(`generic vehicles: ${genericVehicles.length}`);
  console.log(`vehicle_scores: ${vehicleScores.length}`);
  console.log(`repair_scores: ${repairScores.length}`);
  console.log(`labor_estimates: ${laborEstimates.length}`);
  console.log(`repair_tasks: ${repairTasks.length}`);
  console.log(`openlabor_import_queue: ${queueRows.length}`);

  printSection('Queue status');
  for (const [status, count] of queueStatusCounts.entries()) {
    console.log(`${status}: ${count}`);
  }

  printSection('Vehicles missing scores');
  console.log(`count: ${missingScoreVehicles.length}`);
  printExamples(missingScoreVehicles);

  printSection('Scored vehicles with zero repair scores');
  console.log(`count: ${scoredVehiclesWithoutRepairScores.length}`);
  printExamples(scoredVehiclesWithoutRepairScores);

  printSection('Top make/model groups');
  for (const [group, count] of getTopEntries(makeModelCounts)) {
    console.log(`${group}: ${count}`);
  }

  printSection('Top year/make/model engine variant groups');
  for (const [group, count] of getTopEntries(variantCounts)) {
    console.log(`${group}: ${count} variants`);
  }

  printSection('Recommendation');
  const pendingQueueRows = queueStatusCounts.get('pending') ?? 0;

  if (pendingQueueRows > 0) {
    console.log('Next: npm.cmd run data:process -- --limit=25');
  } else if (missingScoreVehicles.length > 0) {
    console.log('Next: npm.cmd run recalculate:scores');
  } else {
    console.log('Database looks ready for frontend testing.');
  }
}

main().catch((error) => {
  console.error(`Data status failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
