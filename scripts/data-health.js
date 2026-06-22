import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMON_OWNERSHIP_REPAIR_COUNT,
  COMMON_OWNERSHIP_REPAIR_SLUGS,
  isCommonOwnershipRepairSlug,
} from '../src/lib/commonRepairs.js';
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

const QUEUE_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed'];

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    limit: 10,
  };

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;

    const separatorIndex = arg.indexOf('=');
    const key = arg.slice(2, separatorIndex > -1 ? separatorIndex : undefined);
    const value = separatorIndex > -1 ? arg.slice(separatorIndex + 1) : 'true';

    if (key === 'json') {
      options.json = value !== 'false';
    } else if (key === 'limit') {
      const limit = Number(value);
      options.limit = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 10;
    } else if (key) {
      options[key] = value;
    }
  }

  return options;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function vehicleMatchesFilters(vehicle, filters) {
  if (filters.year && Number(vehicle.year) !== Number(filters.year)) return false;
  if (filters.make && String(vehicle.make).toLowerCase() !== String(filters.make).toLowerCase()) return false;
  if (filters.model && String(vehicle.model).toLowerCase() !== String(filters.model).toLowerCase()) return false;

  return true;
}

function getVehicleIssueExample(vehicle, issue, extra = {}) {
  return {
    year: vehicle?.year ?? null,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    engine: vehicle?.engine ?? null,
    source_engine_slug: vehicle?.source_engine_slug ?? null,
    issue,
    ...extra,
  };
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getDuplicateKeys(rows, getKey) {
  const counts = new Map();

  for (const row of rows) {
    incrementMap(counts, getKey(row));
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function countDuplicateRows(rows, getKey) {
  const duplicateKeys = getDuplicateKeys(rows, getKey);

  return rows.filter((row) => duplicateKeys.has(getKey(row))).length;
}

function selectExampleRows(rows, limit) {
  return rows.slice(0, limit);
}

function applyVehicleFilters(query, filters) {
  let nextQuery = query;

  if (filters.year) nextQuery = nextQuery.eq('year', Number(filters.year));
  if (filters.make) nextQuery = nextQuery.ilike('make', filters.make);
  if (filters.model) nextQuery = nextQuery.ilike('model', filters.model);

  return nextQuery;
}

async function countRows(tableName, filters = {}) {
  const baseQuery = supabase.from(tableName).select('id', { count: 'exact', head: true });
  const query = tableName === 'vehicles' ? applyVehicleFilters(baseQuery, filters) : baseQuery;
  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count ${tableName}: ${formatSupabaseError(error)}`);
  }

  return count ?? 0;
}

async function selectAllRows(tableName, selectColumns, filters = {}) {
  const pageSize = 1000;
  const rows = [];
  let start = 0;

  while (true) {
    let query = supabase
      .from(tableName)
      .select(selectColumns);

    query = query.order('id', { ascending: true });

    query = query.range(start, start + pageSize - 1);

    if (tableName === 'vehicles') {
      query = applyVehicleFilters(query, filters);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to load ${tableName}: ${formatSupabaseError(error)}`);
    }

    const pageRows = data ?? [];
    if (pageRows.length === 0) break;

    rows.push(...pageRows);
    start += pageRows.length;
  }

  return rows;
}

function buildCoverageBucketCounts(commonCountsByVehicleId, vehicles) {
  const buckets = {
    '0': 0,
    '1-4': 0,
    '5-9': 0,
    '10-15': 0,
    [`16-${COMMON_OWNERSHIP_REPAIR_COUNT}`]: 0,
  };

  for (const vehicle of vehicles) {
    const count = commonCountsByVehicleId.get(String(vehicle.id)) ?? 0;

    if (count === 0) buckets['0'] += 1;
    else if (count <= 4) buckets['1-4'] += 1;
    else if (count <= 9) buckets['5-9'] += 1;
    else if (count <= 15) buckets['10-15'] += 1;
    else buckets[`16-${COMMON_OWNERSHIP_REPAIR_COUNT}`] += 1;
  }

  return buckets;
}

function printSection(title) {
  console.log(`\n${title}`);
}

function printExamples(title, examples) {
  console.log(`${title}: ${examples.length}`);

  if (examples.length === 0) return;

  console.log('examples:');
  for (const example of examples) {
    console.log(
      `- ${example.year ?? 'unknown'} ${example.make ?? 'unknown'} ${example.model ?? 'unknown'} ${example.engine ?? 'Base / unspecified engine'} ${example.source_engine_slug ?? 'no source_engine_slug'}; ${example.issue}`,
    );
  }
}

