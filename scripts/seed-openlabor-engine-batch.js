import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const requiredEnvVars = ['OLP_API_KEY', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables in .env.local:');
  for (const name of missingEnvVars) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

const apiKey = process.env.OLP_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service role key is used only in local/server-side scripts. Never expose this in React/browser code.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const targetYears = [2015, 2017, 2019];
const requestDelayMs = 500;

const targetModels = [
  { make: 'Ford', model: 'F-150', category: 'truck' },
  { make: 'Chevrolet', model: 'Silverado 1500', category: 'truck' },
  { make: 'Ram', model: '1500', category: 'truck' },
  { make: 'Toyota', model: 'Tacoma', category: 'truck' },
  { make: 'Toyota', model: 'Camry', category: 'car' },
  { make: 'Honda', model: 'Accord', category: 'car' },
  { make: 'Toyota', model: 'Corolla', category: 'car' },
  { make: 'Honda', model: 'Civic', category: 'car' },
  { make: 'Toyota', model: 'RAV4', category: 'suv' },
  { make: 'Honda', model: 'CR-V', category: 'suv' },
  { make: 'Toyota', model: 'Highlander', category: 'suv' },
  { make: 'Honda', model: 'Pilot', category: 'suv' },
  { make: 'Ford', model: 'Explorer', category: 'suv' },
  { make: 'Jeep', model: 'Grand Cherokee', category: 'large-suv' },
  { make: 'Chevrolet', model: 'Tahoe', category: 'large-suv' },
  { make: 'Chevrolet', model: 'Equinox', category: 'suv' },
  { make: 'Ford', model: 'Escape', category: 'suv' },
  { make: 'Subaru', model: 'Outback', category: 'suv' },
  { make: 'Nissan', model: 'Altima', category: 'car' },
  { make: 'Nissan', model: 'Rogue', category: 'suv' },
];

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
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
      options[key] = value;
    }
  }

  return options;
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

function formatError(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message ?? 'Unknown error';
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function collectCatalogRows(value, collected, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCatalogRows(item, collected, seen);
    }

    return;
  }

  if (!isObject(value) || seen.has(value)) {
    return;
  }

  seen.add(value);

  if ('engineSlug' in value || 'engine_slug' in value || 'yearRange' in value || 'jobCount' in value) {
    collected.push(value);
  }

  for (const nestedValue of Object.values(value)) {
    collectCatalogRows(nestedValue, collected, seen);
  }
}

function getEngineSlug(row) {
  return row.engineSlug ?? row.engine_slug ?? row.source_engine_slug ?? '';
}

function getEngineName(row) {
  return row.engine ?? row.engineName ?? row.name ?? null;
}

function yearRangeIncludes(year, row) {
  const requestedYear = Number(year);

  if (!Number.isFinite(requestedYear)) {
    return false;
  }

  const startYear = Number(row.startYear ?? row.start_year ?? row.fromYear ?? row.from_year);
  const endYear = Number(row.endYear ?? row.end_year ?? row.toYear ?? row.to_year);

  if (Number.isFinite(startYear) || Number.isFinite(endYear)) {
    const minYear = Number.isFinite(startYear) ? startYear : endYear;
    const maxYear = Number.isFinite(endYear) ? endYear : startYear;

    return requestedYear >= minYear && requestedYear <= maxYear;
  }

  const directYear = Number(row.year ?? row.modelYear ?? row.model_year);

  if (Number.isFinite(directYear)) {
    return requestedYear === directYear;
  }

  const range = String(row.yearRange ?? row.year_range ?? row.years ?? '').trim();

  if (!range) {
    return false;
  }

  const match = range.match(/^(\d{4})(?:\s*-\s*(\d{4}))?$/);

  if (!match) {
    return false;
  }

  const minYear = Number(match[1]);
  const maxYear = Number(match[2] ?? match[1]);

  return requestedYear >= minYear && requestedYear <= maxYear;
}

function getPriority(category) {
  if (category === 'truck' || category === 'large-suv') return 115;
  if (category === 'suv') return 110;
  if (category === 'car') return 105;
  return 100;
}

function buildTargets(options) {
  const yearFilter = options.year === undefined ? null : Number(options.year);
  const limit = options.limit === undefined ? null : Number(options.limit);
  const years = Number.isFinite(yearFilter) ? [yearFilter] : targetYears;
  const targets = [];

  for (const model of targetModels) {
    for (const year of years) {
      targets.push({
        ...model,
        year,
        makeSlug: slugify(model.make),
        modelSlug: slugify(model.model),
        priority: getPriority(model.category),
      });
    }
  }

  if (Number.isFinite(limit) && limit >= 0) {
    return targets.slice(0, Math.floor(limit));
  }

  return targets;
}

async function fetchEngineCatalog(target) {
  const url = new URL('https://openlaborproject.com/api/v1/vehicles');
  url.searchParams.set('make', target.makeSlug);
  url.searchParams.set('model', target.modelSlug);

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
      return { notFound: true, rows: [] };
    }

    const errorMessage = errorDetails && (errorDetails.code || errorDetails.message)
      ? `${errorDetails.code ?? 'unknown-code'} - ${errorDetails.message ?? 'No error message returned'}`
      : responseText || 'No response body returned.';

    throw new Error(`Open Labor vehicle catalog request failed with status ${response.status}. ${errorMessage}`);
  }

  const rows = [];
  collectCatalogRows(payload, rows);

  return { notFound: false, rows };
}

