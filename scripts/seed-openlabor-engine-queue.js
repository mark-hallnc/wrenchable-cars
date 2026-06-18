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

function isEnabled(value) {
  return value === true || String(value ?? '').toLowerCase() === 'true';
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

  if (
    'engineSlug' in value ||
    'engine_slug' in value ||
    'yearRange' in value ||
    'year_range' in value ||
    'jobCount' in value ||
    'job_count' in value ||
    'engine' in value ||
    'engineName' in value
  ) {
    collected.push(value);
  }

  for (const nestedValue of Object.values(value)) {
    collectCatalogRows(nestedValue, collected, seen);
  }
}

function getEngineSlug(row) {
  return row.engineSlug ?? row.engine_slug ?? row.sourceEngineSlug ?? row.source_engine_slug ?? '';
}

function getEngineName(row) {
  return row.engine ?? row.engineName ?? row.engine_name ?? row.name ?? null;
}

function getFuelType(row) {
  return row.fuelType ?? row.fuel_type ?? row.fuel ?? row.fuelName ?? row.fuel_name ?? null;
}

function getCatalogMetadata(row) {
  return {
    engine: getEngineName(row),
    engineSlug: getEngineSlug(row),
    fuelType: getFuelType(row),
    yearRange: row.yearRange ?? row.year_range ?? row.years ?? null,
    jobCount: row.jobCount ?? row.job_count ?? row.jobsCount ?? row.jobs_count ?? null,
    drivetrain: row.drivetrain ?? row.driveTrain ?? row.drive_type ?? row.driveType ?? row.drive ?? null,
    transmission: row.transmission ?? row.transmissionType ?? row.transmission_type ?? null,
    trim: row.trim ?? row.trimName ?? row.trim_name ?? row.sourceTrim ?? row.source_trim ?? null,
  };
}

function printSampleCatalogRow(rows) {
  if (rows.length === 0) {
    console.log('debug sample catalog row: none');
    return;
  }

  console.log('debug sample catalog row keys:');
  console.log(Object.keys(rows[0]).sort().join(', '));
  console.log('debug parsed catalog metadata:');
  console.log(JSON.stringify(getCatalogMetadata(rows[0]), null, 2));
  console.log('debug sample catalog row:');
  console.log(JSON.stringify(rows[0], null, 2));
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

function requireVehicleOptions(options) {
  const year = Number(options.year);
  const make = String(options.make ?? '').trim();
  const model = String(options.model ?? '').trim();

  if (!Number.isFinite(year) || !make || !model) {
    throw new Error('Usage: --year=2017 --make=Ford --model=F-150 [--makeSlug=ford] [--modelSlug=f-150]');
  }

  return {
    year,
    make,
    model,
    makeSlug: String(options.makeSlug ?? slugify(make)).trim().toLowerCase(),
    modelSlug: String(options.modelSlug ?? slugify(model)).trim().toLowerCase(),
  };
}

async function fetchEngineCatalog(vehicle) {
  const url = new URL('https://openlaborproject.com/api/v1/vehicles');
  url.searchParams.set('make', vehicle.makeSlug);
  url.searchParams.set('model', vehicle.modelSlug);

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

function buildQueueRows(vehicle, catalogRows) {
  const seenEngineSlugs = new Set();
  const rows = [];

  for (const catalogRow of catalogRows) {
    const engineSlug = String(getEngineSlug(catalogRow) ?? '').trim().toLowerCase();

    if (!engineSlug || seenEngineSlugs.has(engineSlug)) {
      continue;
    }

    seenEngineSlugs.add(engineSlug);
    rows.push({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      engine: getEngineName(catalogRow),
      make_slug: vehicle.makeSlug,
      model_slug: vehicle.modelSlug,
      engine_slug: engineSlug,
      priority: 110,
    });

    // TODO: consider future queue/schema fields for drivetrain, transmission,
    // trim/source_trim, engine_family, and engine_code if Open Labor exposes them consistently.
  }

  return rows;
}

function queueKey(row) {
  return `${row.year}|${row.make_slug}|${row.model_slug}|${row.engine_slug ?? ''}`;
}

async function fetchExistingQueueKeys(rows) {
  const keys = new Set();

  for (const row of rows) {
    const { data, error } = await supabase
      .from('openlabor_import_queue')
      .select('id, year, make_slug, model_slug, engine_slug, status')
      .eq('year', row.year)
      .eq('make_slug', row.make_slug)
      .eq('model_slug', row.model_slug)
      .eq('engine_slug', row.engine_slug);

    if (error) {
      throw error;
    }

    if ((data ?? []).length > 0) {
      keys.add(queueKey(row));
    }
  }

  return keys;
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

async function main() {
  const cliOptions = parseCliArgs();
  const vehicle = requireVehicleOptions(cliOptions);
  const catalogResult = await fetchEngineCatalog(vehicle);

  if (catalogResult.notFound) {
    console.log(`No engine catalog found for ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);
    return;
  }

  if (isEnabled(cliOptions.debug)) {
    printSampleCatalogRow(catalogResult.rows);
  }

  const matchingYearRows = catalogResult.rows.filter((row) => yearRangeIncludes(vehicle.year, row));
  const queueRows = buildQueueRows(vehicle, matchingYearRows);
  const existingKeys = await fetchExistingQueueKeys(queueRows);
  const rowsToInsert = queueRows.filter((row) => !existingKeys.has(queueKey(row)));
  const insertedCount = rowsToInsert.length > 0 ? await insertRowsInChunks(rowsToInsert) : 0;
  const alreadyExistingCount = queueRows.length - rowsToInsert.length;
  const pendingCount = await countPendingQueueRows();

  console.log(`requested vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
  console.log(`catalog rows found: ${catalogResult.rows.length}`);
  console.log(`matching year rows found: ${matchingYearRows.length}`);
  console.log(`engine-specific queue rows added: ${insertedCount}`);
  console.log(`engine-specific queue rows already existing: ${alreadyExistingCount}`);
  console.log(`pending queue rows after seeding: ${pendingCount}`);
}

main().catch((error) => {
  console.error(`Engine queue seed failed:\n${formatError(error)}`);
  process.exitCode = 1;
});