function printReport(report) {
  console.log('Wrenchable Cars data health');

  printSection('Vehicle counts');
  console.log(`total vehicles: ${report.vehicleCounts.total}`);
  console.log(`engine-specific vehicles: ${report.vehicleCounts.engineSpecific}`);
  console.log(`generic vehicles: ${report.vehicleCounts.generic}`);

  printSection('Queue status');
  for (const status of QUEUE_STATUSES) {
    console.log(`${status}: ${report.queueStatus[status] ?? 0}`);
  }

  printSection('Score health');
  console.log(`vehicles missing vehicle_scores: ${report.scoreHealth.vehiclesMissingVehicleScores}`);
  console.log(`missing score but has common ownership repair scores: ${report.scoreHealth.missingScoreWithCommonOwnershipRepairScores}`);
  console.log(`missing score and has zero common ownership repair scores: ${report.scoreHealth.missingScoreWithZeroCommonOwnershipRepairScores}`);
  console.log(`missing score on generic/base vehicle rows: ${report.scoreHealth.missingScoreGenericBaseVehicles}`);
  console.log(`missing score on engine-specific vehicle rows: ${report.scoreHealth.missingScoreEngineSpecificVehicles}`);
  console.log(`vehicles with repair_scores but missing vehicle_scores: ${report.scoreHealth.vehiclesWithRepairScoresMissingVehicleScores}`);
  console.log(`vehicles with common ownership repair scores but missing vehicle_scores: ${report.scoreHealth.vehiclesWithCommonScoresMissingVehicleScores}`);
  console.log(`scored vehicles with zero repair_scores: ${report.scoreHealth.scoredVehiclesWithZeroRepairScores}`);

  printSection('Common repair coverage');
  for (const [bucket, count] of Object.entries(report.commonRepairCoverage)) {
    console.log(`${bucket} common repairs: ${count}`);
  }

  printSection('Duplicate checks');
  console.log(`duplicate vehicles by year/make/model/source_engine_slug: ${report.duplicates.vehicles}`);
  console.log(`duplicate repair_scores by vehicle_id + repair_task_id: ${report.duplicates.repairScores}`);
  console.log(`duplicate labor_estimates by vehicle_id + repair_task_id: ${report.duplicates.laborEstimates}`);

  printSection('Possible common repair aliases not currently counted');
  if (report.possibleCommonRepairAliases.length === 0) {
    console.log('none found');
  } else {
    for (const alias of report.possibleCommonRepairAliases) {
      console.log(
        `- ${alias.source_job_slug}: ${alias.name}; possible match: ${alias.possible_common_slug}; repair_scores: ${alias.repair_score_count}`,
      );
    }
  }

  printSection('Problem examples');
  for (const [title, examples] of Object.entries(report.examples)) {
    printExamples(title, examples);
  }
}