function buildQueueRows(target, catalogRows) {
  const seenEngineSlugs = new Set();
  const rows = [];

  for (const catalogRow of catalogRows) {
    const engineSlug = String(getEngineSlug(catalogRow) ?? '').trim().toLowerCase();

    if (!engineSlug || seenEngineSlugs.has(engineSlug)) {
      continue;
    }

    seenEngineSlugs.add(engineSlug);
    rows.push({
      year: target.year,
      make: target.make,
      model: target.model,
      engine: getEngineName(catalogRow),
      make_slug: target.makeSlug,
      model_slug: target.modelSlug,
      engine_slug: engineSlug,
      priority: target.priority,
    });
  }

  return rows;
}

function queueKey(row) {
  return `${row.year}|${row.make_slug}|${row.model_slug}|${row.engine_slug ?? ''}`;
}

async function fetchExistingQueueState() {
  const { data, error } = await supabase
    .from('openlabor_import_queue')
    .select('id, year, make_slug, model_slug, engine_slug, status');

  if (error) {
    throw error;
  }

  const keys = new Set();
  const statusCounts = {};

  for (const row of data ?? []) {
    keys.add(queueKey(row));

    const status = row.status ?? 'unknown';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return { keys, statusCounts };
}

async function insertRowsInChunks(rows, chunkSize = 100) {
  let inserted = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('openlabor_import_queue')
      .insert(chunk)
      .select('id');

    if (error) {
      throw error;
    }

    inserted += data?.length ?? 0;
  }

  return inserted;
}

async function countPendingQueueRows() {
  const { count, error } = await supabase
    .from('openlabor_import_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function countQueueStatuses() {
  const { data, error } = await supabase
    .from('openlabor_import_queue')
    .select('status');

  if (error) {
    throw error;
  }

  const counts = {};

  for (const row of data ?? []) {
    const status = row.status ?? 'unknown';
    counts[status] = (counts[status] ?? 0) + 1;
  }

  return counts;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function targetLabel(target) {
  return `${target.year} ${target.make} ${target.model}`;
}

async function main() {
  const targets = buildTargets(parseCliArgs());
  const existingQueue = await fetchExistingQueueState();
  const failedTargets = [];
  const summary = {
    attempted: 0,
    catalogRowsFound: 0,
    matchingEngineRowsFound: 0,
    inserted: 0,
    alreadyExisting: 0,
    noCatalog: 0,
    failed: 0,
  };

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    summary.attempted += 1;

    console.log(`Checking ${targetLabel(target)}...`);

    try {
      const catalogResult = await fetchEngineCatalog(target);

      if (catalogResult.notFound) {
        console.log(`No engine catalog found for ${targetLabel(target)}`);
        summary.noCatalog += 1;
      } else {
        const matchingYearRows = catalogResult.rows.filter((row) => yearRangeIncludes(target.year, row));
        const queueRows = buildQueueRows(target, matchingYearRows);
        const rowsToInsert = queueRows.filter((row) => !existingQueue.keys.has(queueKey(row)));
        const insertedCount = rowsToInsert.length > 0 ? await insertRowsInChunks(rowsToInsert) : 0;

        for (const row of rowsToInsert) {
          existingQueue.keys.add(queueKey(row));
        }

        summary.catalogRowsFound += catalogResult.rows.length;
        summary.matchingEngineRowsFound += queueRows.length;
        summary.inserted += insertedCount;
        summary.alreadyExisting += queueRows.length - rowsToInsert.length;

        console.log(
          `  catalog rows: ${catalogResult.rows.length}; engine rows: ${queueRows.length}; inserted: ${insertedCount}; existing: ${queueRows.length - rowsToInsert.length}`,
        );
      }
    } catch (error) {
      summary.failed += 1;
      failedTargets.push({ target, error });
      console.error(`  failed: ${formatError(error)}`);
    }

    if (index < targets.length - 1) {
      await sleep(requestDelayMs);
    }
  }

  const pendingCount = await countPendingQueueRows();
  const statusCounts = await countQueueStatuses();

  console.log('engine batch seed complete');
  console.log(`targets attempted: ${summary.attempted}`);
  console.log(`catalog rows found total: ${summary.catalogRowsFound}`);
  console.log(`matching engine rows found total: ${summary.matchingEngineRowsFound}`);
  console.log(`queue rows inserted: ${summary.inserted}`);
  console.log(`queue rows already existed: ${summary.alreadyExisting}`);
  console.log(`skipped/no catalog count: ${summary.noCatalog}`);
  console.log(`failed count: ${summary.failed}`);
  console.log(`pending queue rows after seeding: ${pendingCount}`);
  console.log('queue status counts:');

  for (const status of Object.keys(statusCounts).sort()) {
    console.log(`  ${status}: ${statusCounts[status]}`);
  }

  if (failedTargets.length > 0) {
    console.log('failed targets:');

    for (const { target, error } of failedTargets) {
      console.log(`  ${targetLabel(target)}: ${formatError(error)}`);
    }
  }
}

main().catch((error) => {
  console.error(`Engine batch seed failed:\n${formatError(error)}`);
  process.exitCode = 1;
});
