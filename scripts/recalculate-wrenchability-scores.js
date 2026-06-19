import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRepairExplanation,
  buildVehicleVerdict,
  scoreFromHours,
  scoreLabelFromScore,
  vehicleScoreLabelFromScore,
} from './lib/scoring.js';
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

// Service role key is used only in local/server-side scripts. Never expose this in React/browser code.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const TARGET_OWNERSHIP_REPAIR_SLUGS = new Set([
  'headlight-bulb',
  'water-pump',
  'alternator',
  'starter',
  'brake-pads-front',
  'brake-pads-rear',
  'battery',
  'spark-plugs',
  'ignition-coils-all',
  'thermostat',
  'radiator',
  'serpentine-belt',
  'serpentine-belt-tensioner',
  'headlight-assembly',
  'tail-light-bulb',
  'wheel-bearing-front',
  'strut-assembly-front',
  'lower-control-arm-front',
  'fuel-pump',
  'blower-motor',
]);

function nowIso() {
  return new Date().toISOString();
}

function scoreFromRelativePercentile(percentile) {
  if (percentile >= 95) return 10;
  if (percentile >= 85) return 9;
  if (percentile >= 75) return 8;
  if (percentile >= 65) return 7;
  if (percentile >= 50) return 6;
  if (percentile >= 35) return 5;
  if (percentile >= 25) return 4;
  if (percentile >= 15) return 3;
  if (percentile >= 5) return 2;
  return 1;
}

function clampScore(score) {
  return Math.max(1, Math.min(score, 10));
}

function hybridRepairScore(hours, percentile) {
  const hoursScore = scoreFromHours(hours);

  if (percentile === null || percentile === undefined) {
    return hoursScore;
  }

  const relativeScore = scoreFromRelativePercentile(percentile);
  const weightedScore = Math.round((hoursScore * 0.7) + (relativeScore * 0.3));
  const boundedScore = Math.max(hoursScore - 2, Math.min(weightedScore, hoursScore + 2));

  return clampScore(boundedScore);
}

function roundPercentile(value) {
  return Number(value.toFixed(2));
}

