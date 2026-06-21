import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatError, formatSupabaseError } from './lib/errors.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const requiredEnvVars = ['OLP_API_KEY', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  if (missingEnvVars.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  console.error('Missing required environment variables in .env.local:');
  for (const name of missingEnvVars.filter((name) => name !== 'SUPABASE_SERVICE_ROLE_KEY')) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

const apiKey = process.env.OLP_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service role key is used only in local/server-side import scripts. Never expose this in React/browser code.
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const defaultVehicle = {
  year: 2017,
  make: 'Ford',
  makeSlug: 'ford',
  model: 'F-150',
  modelSlug: 'f-150',
  engine: null,
  engineSlug: null,
  fuelType: null,
};

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }

    const separatorIndex = arg.indexOf('=');
    const key = arg.slice(2, separatorIndex > -1 ? separatorIndex : undefined);
    const value = separatorIndex > -1 ? arg.slice(separatorIndex + 1) : 'true';

    if (key) {
      const normalizedKey = key === 'fuel-type' ? 'fuelType' : key;
      options[normalizedKey] = value;
    }
  }

  return options;
}

function hasVehicleArgs(options) {
  return ['year', 'make', 'model', 'makeSlug', 'modelSlug', 'engine', 'engineSlug', 'fuelType'].some(
    (key) => options[key] !== undefined,
  );
}

