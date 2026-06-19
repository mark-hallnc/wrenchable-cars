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

const DEFAULT_START_YEAR = 2005;
const DEFAULT_END_YEAR = 2024;
const DEFAULT_DELAY_MS = 750;
const LOW_DAILY_RATE_LIMIT_THRESHOLD = 25;

const targetModelsByCategory = {
  trucks: [
    { make: 'Ford', model: 'F-150' },
    { make: 'Ford', model: 'F-250 Super Duty' },
    { make: 'Chevrolet', model: 'Silverado 1500' },
    { make: 'Chevrolet', model: 'Silverado 2500 HD' },
    { make: 'GMC', model: 'Sierra 1500' },
    { make: 'GMC', model: 'Sierra 2500 HD' },
    { make: 'Ram', model: '1500' },
    { make: 'Ram', model: '2500' },
    { make: 'Toyota', model: 'Tacoma' },
    { make: 'Toyota', model: 'Tundra' },
    { make: 'Nissan', model: 'Frontier' },
    { make: 'Nissan', model: 'Titan' },
    { make: 'Chevrolet', model: 'Colorado' },
    { make: 'GMC', model: 'Canyon' },
    { make: 'Ford', model: 'Ranger' },
  ],
  suvs: [
    { make: 'Toyota', model: 'RAV4' },
    { make: 'Honda', model: 'CR-V' },
    { make: 'Toyota', model: 'Highlander' },
    { make: 'Honda', model: 'Pilot' },
    { make: 'Ford', model: 'Explorer' },
    { make: 'Jeep', model: 'Grand Cherokee' },
    { make: 'Chevrolet', model: 'Tahoe' },
    { make: 'Chevrolet', model: 'Suburban' },
    { make: 'GMC', model: 'Yukon' },
    { make: 'Chevrolet', model: 'Equinox' },
    { make: 'Ford', model: 'Escape' },
    { make: 'Subaru', model: 'Outback' },
    { make: 'Subaru', model: 'Forester' },
    { make: 'Nissan', model: 'Rogue' },
    { make: 'Nissan', model: 'Pathfinder' },
    { make: 'Toyota', model: '4Runner' },
    { make: 'Jeep', model: 'Wrangler' },
    { make: 'Jeep', model: 'Cherokee' },
    { make: 'Mazda', model: 'CX-5' },
    { make: 'Hyundai', model: 'Santa Fe' },
    { make: 'Hyundai', model: 'Tucson' },
    { make: 'Kia', model: 'Sorento' },
    { make: 'Kia', model: 'Sportage' },
    { make: 'Dodge', model: 'Durango' },
    { make: 'Acura', model: 'MDX' },
    { make: 'Lexus', model: 'RX 350' },
  ],
  cars: [
    { make: 'Toyota', model: 'Camry' },
    { make: 'Honda', model: 'Accord' },
    { make: 'Toyota', model: 'Corolla' },
    { make: 'Honda', model: 'Civic' },
    { make: 'Nissan', model: 'Altima' },
    { make: 'Nissan', model: 'Sentra' },
    { make: 'Mazda', model: '3' },
    { make: 'Mazda', model: '6' },
    { make: 'Subaru', model: 'Impreza' },
    { make: 'Subaru', model: 'Legacy' },
    { make: 'Hyundai', model: 'Elantra' },
    { make: 'Hyundai', model: 'Sonata' },
    { make: 'Kia', model: 'Forte' },
    { make: 'Kia', model: 'Optima' },
    { make: 'Ford', model: 'Fusion' },
    { make: 'Chevrolet', model: 'Malibu' },
    { make: 'Chevrolet', model: 'Impala' },
    { make: 'Volkswagen', model: 'Jetta' },
    { make: 'Volkswagen', model: 'Passat' },
    { make: 'BMW', model: '328i' },
    { make: 'BMW', model: '330i' },
    { make: 'Toyota', model: 'Prius' },
  ],
  vans: [
    { make: 'Toyota', model: 'Sienna' },
    { make: 'Honda', model: 'Odyssey' },
    { make: 'Chrysler', model: 'Pacifica' },
    { make: 'Dodge', model: 'Grand Caravan' },
    { make: 'Kia', model: 'Sedona' },
  ],
};