async function buildHealthReport(options) {
  const limit = options.limit;
  const [
    vehicles,
    vehicleScores,
    repairTasks,
    queueRows,
    totalVehicleCount,
  ] = await Promise.all([
    selectAllRows('vehicles', 'id, year, make, model, engine, source_engine_slug', options),
    selectAllRows('vehicle_scores', 'id, vehicle_id'),
    selectAllRows('repair_tasks', 'id, name, source_job_slug'),
    selectAllRows('openlabor_import_queue', 'id, status'),
    countRows('vehicles', options),
  ]);
  const repairScores = await selectAllRows('repair_scores', 'id, vehicle_id, repair_task_id, wrenchability_score');
  const laborEstimates = await selectAllRows('labor_estimates', 'id, vehicle_id, repair_task_id');

  const filteredVehicleIds = new Set(vehicles.map((vehicle) => String(vehicle.id)));
  const vehicleScoresByVehicleId = new Set(vehicleScores.map((score) => String(score.vehicle_id)));
  const repairScoresByVehicleId = new Set(repairScores.map((score) => String(score.vehicle_id)));
  const vehiclesById = new Map(vehicles.map((vehicle) => [String(vehicle.id), vehicle]));
  const repairTasksById = new Map(repairTasks.map((task) => [task.id, task]));
  const commonCountsByVehicleId = new Map();
  const repairScoreCountsByVehicleId = new Map();

  for (const repairScore of repairScores) {
    const vehicleId = String(repairScore.vehicle_id);
    if (!filteredVehicleIds.has(vehicleId)) continue;

    incrementMap(repairScoreCountsByVehicleId, vehicleId);

    const task = repairTasksById.get(repairScore.repair_task_id);
    const score = Number(repairScore.wrenchability_score);

    if (isCommonOwnershipRepairSlug(task?.source_job_slug) && Number.isFinite(score)) {
      incrementMap(commonCountsByVehicleId, vehicleId);
    }
  }

  const engineSpecificVehicles = vehicles.filter(
    (vehicle) => hasText(vehicle.engine) || hasText(vehicle.source_engine_slug),
  );
  const genericVehicles = vehicles.filter(
    (vehicle) => !hasText(vehicle.engine) && !hasText(vehicle.source_engine_slug),
  );
  const missingVehicleScores = vehicles.filter((vehicle) => !vehicleScoresByVehicleId.has(String(vehicle.id)));
  const vehiclesWithRepairScoresMissingVehicleScores = missingVehicleScores.filter((vehicle) =>
    repairScoresByVehicleId.has(String(vehicle.id)),
  );
  const vehiclesWithCommonScoresMissingVehicleScores = missingVehicleScores.filter((vehicle) =>
    (commonCountsByVehicleId.get(String(vehicle.id)) ?? 0) > 0,
  );
  const missingScoreWithZeroCommonOwnershipRepairScores = missingVehicleScores.filter((vehicle) =>
    (commonCountsByVehicleId.get(String(vehicle.id)) ?? 0) === 0,
  );
  const missingScoreGenericBaseVehicles = missingVehicleScores.filter((vehicle) =>
    !hasText(vehicle.source_engine_slug),
  );
  const missingScoreEngineSpecificVehicles = missingVehicleScores.filter((vehicle) =>
    hasText(vehicle.source_engine_slug),
  );
  const scoredVehiclesWithZeroRepairScores = vehicleScores
    .filter((score) => filteredVehicleIds.has(String(score.vehicle_id)))
    .filter((score) => !repairScoresByVehicleId.has(String(score.vehicle_id)))
    .map((score) => vehiclesById.get(String(score.vehicle_id)))
    .filter(Boolean);

  const queueStatus = Object.fromEntries(QUEUE_STATUSES.map((status) => [status, 0]));
  for (const row of queueRows) {
    const status = row.status ?? 'unknown';
    queueStatus[status] = (queueStatus[status] ?? 0) + 1;
  }

  const vehicleDuplicateKey = (row) =>
    `${row.year}|${String(row.make).toLowerCase()}|${String(row.model).toLowerCase()}|${String(row.source_engine_slug ?? '').toLowerCase()}`;
  const duplicateVehicleKeys = getDuplicateKeys(vehicles, vehicleDuplicateKey);
  const duplicateVehicleRows = vehicles.filter((vehicle) => duplicateVehicleKeys.has(vehicleDuplicateKey(vehicle)));
  const duplicateRepairScoreCount = countDuplicateRows(
    repairScores.filter((row) => filteredVehicleIds.has(String(row.vehicle_id))),
    (row) => `${row.vehicle_id}|${row.repair_task_id}`,
  );
  const duplicateRepairScoreKeys = getDuplicateKeys(
    repairScores.filter((row) => filteredVehicleIds.has(String(row.vehicle_id))),
    (row) => `${row.vehicle_id}|${row.repair_task_id}`,
  );
  const duplicateLaborEstimateCount = countDuplicateRows(
    laborEstimates.filter((row) => filteredVehicleIds.has(String(row.vehicle_id))),
    (row) => `${row.vehicle_id}|${row.repair_task_id}`,
  );
  const duplicateLaborEstimateKeys = getDuplicateKeys(
    laborEstimates.filter((row) => filteredVehicleIds.has(String(row.vehicle_id))),
    (row) => `${row.vehicle_id}|${row.repair_task_id}`,
  );
  const repairScoreCountsByRepairTaskId = new Map();

  for (const repairScore of repairScores) {
    if (!filteredVehicleIds.has(String(repairScore.vehicle_id))) continue;
    incrementMap(repairScoreCountsByRepairTaskId, repairScore.repair_task_id);
  }

  const canonicalizeCommonAlias = (value) =>
    normalizeText(value)
      .replace(/headlamp/g, 'headlight')
      .replace(/taillight/g, 'tail-light')
      .replace(/tail-lamp/g, 'tail-light')
      .split('-')
      .filter(Boolean)
      .map((token) => (token.endsWith('s') ? token.slice(0, -1) : token))
      .filter((token) => token !== 'all')
      .join('-');
  const canonicalCommonSlugs = new Map(
    COMMON_OWNERSHIP_REPAIR_SLUGS.map((slug) => [canonicalizeCommonAlias(slug), slug]),
  );
  const possibleCommonRepairAliases = repairTasks
    .filter((task) => !isCommonOwnershipRepairSlug(task.source_job_slug))
    .map((task) => {
      const slug = normalizeText(task.source_job_slug);
      const name = normalizeText(task.name);
      const possibleMatch =
        canonicalCommonSlugs.get(canonicalizeCommonAlias(slug)) ??
        canonicalCommonSlugs.get(canonicalizeCommonAlias(name.replace(/\s+/g, '-')));

      return possibleMatch
        ? {
            source_job_slug: task.source_job_slug,
            name: task.name,
            possible_common_slug: possibleMatch,
            repair_score_count: repairScoreCountsByRepairTaskId.get(task.id) ?? 0,
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.repair_score_count - left.repair_score_count ||
      String(left.source_job_slug).localeCompare(String(right.source_job_slug)),
    )
    .slice(0, limit);

  return {
    filters: {
      year: options.year ?? null,
      make: options.make ?? null,
      model: options.model ?? null,
    },
    vehicleCounts: {
      total: totalVehicleCount,
      engineSpecific: engineSpecificVehicles.length,
      generic: genericVehicles.length,
    },
    queueStatus,
    scoreHealth: {
      vehiclesMissingVehicleScores: missingVehicleScores.length,
      missingScoreWithCommonOwnershipRepairScores: vehiclesWithCommonScoresMissingVehicleScores.length,
      missingScoreWithZeroCommonOwnershipRepairScores: missingScoreWithZeroCommonOwnershipRepairScores.length,
      missingScoreGenericBaseVehicles: missingScoreGenericBaseVehicles.length,
      missingScoreEngineSpecificVehicles: missingScoreEngineSpecificVehicles.length,
      vehiclesWithRepairScoresMissingVehicleScores: vehiclesWithRepairScoresMissingVehicleScores.length,
      vehiclesWithCommonScoresMissingVehicleScores: vehiclesWithCommonScoresMissingVehicleScores.length,
      scoredVehiclesWithZeroRepairScores: scoredVehiclesWithZeroRepairScores.length,
    },
    commonRepairCoverage: buildCoverageBucketCounts(commonCountsByVehicleId, vehicles),
    duplicates: {
      vehicles: duplicateVehicleRows.length,
      repairScores: duplicateRepairScoreCount,
      laborEstimates: duplicateLaborEstimateCount,
    },
    possibleCommonRepairAliases,
    examples: {
      vehiclesMissingVehicleScores: selectExampleRows(
        missingVehicleScores.map((vehicle) => getVehicleIssueExample(vehicle, 'missing vehicle_scores row')),
        limit,
      ),
      vehiclesWithRepairScoresMissingVehicleScores: selectExampleRows(
        vehiclesWithRepairScoresMissingVehicleScores.map((vehicle) =>
          getVehicleIssueExample(vehicle, 'has repair_scores but missing vehicle_scores', {
            repair_score_count: repairScoreCountsByVehicleId.get(String(vehicle.id)) ?? 0,
            common_repair_count: commonCountsByVehicleId.get(String(vehicle.id)) ?? 0,
          }),
        ),
        limit,
      ),
      vehiclesWithCommonScoresMissingVehicleScores: selectExampleRows(
        vehiclesWithCommonScoresMissingVehicleScores.map((vehicle) =>
          getVehicleIssueExample(vehicle, 'has common ownership repair scores but missing vehicle_scores', {
            common_repair_count: commonCountsByVehicleId.get(String(vehicle.id)) ?? 0,
          }),
        ),
        limit,
      ),
      missingScoreWithZeroCommonOwnershipRepairScores: selectExampleRows(
        missingScoreWithZeroCommonOwnershipRepairScores.map((vehicle) =>
          getVehicleIssueExample(vehicle, 'missing vehicle_scores and has zero common ownership repair scores', {
            repair_score_count: repairScoreCountsByVehicleId.get(String(vehicle.id)) ?? 0,
            common_repair_count: commonCountsByVehicleId.get(String(vehicle.id)) ?? 0,
          }),
        ),
        limit,
      ),
      missingScoreGenericBaseVehicles: selectExampleRows(
        missingScoreGenericBaseVehicles.map((vehicle) =>
          getVehicleIssueExample(vehicle, 'generic/base vehicle row missing vehicle_scores', {
            repair_score_count: repairScoreCountsByVehicleId.get(String(vehicle.id)) ?? 0,
            common_repair_count: commonCountsByVehicleId.get(String(vehicle.id)) ?? 0,
          }),
        ),
        limit,
      ),
      missingScoreEngineSpecificVehicles: selectExampleRows(
        missingScoreEngineSpecificVehicles.map((vehicle) =>
          getVehicleIssueExample(vehicle, 'engine-specific vehicle row missing vehicle_scores', {
            repair_score_count: repairScoreCountsByVehicleId.get(String(vehicle.id)) ?? 0,
            common_repair_count: commonCountsByVehicleId.get(String(vehicle.id)) ?? 0,
          }),
        ),
        limit,
      ),
      scoredVehiclesWithZeroRepairScores: selectExampleRows(
        scoredVehiclesWithZeroRepairScores.map((vehicle) => getVehicleIssueExample(vehicle, 'has vehicle_scores but zero repair_scores')),
        limit,
      ),
      duplicateVehicles: selectExampleRows(
        duplicateVehicleRows.map((vehicle) => getVehicleIssueExample(vehicle, 'duplicate year/make/model/source_engine_slug')),
        limit,
      ),
      duplicateRepairScores: selectExampleRows(
        repairScores
          .filter((row) => duplicateRepairScoreKeys.has(`${row.vehicle_id}|${row.repair_task_id}`))
          .map((row) =>
            getVehicleIssueExample(
              vehiclesById.get(String(row.vehicle_id)),
              `duplicate repair_scores for vehicle_id + repair_task_id (${row.vehicle_id}, ${row.repair_task_id})`,
            ),
          ),
        limit,
      ),
      duplicateLaborEstimates: selectExampleRows(
        laborEstimates
          .filter((row) => duplicateLaborEstimateKeys.has(`${row.vehicle_id}|${row.repair_task_id}`))
          .map((row) =>
            getVehicleIssueExample(
              vehiclesById.get(String(row.vehicle_id)),
              `duplicate labor_estimates for vehicle_id + repair_task_id (${row.vehicle_id}, ${row.repair_task_id})`,
            ),
          ),
        limit,
      ),
    },
  };
}

async function emitDataHealthLogs(report, logger) {
  if (!logger) return;

  await logger('info', 'Data health report started');
  await logger(
    report.scoreHealth.vehiclesMissingVehicleScores > 0 ? 'warn' : 'info',
    `Vehicles missing vehicle_scores: ${report.scoreHealth.vehiclesMissingVehicleScores}`,
    { vehiclesMissingVehicleScores: report.scoreHealth.vehiclesMissingVehicleScores },
  );
  await logger(
    report.scoreHealth.missingScoreWithCommonOwnershipRepairScores > 0 ? 'warn' : 'info',
    `Missing score but has common ownership repair scores: ${report.scoreHealth.missingScoreWithCommonOwnershipRepairScores}`,
    {
      missingScoreWithCommonOwnershipRepairScores:
        report.scoreHealth.missingScoreWithCommonOwnershipRepairScores,
    },
  );
  await logger(
    report.duplicates.vehicles > 0 ? 'warn' : 'info',
    `Duplicate vehicles: ${report.duplicates.vehicles}`,
    { duplicateVehicles: report.duplicates.vehicles },
  );
  await logger(
    report.duplicates.repairScores > 0 ? 'warn' : 'info',
    `Duplicate repair_scores: ${report.duplicates.repairScores}`,
    { duplicateRepairScores: report.duplicates.repairScores },
  );
  await logger(
    report.duplicates.laborEstimates > 0 ? 'warn' : 'info',
    `Duplicate labor_estimates: ${report.duplicates.laborEstimates}`,
    { duplicateLaborEstimates: report.duplicates.laborEstimates },
  );

  const highCoverageBucket = `${COMMON_OWNERSHIP_REPAIR_COUNT - 4}-${COMMON_OWNERSHIP_REPAIR_COUNT}`;
  await logger('info', `${highCoverageBucket} common repairs: ${report.commonRepairCoverage[highCoverageBucket] ?? 0}`, {
    bucket: highCoverageBucket,
    count: report.commonRepairCoverage[highCoverageBucket] ?? 0,
  });
  await logger('success', 'Health report complete', report);
}

export async function getDataHealth({ logger = null, limit = 10, ...options } = {}) {
  const report = await buildHealthReport({ ...options, limit });
  const result = {
    ...report,
    duplicateChecks: report.duplicates,
    problemExamples: report.examples,
    possibleCommonRepairAliasesNotCurrentlyCounted: report.possibleCommonRepairAliases,
  };

  await emitDataHealthLogs(result, logger);

  return result;
}

async function main() {
  const options = parseCliArgs();
  const report = await getDataHealth(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report);
}

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  main().catch((error) => {
    console.error('Data health failed:');
    console.error(formatError(error));
    process.exitCode = 1;
  });
}