function resolveVehicleOptions(options = {}) {
  if (!hasVehicleArgs(options)) {
    return { ...defaultVehicle };
  }

  const make = String(options.make ?? defaultVehicle.make).trim();
  const model = String(options.model ?? defaultVehicle.model).trim();
  const engineValue = options.engine === undefined ? defaultVehicle.engine : options.engine;
  const engine = engineValue === undefined || engineValue === null || String(engineValue).trim() === ''
    ? null
    : String(engineValue).trim();
  const fuelTypeValue = options.fuelType === undefined ? defaultVehicle.fuelType : options.fuelType;
  const fuelType = fuelTypeValue === undefined || fuelTypeValue === null || String(fuelTypeValue).trim() === ''
    ? null
    : String(fuelTypeValue).trim();
  const makeSlug = String(options.makeSlug ?? slugify(make)).trim().toLowerCase();
  const modelSlug = String(options.modelSlug ?? slugify(model)).trim().toLowerCase();
  const engineSlugValue = options.engineSlug === undefined ? (engine ? slugify(engine) : null) : options.engineSlug;
  const engineSlug = engineSlugValue === undefined || engineSlugValue === null || String(engineSlugValue).trim() === ''
    ? null
    : String(engineSlugValue).trim().toLowerCase();

  return {
    year: Number(options.year ?? defaultVehicle.year),
    make,
    makeSlug,
    model,
    modelSlug,
    engine,
    engineSlug,
    fuelType,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function throwSupabaseError(action, error) {
  throw new Error(`${action}: ${formatSupabaseError(error)}`);
}

async function updateQueueRow(queueId, patch) {
  if (!queueId) {
    return;
  }

  const { error } = await supabase.from('openlabor_import_queue').update(patch).eq('id', queueId);

  if (error) {
    throwSupabaseError(`Failed to update queue row ${queueId}`, error);
  }
}

async function markQueueRunning(queueId) {
  const { data: queueRow, error } = await supabase
    .from('openlabor_import_queue')
    .select('id, attempts')
    .eq('id', queueId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(`Failed to fetch queue row ${queueId}`, error);
  }

  if (!queueRow) {
    throw new Error(`Queue row ${queueId} was not found.`);
  }

  await updateQueueRow(queueId, {
    status: 'running',
    attempts: Number(queueRow.attempts ?? 0) + 1,
    started_at: nowIso(),
    finished_at: null,
    imported_vehicle_id: null,
    last_error: null,
    updated_at: nowIso(),
  });
}

async function markQueueCompleted(queueId, importedVehicleId) {
  await updateQueueRow(queueId, {
    status: 'completed',
    finished_at: nowIso(),
    imported_vehicle_id: importedVehicleId,
    updated_at: nowIso(),
  });
}

async function markQueueFailed(queueId, error) {
  await updateQueueRow(queueId, {
    status: 'failed',
    last_error: formatError(error),
    finished_at: nowIso(),
    updated_at: nowIso(),
  });
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isJobRecord(value) {
  return isObject(value) && 'jobSlug' in value && 'hours' in value;
}

function collectJobRecords(value, collected, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    const jobsInArray = value.filter(isJobRecord);

    if (jobsInArray.length > 0) {
      collected.push(...jobsInArray);
    }

    for (const item of value) {
      collectJobRecords(item, collected, seen);
    }

    return;
  }

  if (!isObject(value) || seen.has(value)) {
    return;
  }

  seen.add(value);

  for (const nestedValue of Object.values(value)) {
    collectJobRecords(nestedValue, collected, seen);
  }
}

function parseJsonSafely(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getJobName(job) {
  return job.jobName ?? job.name ?? job.title ?? job.description ?? job.jobSlug;
}

function getJobCategory(job) {
  return job.category ?? job.group ?? job.type ?? job.section ?? '';
}

function getJobConfidence(job) {
  return job.confidence ?? '';
}

function getDefaultWeight(category) {
  const normalizedCategory = String(category ?? '').toLowerCase();

  if (['brakes', 'engine', 'transmission'].includes(normalizedCategory)) {
    return 1.4;
  }

  if (
    ['cooling', 'electrical', 'drivetrain', 'suspension', 'steering'].includes(
      normalizedCategory,
    )
  ) {
    return 1.2;
  }

  if (
    ['maintenance', 'hvac', 'body', 'interior', 'emissions', 'fuel'].includes(
      normalizedCategory,
    )
  ) {
    return 1.0;
  }

  return 1.0;
}

function getConfidenceLevel(confidence) {
  const normalizedConfidence = String(confidence ?? '').toLowerCase();

  if (normalizedConfidence === 'confirmed') {
    return 'high';
  }

  if (normalizedConfidence === 'ai_baseline') {
    return 'low';
  }

  return 'medium';
}

function buildSourceNotes(job) {
  return JSON.stringify({
    jobSlug: job.jobSlug,
    category: getJobCategory(job),
    lowRange: job.lowRange ?? null,
    highRange: job.highRange ?? null,
    confidence: getJobConfidence(job),
  });
}

function normalizeSlug(value) {
  return String(value ?? '').trim().toLowerCase();
}

function applyFilters(query, filters) {
  let nextQuery = query;

  for (const [column, value] of Object.entries(filters)) {
    nextQuery = value === null ? nextQuery.is(column, null) : nextQuery.eq(column, value);
  }

  return nextQuery;
}

function rowMatches(existingRow, nextRow, columns) {
  return columns.every((column) => {
    const existingValue = existingRow?.[column];
    const nextValue = nextRow?.[column];

    return String(existingValue ?? '') === String(nextValue ?? '');
  });
}

async function selectRowsByInChunks(tableName, columnName, values, selectColumns = '*', extraFilters = {}) {
  const uniqueValues = [...new Set(values.filter((value) => value !== null && value !== undefined))];
  const results = [];
  const chunkSize = 100;

  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    const chunk = uniqueValues.slice(index, index + chunkSize);
    let query = supabase.from(tableName).select(selectColumns).in(columnName, chunk);
    query = applyFilters(query, extraFilters);

    const { data, error } = await query;

    if (error) {
      throwSupabaseError(`Failed to select ${tableName} rows by ${columnName}`, error);
    }

    results.push(...(data ?? []));
  }

  return results;
}

async function insertRowsInChunks(tableName, rows, selectColumns = '*', chunkSize = 100) {
  const results = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await supabase.from(tableName).insert(chunk).select(selectColumns);

    if (error) {
      throwSupabaseError(`Failed to insert ${tableName} rows`, error);
    }

    results.push(...(data ?? []));
  }

  return results;
}

async function upsertRowsInChunks(tableName, rows, onConflict, selectColumns = '*', chunkSize = 100) {
  const results = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict })
      .select(selectColumns);

    if (error) {
      throwSupabaseError(`Failed to upsert ${tableName} rows`, error);
    }

    results.push(...(data ?? []));
  }

  return results;
}

