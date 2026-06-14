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

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const seedVehicleGroups = [
  { make: 'Ford', model: 'F-150', priority: 100 },
  { make: 'Chevrolet', model: 'Silverado 1500', priority: 100 },
  { make: 'Ram', model: '1500', priority: 100 },
  { make: 'Toyota', model: 'Tacoma', priority: 100 },
  { make: 'Toyota', model: 'RAV4', priority: 95 },
  { make: 'Honda', model: 'CR-V', priority: 95 },
  { make: 'Toyota', model: 'Highlander', priority: 95 },
  { make: 'Honda', model: 'Pilot', priority: 95 },
  { make: 'Ford', model: 'Explorer', priority: 95 },
  { make: 'Jeep', model: 'Grand Cherokee', priority: 95 },
  { make: 'Chevrolet', model: 'Tahoe', priority: 95 },
  { make: 'Chevrolet', model: 'Equinox', priority: 95 },
  { make: 'Ford', model: 'Escape', priority: 95 },
  { make: 'Subaru', model: 'Outback', priority: 95 },
  { make: 'Nissan', model: 'Rogue', priority: 95 },
  { make: 'Toyota', model: 'Camry', priority: 90 },
  { make: 'Honda', model: 'Accord', priority: 90 },
  { make: 'Toyota', model: 'Corolla', priority: 90 },
  { make: 'Honda', model: 'Civic', priority: 90 },
  { make: 'Nissan', model: 'Altima', priority: 90 },
];

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSeedRows() {
  const rows = [];

  for (const group of seedVehicleGroups) {
    for (let year = 2010; year <= 2020; year += 1) {
      rows.push({
        year,
        make: group.make,
        model: group.model,
        make_slug: slugify(group.make),
        model_slug: slugify(group.model),
        engine: null,
        engine_slug: null,
        priority: group.priority,
      });
    }
  }

  return rows;
}

async function fetchExistingQueueKeys(rows) {
  const { data, error } = await supabase
    .from('openlabor_import_queue')
    .select('id, year, make_slug, model_slug, engine_slug');

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) => `${row.year}|${row.make_slug}|${row.model_slug}|${row.engine_slug ?? ''}`),
  );
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

async function main() {
  const seedRows = buildSeedRows();
  const existingKeys = await fetchExistingQueueKeys(seedRows);

  const rowsToInsert = seedRows.filter((row) => !existingKeys.has(`${row.year}|${row.make_slug}|${row.model_slug}|${row.engine_slug ?? ''}`));
  const insertedCount = rowsToInsert.length > 0 ? await insertRowsInChunks(rowsToInsert) : 0;
  const alreadyExistedCount = seedRows.length - rowsToInsert.length;
  const pendingCount = await countPendingQueueRows();
  const statusCounts = await countQueueStatuses();

  console.log(`total vehicles in seed list: ${seedRows.length}`);
  console.log(`rows attempted: ${rowsToInsert.length}`);
  console.log(`inserted count: ${insertedCount}`);
  console.log(`already existed count: ${alreadyExistedCount}`);
  console.log(`total pending queue rows after seeding: ${pendingCount}`);
  console.log('queue status counts:');

  for (const status of Object.keys(statusCounts).sort()) {
    console.log(`  ${status}: ${statusCounts[status]}`);
  }
}

main().catch((error) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});