const targetModels = Object.entries(targetModelsByCategory).flatMap(([category, models]) =>
  models.map((model) => ({ ...model, category })),
);

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
    if (!arg.startsWith('--')) continue;

    const separatorIndex = arg.indexOf('=');
    const key = arg.slice(2, separatorIndex > -1 ? separatorIndex : undefined);
    const value = separatorIndex > -1 ? arg.slice(separatorIndex + 1) : 'true';

    if (key) options[key] = value;
  }

  return options;
}

function isEnabled(value) {
  return value === true || String(value ?? '').toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJsonSafely(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatError(error) {
  if (error instanceof Error) return error.stack ?? error.message ?? 'Unknown error';

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
    for (const item of value) collectCatalogRows(item, collected, seen);
    return;
  }

  if (!isObject(value) || seen.has(value)) return;

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
  if (!Number.isFinite(requestedYear)) return false;

  const startYear = Number(row.startYear ?? row.start_year ?? row.fromYear ?? row.from_year);
  const endYear = Number(row.endYear ?? row.end_year ?? row.toYear ?? row.to_year);

  if (Number.isFinite(startYear) || Number.isFinite(endYear)) {
    const minYear = Number.isFinite(startYear) ? startYear : endYear;
    const maxYear = Number.isFinite(endYear) ? endYear : startYear;
    return requestedYear >= minYear && requestedYear <= maxYear;
  }

  const directYear = Number(row.year ?? row.modelYear ?? row.model_year);
  if (Number.isFinite(directYear)) return requestedYear === directYear;

  const range = String(row.yearRange ?? row.year_range ?? row.years ?? '').trim();
  if (!range) return false;

  const match = range.match(/^(\d{4})(?:\s*-\s*(\d{4}))?$/);
  if (!match) return false;

  const minYear = Number(match[1]);
  const maxYear = Number(match[2] ?? match[1]);
  return requestedYear >= minYear && requestedYear <= maxYear;
}

function getPriority(category) {
  if (category === 'trucks') return 115;
  if (category === 'suvs') return 110;
  if (category === 'cars') return 105;
  if (category === 'vans') return 108;
  return 100;
}

function normalizeFilter(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getSelectedCategories(options) {
  const categoryFilter = normalizeFilter(options.category || 'all');
  const validCategories = Object.keys(targetModelsByCategory);

  if (categoryFilter === 'all') return validCategories;
  if (validCategories.includes(categoryFilter)) return [categoryFilter];

  throw new Error(`Unsupported category "${options.category}". Use trucks, suvs, cars, vans, or all.`);
}

function buildYearList(options) {
  const year = parseNumber(options.year, null);
  if (Number.isFinite(year)) return [year];

  const startYear = parseNumber(options.startYear, DEFAULT_START_YEAR);
  const endYear = parseNumber(options.endYear, DEFAULT_END_YEAR);
  const minYear = Math.min(startYear, endYear);
  const maxYear = Math.max(startYear, endYear);
  const years = [];

  for (let yearValue = minYear; yearValue <= maxYear; yearValue += 1) {
    years.push(yearValue);
  }

  return years;
}

function buildTargets(options) {
  const limit = parseNumber(options.limit, null);
  const years = buildYearList(options);
  const selectedCategories = getSelectedCategories(options);
  const makeFilter = normalizeFilter(options.make);
  const modelFilter = normalizeFilter(options.model);
  const models = targetModels.filter((model) =>
    selectedCategories.includes(model.category) &&
    (!makeFilter || normalizeFilter(model.make) === makeFilter) &&
    (!modelFilter || normalizeFilter(model.model) === modelFilter)
  );
  const targets = [];

  for (const model of models) {
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

function getPlan(options, targets, delayMs) {
  const years = buildYearList(options);
  const selectedCategories = getSelectedCategories(options);
  const limit = parseNumber(options.limit, null);
  const maxQueueRows = parseNumber(options.maxQueueRows, null);

  return {
    selectedCategories,
    startYear: Math.min(...years),
    endYear: Math.max(...years),
    targetCount: targets.length,
    limit: Number.isFinite(limit) ? Math.floor(limit) : null,
    maxQueueRows: Number.isFinite(maxQueueRows) && maxQueueRows >= 0 ? Math.floor(maxQueueRows) : null,
    make: options.make ?? null,
    model: options.model ?? null,
    dryRun: isEnabled(options.dryRun) || isEnabled(options['dry-run']),
    delayMs,
  };
}

function printPlan(plan) {
  console.log('engine batch seed plan');
  console.log(`selected categories: ${plan.selectedCategories.join(', ')}`);
  console.log(`year range: ${plan.startYear}-${plan.endYear}`);
  console.log(`year/make/model targets: ${plan.targetCount}`);
  console.log(`limit: ${plan.limit ?? 'none'}`);
  console.log(`max queue rows: ${plan.maxQueueRows ?? 'none'}`);
  console.log(`make filter: ${plan.make ?? 'none'}`);
  console.log(`model filter: ${plan.model ?? 'none'}`);
  console.log(`dry run: ${plan.dryRun ? 'yes' : 'no'}`);
  console.log(`delayMs: ${plan.delayMs}`);
}

function getRetryAfterMilliseconds(response) {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return 60_000;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) return Math.max(0, retryDate - Date.now());

  return 60_000;
}

function getRateLimitInfo(response) {
  const daily = Number(response.headers.get('x-ratelimit-remaining-daily'));
  const minute = Number(response.headers.get('x-ratelimit-remaining-minute'));

  return {
    remainingDaily: Number.isFinite(daily) ? daily : null,
    remainingMinute: Number.isFinite(minute) ? minute : null,
  };
}

async function readCatalogResponse(response) {
  const responseText = await response.text();
  const payload = parseJsonSafely(responseText);
  const rateLimit = getRateLimitInfo(response);

  if (!response.ok) {
    const errorDetails = payload?.error;

    if (response.status === 404 && errorDetails?.code === 'NOT_FOUND') {
      return { notFound: true, rows: [], rateLimit };
    }

    const errorMessage = errorDetails && (errorDetails.code || errorDetails.message)
      ? `${errorDetails.code ?? 'unknown-code'} - ${errorDetails.message ?? 'No error message returned'}`
      : responseText || 'No response body returned.';

    throw new Error(`Open Labor vehicle catalog request failed with status ${response.status}. ${errorMessage}`);
  }

  const rows = [];
  collectCatalogRows(payload, rows);
  return { notFound: false, rows, rateLimit };
}

async function fetchEngineCatalog(target) {
  const url = new URL('https://openlaborproject.com/api/v1/vehicles');
  url.searchParams.set('make', target.makeSlug);
  url.searchParams.set('model', target.modelSlug);

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        accept: 'application/json',
      },
    });

    if (response.status === 429 && attempt === 0) {
      const waitMs = getRetryAfterMilliseconds(response);
      console.warn(`  rate limited by Open Labor; waiting ${Math.ceil(waitMs / 1000)} seconds before one retry`);
      await response.text();
      await sleep(waitMs);
      continue;
    }

    return readCatalogResponse(response);
  }

  throw new Error('Open Labor vehicle catalog request failed after retry.');
}

