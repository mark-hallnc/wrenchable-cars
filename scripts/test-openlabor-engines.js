import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.OLP_API_KEY) {
  console.error('Missing OLP_API_KEY in .env.local');
  process.exit(1);
}

const apiKey = process.env.OLP_API_KEY;

function parseJsonSafely(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function collectRows(value, rows, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, rows, seen);
    return;
  }

  if (!isObject(value) || seen.has(value)) return;

  seen.add(value);

  if (
    'engineSlug' in value ||
    'engine_slug' in value ||
    'engine' in value ||
    'engineName' in value ||
    'name' in value
  ) {
    rows.push(value);
  }

  for (const nestedValue of Object.values(value)) {
    collectRows(nestedValue, rows, seen);
  }
}

async function main() {
  const url = new URL('https://openlaborproject.com/api/v1/engines');
  url.searchParams.set('make', 'ford');
  url.searchParams.set('model', 'f-150');
  url.searchParams.set('year', '2017');

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
    const errorCode = payload?.error?.code ?? payload?.code;

    if (response.status === 403 && errorCode === 'TIER_LOCKED') {
      console.log('The richer /engines endpoint requires a higher Open Labor tier for this key.');
      return;
    }

    const message = payload?.error?.message ?? payload?.message ?? responseText;
    throw new Error(`Open Labor /engines request failed with status ${response.status}. ${errorCode ? `${errorCode}: ` : ''}${message}`);
  }

  const rows = [];
  collectRows(payload, rows);

  console.log(`engine rows: ${rows.length}`);

  if (rows.length > 0) {
    console.log('sample row keys:');
    console.log(Object.keys(rows[0]).sort().join(', '));
    console.log('sample rows:');
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  }
}

main().catch((error) => {
  console.error(`Open Labor engines test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
