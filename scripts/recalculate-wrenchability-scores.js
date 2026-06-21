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
import {
  COMMON_OWNERSHIP_REPAIR_SLUGS,
  isCommonOwnershipRepairSlug,
} from '../src/lib/commonRepairs.js';

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

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;

    const separatorIndex = arg.indexOf('=');
    const key = arg.slice(2, separatorIndex > -1 ? separatorIndex : undefined);
    const value = separatorIndex > -1 ? arg.slice(separatorIndex + 1) : 'true';

    if (key) options[key] = value;
  }

  return options;
}

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
    let query = supabase
      .from(tableName)
      .select(selectColumns)
      .order('id', { ascending: true })
      .range(start, start + pageSize - 1);

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

async function deleteStaleVehicleScores(calculatedVehicleIds, validCommonScoresByVehicleId) {
  const existingRows = await selectAllRows('vehicle_scores', 'id, vehicle_id');
  const keepVehicleIds = new Set(calculatedVehicleIds);
  const staleIds = existingRows
    .filter((row) => {
      const vehicleId = String(row.vehicle_id);

      return !keepVehicleIds.has(vehicleId) && (validCommonScoresByVehicleId.get(vehicleId)?.length ?? 0) === 0;
    })
    .map((row) => row.id);
  const staleVehicleIds = new Set(
    existingRows
      .filter((row) => {
        const vehicleId = String(row.vehicle_id);

        return !keepVehicleIds.has(vehicleId) && (validCommonScoresByVehicleId.get(vehicleId)?.length ?? 0) === 0;
      })
      .map((row) => String(row.vehicle_id)),
  );
  let deletedCount = 0;

  for (let index = 0; index < staleIds.length; index += 100) {
    const chunk = staleIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from('vehicle_scores')
      .delete()
      .in('id', chunk)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete stale vehicle_scores: ${formatSupabaseError(error)}`);
    }

    deletedCount += data?.length ?? 0;
  }

  return { deletedCount, deletedVehicleIds: staleVehicleIds };
}

function getAverageScore(scores) {
  const validScores = scores
    .map((score) => Number(score.wrenchability_score))
    .filter(Number.isFinite);

  if (validScores.length === 0) return null;

  return Number((validScores.reduce((total, score) => total + score, 0) / validScores.length).toFixed(2));
}

function hasValidNumber(value) {
  return Number.isFinite(Number(value));
}

function dedupeByKey(rows, getKey, chooseWinner) {
  const dedupedRowsByKey = new Map();
  let duplicateCount = 0;

  for (const row of rows) {
    const key = getKey(row);

    if (!dedupedRowsByKey.has(key)) {
      dedupedRowsByKey.set(key, row);
      continue;
    }

    duplicateCount += 1;
    dedupedRowsByKey.set(key, chooseWinner(dedupedRowsByKey.get(key), row));
  }

  return {
    rows: [...dedupedRowsByKey.values()],
    duplicateCount,
  };
}

function chooseRepairScoreWinner(existingRow, nextRow) {
  const existingHasLaborHours = hasValidNumber(existingRow.labor_hours);
  const nextHasLaborHours = hasValidNumber(nextRow.labor_hours);

  if (existingHasLaborHours !== nextHasLaborHours) {
    return nextHasLaborHours ? nextRow : existingRow;
  }

  const existingHasScore = hasValidNumber(existingRow.wrenchability_score);
  const nextHasScore = hasValidNumber(nextRow.wrenchability_score);

  if (existingHasScore !== nextHasScore) {
    return nextHasScore ? nextRow : existingRow;
  }

  if (existingHasLaborHours && nextHasLaborHours) {
    return Number(nextRow.labor_hours) < Number(existingRow.labor_hours) ? nextRow : existingRow;
  }

  return existingRow;
}

function chooseLaborEstimateWinner(existingRow, nextRow) {
  const existingHasLaborHours = hasValidNumber(existingRow.labor_hours);
  const nextHasLaborHours = hasValidNumber(nextRow.labor_hours);

  if (existingHasLaborHours !== nextHasLaborHours) {
    return nextHasLaborHours ? nextRow : existingRow;
  }

  if (existingHasLaborHours && nextHasLaborHours) {
    return Number(nextRow.labor_hours) < Number(existingRow.labor_hours) ? nextRow : existingRow;
  }

  return String(nextRow.id).localeCompare(String(existingRow.id)) < 0 ? nextRow : existingRow;
}

function chooseVehicleScoreWinner(existingRow, nextRow) {
  const existingHasOverallScore = hasValidNumber(existingRow.overall_score);
  const nextHasOverallScore = hasValidNumber(nextRow.overall_score);

  if (existingHasOverallScore !== nextHasOverallScore) {
    return nextHasOverallScore ? nextRow : existingRow;
  }

  return nextRow;
}

function buildVehicleLabel(vehicle) {
  return [
    vehicle?.year,
    vehicle?.make,
    vehicle?.model,
    vehicle?.engine,
    vehicle?.source_engine_slug ? `(${vehicle.source_engine_slug})` : '',
  ].filter(Boolean).join(' ');
}

function printVehicleDebug(debugInfo) {
  if (!debugInfo) return;

  console.log('debug vehicle recalculation');
  console.log(`vehicle id: ${debugInfo.vehicleId}`);
  console.log(`vehicle: ${buildVehicleLabel(debugInfo.vehicle) || 'not found'}`);
  console.log(`source_engine_slug: ${debugInfo.vehicle?.source_engine_slug ?? 'none'}`);
  console.log(`total labor estimates found: ${debugInfo.totalLaborEstimatesFound}`);
  console.log(`total repair_scores found: ${debugInfo.totalRepairScoresFound}`);
  console.log(`exact common repair scores found: ${debugInfo.exactCommonRepairScoresFound}`);
  console.log(`exact common slugs found: ${debugInfo.exactCommonSlugsFound.join(', ') || 'none'}`);
  console.log(`expected common slugs missing: ${debugInfo.expectedCommonSlugsMissing.join(', ') || 'none'}`);
  console.log(`valid common repair scores used: ${debugInfo.validCommonRepairScoresUsed}`);
  console.log(`calculated overall_score: ${debugInfo.overallScore ?? 'none'}`);
  console.log(`calculated score_label: ${debugInfo.scoreLabel ?? 'none'}`);
  console.log(`vehicle_scores row prepared: ${debugInfo.rowPrepared ? 'yes' : 'no'}`);
  console.log(`vehicle_scores row upserted: ${debugInfo.rowUpserted ? 'yes' : 'no'}`);
  console.log(`considered stale/deleted: ${debugInfo.staleDeleted ? 'yes' : 'no'}`);
}

export async function recalculateScores(options = {}) {
  const log = options.log ?? true;
  const debugVehicleId = options.vehicleId ? String(options.vehicleId) : '';
  const [rawLaborEstimates, repairTasks, vehicles] = await Promise.all([
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
    selectAllRows('vehicles', 'id, year, make, model, engine, source_engine_slug'),
  ]);

  const dedupedLaborEstimates = dedupeByKey(
    rawLaborEstimates,
    (row) => `${row.vehicle_id}:${row.repair_task_id}`,
    chooseLaborEstimateWinner,
  );
  const laborEstimates = dedupedLaborEstimates.rows;
  const laborEstimatesByRepairTask = new Map();
  const laborEstimateCountByVehicleId = new Map();

  for (const laborEstimate of laborEstimates) {
    const key = laborEstimate.repair_task_id;

    if (!laborEstimatesByRepairTask.has(key)) {
      laborEstimatesByRepairTask.set(key, []);
    }

    laborEstimatesByRepairTask.get(key).push(laborEstimate);
    const vehicleId = String(laborEstimate.vehicle_id);
    laborEstimateCountByVehicleId.set(vehicleId, (laborEstimateCountByVehicleId.get(vehicleId) ?? 0) + 1);
  }

  const vehiclesById = new Map(vehicles.map((vehicle) => [String(vehicle.id), vehicle]));
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
      let wrenchabilityScore;

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

  const dedupedRepairScores = dedupeByKey(
    repairScoreRows,
    (row) => `${row.vehicle_id}:${row.repair_task_id}`,
    chooseRepairScoreWinner,
  );

  if (dedupedRepairScores.duplicateCount > 0) {
    console.warn(`Deduped repair_scores before upsert: ${dedupedRepairScores.duplicateCount} duplicate rows removed.`);
  }

  const repairScoresUpserted = await upsertRowsInChunks(
    'repair_scores',
    dedupedRepairScores.rows,
    'vehicle_id,repair_task_id',
    'id, vehicle_id, repair_task_id, labor_hours, wrenchability_score, score_label, percentile, explanation, calculated_at',
  );

  const repairScoresByVehicleId = new Map();
  const validCommonScoresByVehicleId = new Map();

  for (const row of dedupedRepairScores.rows) {
    const vehicleId = String(row.vehicle_id);

    if (!repairScoresByVehicleId.has(vehicleId)) {
      repairScoresByVehicleId.set(vehicleId, []);
    }

    repairScoresByVehicleId.get(vehicleId).push(row);
  }

  const targetRepairTaskIds = new Set(
    repairTasks.filter((task) => isCommonOwnershipRepairSlug(task.source_job_slug)).map((task) => task.id),
  );
  const vehicleScoreRows = [];

  for (const [vehicleId, vehicleScores] of repairScoresByVehicleId.entries()) {
    const selectedScores = vehicleScores.filter((score) =>
      targetRepairTaskIds.has(score.repair_task_id) && Number.isFinite(Number(score.wrenchability_score)),
    );
    validCommonScoresByVehicleId.set(vehicleId, selectedScores);

    const overallScore = getAverageScore(selectedScores);

    if (overallScore === null) {
      continue;
    }

    vehicleScoreRows.push({
      vehicle_id: vehicleId,
      overall_score: overallScore,
      score_label: vehicleScoreLabelFromScore(overallScore),
      verdict: buildVehicleVerdict(),
      calculated_at: timestamp,
    });
  }

  const dedupedVehicleScores = dedupeByKey(
    vehicleScoreRows,
    (row) => row.vehicle_id,
    chooseVehicleScoreWinner,
  );

  if (dedupedVehicleScores.duplicateCount > 0) {
    console.warn(`Deduped vehicle_scores before upsert: ${dedupedVehicleScores.duplicateCount} duplicate rows removed.`);
  }

  const vehicleScoresRecalculated = await upsertRowsInChunks(
    'vehicle_scores',
    dedupedVehicleScores.rows,
    'vehicle_id',
    'id, vehicle_id, overall_score, score_label, verdict, calculated_at',
  );
  const calculatedVehicleIds = new Set(dedupedVehicleScores.rows.map((row) => String(row.vehicle_id)));
  const staleVehicleScoreDeleteResult = await deleteStaleVehicleScores(
    calculatedVehicleIds,
    validCommonScoresByVehicleId,
  );
  const staleVehicleScoresDeleted = staleVehicleScoreDeleteResult.deletedCount;
  const vehicleScoresAfterRun = await selectAllRows('vehicle_scores', 'id, vehicle_id, overall_score, score_label');
  const vehicleScoreVehicleIdsAfterRun = new Set(vehicleScoresAfterRun.map((score) => String(score.vehicle_id)));
  const missingExactCommonScoreExamples = [];
  const repairScoresWithZeroExactCommonExamples = [];

  for (const [vehicleId, repairRows] of repairScoresByVehicleId.entries()) {
    const commonRepairCount = (validCommonScoresByVehicleId.get(vehicleId) ?? []).length;
    if (repairRows.length === 0) continue;

    const vehicle = vehiclesById.get(vehicleId);
    const example = {
      vehicle,
      repairScoreCount: repairRows.length,
      commonRepairCount,
    };

    if (!vehicleScoreVehicleIdsAfterRun.has(vehicleId) && commonRepairCount > 0) {
      missingExactCommonScoreExamples.push(example);
    }

    if (commonRepairCount === 0) {
      repairScoresWithZeroExactCommonExamples.push(example);
    }
  }

  const debugInfo = debugVehicleId
    ? (() => {
        const vehicleScores = repairScoresByVehicleId.get(debugVehicleId) ?? [];
        const validCommonScores = validCommonScoresByVehicleId.get(debugVehicleId) ?? [];
        const scoreRow = dedupedVehicleScores.rows.find((row) => String(row.vehicle_id) === debugVehicleId);
        const exactCommonSlugsFound = [
          ...new Set(
            validCommonScores
              .map((score) => repairTasksById.get(score.repair_task_id)?.source_job_slug)
              .filter(Boolean),
          ),
        ].sort();
        const exactCommonSlugSet = new Set(exactCommonSlugsFound);

        return {
          vehicleId: debugVehicleId,
          vehicle: vehiclesById.get(debugVehicleId),
          totalLaborEstimatesFound: laborEstimateCountByVehicleId.get(debugVehicleId) ?? 0,
          totalRepairScoresFound: vehicleScores.length,
          exactCommonRepairScoresFound: vehicleScores.filter((score) => targetRepairTaskIds.has(score.repair_task_id)).length,
          exactCommonSlugsFound,
          expectedCommonSlugsMissing: COMMON_OWNERSHIP_REPAIR_SLUGS.filter((slug) => !exactCommonSlugSet.has(slug)),
          validCommonRepairScoresUsed: validCommonScores.length,
          overallScore: scoreRow?.overall_score ?? null,
          scoreLabel: scoreRow?.score_label ?? null,
          rowPrepared: Boolean(scoreRow),
          rowUpserted: vehicleScoreVehicleIdsAfterRun.has(debugVehicleId),
          staleDeleted: staleVehicleScoreDeleteResult.deletedVehicleIds.has(debugVehicleId),
        };
      })()
    : null;

  const summary = {
    totalLaborEstimatesProcessed: laborEstimates.length,
    duplicateLaborEstimateCandidatesRemoved: dedupedLaborEstimates.duplicateCount,
    totalRepairTasksScored: repairTaskIdsScored.size,
    repairScoresUpserted,
    vehicleScoresRecalculated,
    staleVehicleScoresDeleted,
    vehiclesWithExactCommonRepairScoresMissingVehicleScores: missingExactCommonScoreExamples.length,
    vehiclesWithRepairScoresButZeroExactCommonRepairScores: repairScoresWithZeroExactCommonExamples.length,
    relativeComparisonScores: relativeComparisonCount,
    fallbackBucketScores: fallbackBucketCount,
  };

  if (log) {
    console.log(`total labor estimates processed: ${summary.totalLaborEstimatesProcessed}`);
    console.log(`duplicate labor estimate candidates removed before scoring: ${summary.duplicateLaborEstimateCandidatesRemoved}`);
    console.log(`total repair tasks scored: ${summary.totalRepairTasksScored}`);
    console.log(`total repair_scores upserted: ${summary.repairScoresUpserted}`);
    console.log(`vehicle_scores recalculated: ${summary.vehicleScoresRecalculated}`);
    console.log(`stale vehicle_scores deleted: ${summary.staleVehicleScoresDeleted}`);
    console.log(`vehicles with exact common repair scores but missing vehicle_scores: ${summary.vehiclesWithExactCommonRepairScoresMissingVehicleScores}`);
    if (missingExactCommonScoreExamples.length > 0) {
      console.log('missing vehicle_scores despite exact common repair scores examples:');
      for (const example of missingExactCommonScoreExamples.slice(0, 10)) {
        const vehicle = example.vehicle;
        console.log(
          `- ${vehicle?.year ?? 'unknown'} ${vehicle?.make ?? 'unknown'} ${vehicle?.model ?? 'unknown'} ${vehicle?.engine ?? 'Base / unspecified engine'} ${vehicle?.source_engine_slug ?? 'no source_engine_slug'}; repair_score_count: ${example.repairScoreCount}; common_repair_count: ${example.commonRepairCount}`,
        );
      }
    }
    console.log(`vehicles with repair_scores but zero exact common repair scores: ${summary.vehiclesWithRepairScoresButZeroExactCommonRepairScores}`);
    if (repairScoresWithZeroExactCommonExamples.length > 0) {
      console.log('repair_scores but zero exact common repair score examples:');
      for (const example of repairScoresWithZeroExactCommonExamples.slice(0, 10)) {
        const vehicle = example.vehicle;
        console.log(
          `- ${vehicle?.year ?? 'unknown'} ${vehicle?.make ?? 'unknown'} ${vehicle?.model ?? 'unknown'} ${vehicle?.engine ?? 'Base / unspecified engine'} ${vehicle?.source_engine_slug ?? 'no source_engine_slug'}; repair_score_count: ${example.repairScoreCount}; common_repair_count: ${example.commonRepairCount}`,
        );
      }
    }
    printVehicleDebug(debugInfo);
    console.log(`relative comparison scores: ${summary.relativeComparisonScores}`);
    console.log(`fallback bucket scores: ${summary.fallbackBucketScores}`);
  }

  return summary;
}

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  recalculateScores(parseCliArgs()).catch((error) => {
    console.error('Recalculation failed:');
    console.error(formatError(error));
    process.exitCode = 1;
  });
}