function buildQueueRows(target, catalogRows) {
  const seenEngineSlugs = new Set();
  const rows = [];

  for (const catalogRow of catalogRows) {
    const engineSlug = String(getEngineSlug(catalogRow) ?? '').trim().toLowerCase();

    if (!engineSlug || seenEngineSlugs.has(engineSlug)) continue;

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

    // TODO: consider future queue/schema fields for drivetrain, transmission,
    // trim/source_trim, engine_family, and engine_code if Open Labor exposes them consistently.
  }

  return rows;
}

function queueKey(row) {
  return `${row.year}|${row.make_slug}|${row.model_slug}|${row.engine_slug ?? ''}`;
}

async function fetchExistingQueueState() {
  const data = await selectAllQueueRows('id, year, make_slug, model_slug, engine_slug, status');

  const keys = new Set();
  const statusCounts = {};

  for (const row of data ?? []) {
    keys.add(queueKey(row));
    const status = row.status ?? 'unknown';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return { keys, statusCounts };
}

async function selectAllQueueRows(selectColumns) {
  const pageSize = 1000;
  const rows = [];
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from('openlabor_import_queue')
      .select(selectColumns)
      .range(start, start + pageSize - 1);

    if (error) throw error;

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;

    start += pageSize;
  }

  return rows;
}

async function insertRowsInChunks(rows, chunkSize = 100) {
  let inserted = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('openlabor_import_queue')
      .insert(chunk)
      .select('id');

    if (error) throw error;

    inserted += data?.length ?? 0;
  }

  return inserted;
}