async function selectAllRows(tableName, selectColumns, filters = []) {
  const pageSize = 1000;
  const rows = [];
  let start = 0;

  while (true) {
    let query = supabase.from(tableName).select(selectColumns).range(start, start + pageSize - 1);

    for (const filter of filters) {
      const { column, operator, value } = filter;

      if (operator === 'eq') {
        query = query.eq(column, value);
      } else if (operator === 'gt') {
        query = query.gt(column, value);
      } else if (operator === 'notNull') {
        query = query.not(column, 'is', null);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch ${tableName}: ${formatSupabaseError(error)}`);
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

async function upsertRowsInChunks(tableName, rows, onConflict, selectColumns, chunkSize = 100) {
  let upsertedCount = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict })
      .select(selectColumns);

    if (error) {
      throw new Error(`Failed to upsert ${tableName}: ${formatSupabaseError(error)}`);
    }

    upsertedCount += data?.length ?? 0;
  }

  return upsertedCount;
}

function getWeightedAverage(scores, repairTasksById) {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const score of scores) {
    const task = repairTasksById.get(score.repair_task_id);
    const weight = Number(task?.default_weight ?? 1.0);

    weightedTotal += Number(score.wrenchability_score) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return null;
  }

  return Number((weightedTotal / totalWeight).toFixed(2));
}

export async function recalculateScores(options = {}) {
  const log = options.log ?? true;
  const [laborEstimates, repairTasks, vehicles] = await Promise.all([
    selectAllRows(
      'labor_estimates',
      'id, vehicle_id, repair_task_id, labor_hours, source_operation_name, source_notes',
      [
        { column: 'source', operator: 'eq', value: 'openlabor' },
        { column: 'labor_hours', operator: 'notNull' },
        { column: 'labor_hours', operator: 'gt', value: 0 },
      ],
    ),
    selectAllRows('repair_tasks', 'id, name, category, source_job_slug, default_weight'),
    selectAllRows('vehicles', 'id, year, make, model, engine'),
  ]);

  const laborEstimatesByRepairTask = new Map();

  for (const laborEstimate of laborEstimates) {
    const key = laborEstimate.repair_task_id;

    if (!laborEstimatesByRepairTask.has(key)) {
      laborEstimatesByRepairTask.set(key, []);
    }

    laborEstimatesByRepairTask.get(key).push(laborEstimate);
  }

  const repairTasksById = new Map(repairTasks.map((task) => [task.id, task]));

  const timestamp = nowIso();
  const repairScoreRows = [];
  const repairTaskIdsScored = new Set();
  let relativeComparisonCount = 0;
  let fallbackBucketCount = 0;

  for (const [repairTaskId, taskEstimates] of laborEstimatesByRepairTask.entries()) {
    const sortedEstimates = [...taskEstimates].sort((left, right) => Number(left.labor_hours) - Number(right.labor_hours));
    const uniqueHours = [...new Set(sortedEstimates.map((estimate) => Number(estimate.labor_hours)))].sort((left, right) => left - right);
    const useRelativeComparison = sortedEstimates.length >= 3;

    repairTaskIdsScored.add(repairTaskId);

    for (const estimate of sortedEstimates) {
      let percentile = null;
      let wrenchabilityScore = null;

      if (useRelativeComparison) {
        const minHours = uniqueHours[0];
        const maxHours = uniqueHours[uniqueHours.length - 1];
        const hours = Number(estimate.labor_hours);

        if (uniqueHours.length === 1 || maxHours === minHours) {
          percentile = 100;
        } else {
          const uniqueIndex = uniqueHours.indexOf(hours);
          const scaledPercentile = 100 * (1 - uniqueIndex / (uniqueHours.length - 1));
          percentile = roundPercentile(scaledPercentile);
        }

        wrenchabilityScore = hybridRepairScore(estimate.labor_hours, percentile);
        relativeComparisonCount += 1;
      } else {
        wrenchabilityScore = hybridRepairScore(estimate.labor_hours, null);
        fallbackBucketCount += 1;
      }

      repairScoreRows.push({
        vehicle_id: estimate.vehicle_id,
        repair_task_id: estimate.repair_task_id,
        labor_hours: estimate.labor_hours,
        wrenchability_score: wrenchabilityScore,
        score_label: scoreLabelFromScore(wrenchabilityScore),
        percentile,
        explanation: buildRepairExplanation(estimate.labor_hours),
        calculated_at: timestamp,
      });
    }
  }

  const repairScoresUpserted = await upsertRowsInChunks(
    'repair_scores',
    repairScoreRows,
    'vehicle_id,repair_task_id',
    'id, vehicle_id, repair_task_id, labor_hours, wrenchability_score, score_label, percentile, explanation, calculated_at',
  );

  const repairScoresByVehicleId = new Map();

  for (const row of repairScoreRows) {
    if (!repairScoresByVehicleId.has(row.vehicle_id)) {
      repairScoresByVehicleId.set(row.vehicle_id, []);
    }

    repairScoresByVehicleId.get(row.vehicle_id).push(row);
  }

  const targetRepairTaskIds = new Set(
    repairTasks.filter((task) => TARGET_OWNERSHIP_REPAIR_SLUGS.has(task.source_job_slug)).map((task) => task.id),
  );

  const vehicleScoreRows = [];

  for (const vehicle of vehicles) {
    const vehicleScores = repairScoresByVehicleId.get(vehicle.id) ?? [];

    if (vehicleScores.length === 0) {
      continue;
    }

    const targetRepairScores = vehicleScores.filter((score) => targetRepairTaskIds.has(score.repair_task_id));
    const selectedScores = targetRepairScores.length > 0 ? targetRepairScores : vehicleScores;
    const overallScore = getWeightedAverage(selectedScores, repairTasksById);

    if (overallScore === null) {
      continue;
    }

    vehicleScoreRows.push({
      vehicle_id: vehicle.id,
      overall_score: overallScore,
      score_label: vehicleScoreLabelFromScore(overallScore),
      verdict: buildVehicleVerdict(),
      calculated_at: timestamp,
    });
  }

  const vehicleScoresRecalculated = await upsertRowsInChunks(
    'vehicle_scores',
    vehicleScoreRows,
    'vehicle_id',
    'id, vehicle_id, overall_score, score_label, verdict, calculated_at',
  );

  const summary = {
    totalLaborEstimatesProcessed: laborEstimates.length,
    totalRepairTasksScored: repairTaskIdsScored.size,
    repairScoresUpserted,
    vehicleScoresRecalculated,
    relativeComparisonScores: relativeComparisonCount,
    fallbackBucketScores: fallbackBucketCount,
  };

  if (log) {
    console.log(`total labor estimates processed: ${summary.totalLaborEstimatesProcessed}`);
    console.log(`total repair tasks scored: ${summary.totalRepairTasksScored}`);
    console.log(`total repair_scores upserted: ${summary.repairScoresUpserted}`);
    console.log(`total vehicle_scores recalculated: ${summary.vehicleScoresRecalculated}`);
    console.log(`relative comparison scores: ${summary.relativeComparisonScores}`);
    console.log(`fallback bucket scores: ${summary.fallbackBucketScores}`);
  }

  return summary;
}

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  recalculateScores().catch((error) => {
    console.error('Recalculation failed:');
    console.error(formatError(error));
    process.exitCode = 1;
  });
}