async function updateRowById(tableName, id, row, selectColumns = '*') {
  const { data, error } = await supabase.from(tableName).update(row).eq('id', id).select(selectColumns).single();

  if (error) {
    throwSupabaseError(`Failed to update ${tableName} row ${id}`, error);
  }

  return data;
}

async function fetchOpenLaborData(vehicle) {
  const url = new URL('https://openlaborproject.com/api/v1/labor-times');
  url.searchParams.set('make', vehicle.makeSlug);
  url.searchParams.set('model', vehicle.modelSlug);
  url.searchParams.set('year', String(vehicle.year));

  if (vehicle.engineSlug) {
    url.searchParams.set('engine', vehicle.engineSlug);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      accept: 'application/json',
    },
  });

  const responseText = await response.text();
  const payload = parseJsonSafely(responseText);

  if (!response.ok) {
    const errorDetails = payload?.error;

    if (response.status === 404 && errorDetails?.code === 'NOT_FOUND') {
      return {
        skipped: true,
        reason: 'NOT_FOUND',
        payload,
        response,
      };
    }

    const errorMessage = errorDetails && (errorDetails.code || errorDetails.message)
      ? `Error: ${errorDetails.code ?? 'unknown-code'} - ${errorDetails.message ?? 'No error message returned'}`
      : 'Error response received but no structured error details were returned.';

    const error = new Error(`Open Labor request failed with status ${response.status}. ${errorMessage}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return { payload, response };
}

async function upsertRowByFilters(tableName, filters, row, selectColumns = '*') {
  const existingQuery = applyFilters(supabase.from(tableName).select(selectColumns), filters);
  const { data: existingRow, error: lookupError } = await existingQuery.maybeSingle();

  if (lookupError) {
    throwSupabaseError(`Failed to look up ${tableName}`, lookupError);
  }

  if (existingRow) {
    const { data, error: updateError } = await applyFilters(supabase.from(tableName).update(row), filters)
      .select(selectColumns)
      .single();

    if (updateError) {
      throwSupabaseError(`Failed to update ${tableName}`, updateError);
    }

    return { row: data, action: 'updated' };
  }

  const { data, error: insertError } = await supabase.from(tableName).insert(row).select(selectColumns).single();

  if (insertError) {
    throwSupabaseError(`Failed to insert ${tableName}`, insertError);
  }

  return { row: data, action: 'inserted' };
}

function buildSkippedResult(vehicle, response) {
  return {
    success: true,
    skipped: true,
    reason: 'NOT_FOUND',
    vehicleId: null,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    rawJobCount: 0,
    uniqueJobCount: 0,
    laborEstimatesUpserted: 0,
    repairScoresUpserted: 0,
    overallScore: null,
    rateLimitRemaining: response.headers.get('X-RateLimit-Remaining-Daily') ?? '',
  };
}

function isMissingConflictConstraintError(error) {
  const message = formatError(error).toLowerCase();

  return (
    message.includes('42p10') ||
    message.includes('no unique or exclusion constraint') ||
    message.includes('on conflict')
  );
}

async function syncLaborEstimates(vehicleId, laborEstimateRows) {
  try {
    return await upsertRowsInChunks(
      'labor_estimates',
      laborEstimateRows,
      'vehicle_id,repair_task_id',
      'id, vehicle_id, repair_task_id, labor_hours, source, source_operation_name, source_notes',
    );
  } catch (error) {
    if (!isMissingConflictConstraintError(error)) {
      throw error;
    }

    console.warn('labor_estimates unique constraint is not available yet; using lookup/update fallback.');
  }

  const existingLaborEstimates = await supabase
    .from('labor_estimates')
    .select('id, vehicle_id, repair_task_id, labor_hours, source, source_operation_name, source_notes')
    .eq('vehicle_id', vehicleId)
    .eq('source', 'openlabor');

  if (existingLaborEstimates.error) {
    throwSupabaseError('Failed to fetch existing labor estimates', existingLaborEstimates.error);
  }

  const laborEstimateByTaskId = new Map(
    (existingLaborEstimates.data ?? []).map((estimate) => [estimate.repair_task_id, estimate]),
  );
  const laborEstimates = [];
  const newLaborEstimateRows = [];

  for (const laborEstimateRow of laborEstimateRows) {
    const existingEstimate = laborEstimateByTaskId.get(laborEstimateRow.repair_task_id);

    if (!existingEstimate) {
      newLaborEstimateRows.push(laborEstimateRow);
      continue;
    }

    const updatedEstimate = rowMatches(existingEstimate, laborEstimateRow, [
      'labor_hours',
      'source_operation_name',
      'source_notes',
    ])
      ? existingEstimate
      : await updateRowById(
          'labor_estimates',
          existingEstimate.id,
          laborEstimateRow,
          'id, vehicle_id, repair_task_id, labor_hours, source, source_operation_name, source_notes',
        );

    laborEstimates.push(updatedEstimate);
  }

  if (newLaborEstimateRows.length > 0) {
    const insertedLaborEstimates = await insertRowsInChunks(
      'labor_estimates',
      newLaborEstimateRows,
      'id, vehicle_id, repair_task_id, labor_hours, source, source_operation_name, source_notes',
    );

    laborEstimates.push(...insertedLaborEstimates);
  }

  return laborEstimates;
}

export async function importOpenLaborVehicle(options = {}) {
  const vehicle = resolveVehicleOptions(options);
  const queueId = options.queueId ? String(options.queueId) : '';

  if (queueId) {
    await markQueueRunning(queueId);
  }

  try {
    const openLaborResult = await fetchOpenLaborData(vehicle);

    if (openLaborResult.skipped && openLaborResult.reason === 'NOT_FOUND') {
      const result = buildSkippedResult(vehicle, openLaborResult.response);

      console.log(`No Open Labor data found for ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);

      if (queueId) {
        await updateQueueRow(queueId, {
          status: 'skipped',
          last_error: 'No Open Labor data found for this vehicle.',
          finished_at: nowIso(),
          updated_at: nowIso(),
        });
      }

      return result;
    }

    const { payload, response } = openLaborResult;

    const collectedJobs = [];
    collectJobRecords(payload, collectedJobs);

    const uniqueJobs = [];
    const seenJobSlugs = new Set();

    for (const job of collectedJobs) {
      if (typeof job.jobSlug !== 'string' || typeof job.hours !== 'number' || seenJobSlugs.has(job.jobSlug)) {
        continue;
      }

      seenJobSlugs.add(job.jobSlug);
      uniqueJobs.push(job);
    }

    console.log('Upserting vehicle...');

    const vehicleResult = await upsertRowByFilters(
      'vehicles',
      {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        engine: vehicle.engine ?? null,
        source_make_slug: vehicle.makeSlug,
        source_model_slug: vehicle.modelSlug,
        source_engine_slug: vehicle.engineSlug ?? null,
      },
      {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        engine: vehicle.engine ?? null,
        source_make_slug: vehicle.makeSlug,
        source_model_slug: vehicle.modelSlug,
        source_engine_slug: vehicle.engineSlug ?? null,
        fuel_type: vehicle.fuelType ?? null,
      },
      'id',
    );

    const vehicleId = vehicleResult.row.id;

    const taskRows = uniqueJobs.map((job) => ({
      name: getJobName(job),
      category: getJobCategory(job) || 'Uncategorized',
      source_job_slug: job.jobSlug,
      source_category: getJobCategory(job) || null,
      default_weight: getDefaultWeight(getJobCategory(job)),
      display_order: 999,
    }));

    console.log('Syncing repair tasks...');
    const existingRepairTasks = await selectRowsByInChunks(
      'repair_tasks',
      'source_job_slug',
      taskRows.map((task) => task.source_job_slug),
      'id, name, category, source_job_slug, source_category, default_weight, display_order',
    );

    const repairTaskBySlug = new Map(existingRepairTasks.map((task) => [normalizeSlug(task.source_job_slug), task]));
    const repairTaskResults = [];
    const newRepairTaskRows = [];

    for (const taskRow of taskRows) {
      const existingTask = repairTaskBySlug.get(normalizeSlug(taskRow.source_job_slug));

      if (!existingTask) {
        newRepairTaskRows.push(taskRow);
        continue;
      }

      const updatedTask = rowMatches(existingTask, taskRow, [
        'name',
        'category',
        'source_category',
        'default_weight',
        'display_order',
      ])
        ? existingTask
        : await updateRowById(
            'repair_tasks',
            existingTask.id,
            taskRow,
            'id, name, category, source_job_slug, source_category, default_weight, display_order',
          );

      repairTaskResults.push(updatedTask);
    }

    if (newRepairTaskRows.length > 0) {
      const insertedRepairTasks = await insertRowsInChunks(
        'repair_tasks',
        newRepairTaskRows,
        'id, name, category, source_job_slug, source_category, default_weight, display_order',
      );

      repairTaskResults.push(...insertedRepairTasks);
    }

    const tasksBySlug = new Map(repairTaskResults.map((task) => [normalizeSlug(task.source_job_slug), task]));

    const laborEstimateRows = uniqueJobs
      .map((job) => {
        const task = tasksBySlug.get(normalizeSlug(job.jobSlug));

        if (!task) return null;

        return {
          vehicle_id: vehicleId,
          repair_task_id: task.id,
          labor_hours: job.hours,
          source: 'openlabor',
          source_operation_name: getJobName(job),
          source_notes: buildSourceNotes(job),
        };
      })
      .filter(Boolean);

    console.log('Syncing labor estimates...');
    const laborEstimates = await syncLaborEstimates(vehicleId, laborEstimateRows);

    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining-Daily') ?? '';

    const result = {
      success: true,
      skipped: false,
      reason: null,
      vehicleId,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      rawJobCount: collectedJobs.length,
      uniqueJobCount: uniqueJobs.length,
      laborEstimatesUpserted: laborEstimates.length,
      repairScoresUpserted: 0,
      overallScore: null,
      rateLimitRemaining,
    };

    console.log('vehicle imported');
    console.log(`raw job count: ${result.rawJobCount}`);
    console.log(`unique job count: ${result.uniqueJobCount}`);
    console.log(`labor_estimates upserted: ${result.laborEstimatesUpserted}`);
    console.log('Raw labor data imported. Run npm.cmd run recalculate:scores to update scores.');
    console.log(`rate limit remaining: ${result.rateLimitRemaining}`);

    if (queueId) {
      await markQueueCompleted(queueId, vehicleId);
    }

    return result;
  } catch (error) {
    if (queueId) {
      try {
        await markQueueFailed(queueId, error);
      } catch (queueError) {
        console.error(`Failed to update queue row: ${formatError(queueError)}`);
      }
    }

    if (options.returnFailureResult) {
      return {
        success: false,
        error,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        engine: vehicle.engine,
        source_engine_slug: vehicle.engineSlug,
      };
    }

    throw error;
  }
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const cliOptions = parseCliArgs();

  importOpenLaborVehicle(cliOptions).catch((error) => {
    console.error(`Import failed:\n${formatError(error)}`);
    process.exitCode = 1;
  });
}