async function countPendingQueueRows() {
  const { count, error } = await supabase
    .from('openlabor_import_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) throw error;
  return count ?? 0;
}

async function countQueueStatuses() {
  const data = await selectAllQueueRows('status');

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
  const options = parseCliArgs();
  const targets = buildTargets(options);
  const delayMs = Math.max(0, parseNumber(options.delayMs, DEFAULT_DELAY_MS));
  const debug = isEnabled(options.debug);
  const dryRun = isEnabled(options.dryRun) || isEnabled(options['dry-run']);
  const maxQueueRowsOption = parseNumber(options.maxQueueRows, null);
  const maxQueueRows = Number.isFinite(maxQueueRowsOption) && maxQueueRowsOption >= 0
    ? Math.floor(maxQueueRowsOption)
    : null;
  const plan = getPlan(options, targets, delayMs);

  printPlan(plan);

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
  let debugPrinted = false;
  let stoppedEarlyReason = null;
  let remainingDailyRateLimit = null;

  for (let index = 0; index < targets.length; index += 1) {
    if (maxQueueRows !== null && summary.inserted >= maxQueueRows) {
      stoppedEarlyReason = `maxQueueRows reached (${maxQueueRows})`;
      break;
    }

    const target = targets[index];
    summary.attempted += 1;

    console.log(`[${index + 1}/${targets.length}] Checking ${targetLabel(target)}...`);

    try {
      const catalogResult = await fetchEngineCatalog(target);
      remainingDailyRateLimit = catalogResult.rateLimit?.remainingDaily ?? remainingDailyRateLimit;

      if (debug && !debugPrinted) {
        printSampleCatalogRow(catalogResult.rows);
        debugPrinted = true;
      }

      if (catalogResult.notFound) {
        console.log('  catalog rows: 0; engine rows: 0; inserted: 0; existing: 0; skipped/no catalog: yes');
        summary.noCatalog += 1;
      } else {
        const matchingYearRows = catalogResult.rows.filter((row) => yearRangeIncludes(target.year, row));
        const queueRows = buildQueueRows(target, matchingYearRows);
        const newRows = queueRows.filter((row) => !existingQueue.keys.has(queueKey(row)));
        const remainingQueueSlots = maxQueueRows === null
          ? newRows.length
          : Math.max(0, maxQueueRows - summary.inserted);
        const rowsToInsert = newRows.slice(0, remainingQueueSlots);
        const insertedCount = dryRun || rowsToInsert.length === 0
          ? 0
          : await insertRowsInChunks(rowsToInsert);

        for (const row of rowsToInsert) existingQueue.keys.add(queueKey(row));

        summary.catalogRowsFound += catalogResult.rows.length;
        summary.matchingEngineRowsFound += queueRows.length;
        summary.inserted += insertedCount;
        summary.alreadyExisting += queueRows.length - newRows.length;

        console.log(
          `  catalog rows: ${catalogResult.rows.length}; engine rows: ${queueRows.length}; inserted: ${insertedCount}${dryRun ? ' (dry run)' : ''}; existing: ${queueRows.length - newRows.length}; skipped/no catalog: no`,
        );

        if (maxQueueRows !== null && !dryRun && rowsToInsert.length < newRows.length) {
          stoppedEarlyReason = `maxQueueRows reached (${maxQueueRows})`;
          break;
        }
      }

      const remainingMinute = catalogResult.rateLimit?.remainingMinute;
      if (remainingDailyRateLimit !== null || remainingMinute !== null) {
        console.log(
          `  rate limit remaining: daily ${remainingDailyRateLimit ?? 'unknown'}; minute ${remainingMinute ?? 'unknown'}`,
        );
      }

      if (remainingDailyRateLimit !== null && remainingDailyRateLimit < LOW_DAILY_RATE_LIMIT_THRESHOLD) {
        stoppedEarlyReason = `remaining daily Open Labor rate limit is below ${LOW_DAILY_RATE_LIMIT_THRESHOLD} (${remainingDailyRateLimit})`;
        break;
      }
    } catch (error) {
      summary.failed += 1;
      failedTargets.push({ target, error });
      console.error(`  failed: ${formatError(error)}`);
    }

    if (index < targets.length - 1) await sleep(delayMs);
  }

  const pendingCount = await countPendingQueueRows();
  const statusCounts = await countQueueStatuses();

  console.log('engine batch seed complete');
  if (stoppedEarlyReason) {
    console.log(`stopped early: ${stoppedEarlyReason}`);
  }
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

  console.log(`remaining daily rate limit: ${remainingDailyRateLimit ?? 'unknown'}`);

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
