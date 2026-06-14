import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.OLP_API_KEY;

if (!apiKey) {
  console.error('Missing OLP_API_KEY in .env.local');
  process.exit(1);
}

const outputDirectory = path.resolve(process.cwd(), 'scripts');
const sampleResponsePath = path.join(outputDirectory, 'openlabor-sample-response.json');
const dedupedJobsPath = path.join(outputDirectory, 'openlabor-deduped-jobs.json');

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

function findVehicleInfo(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVehicleInfo(item, seen);
      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isObject(value) || seen.has(value)) {
    return null;
  }

  seen.add(value);

  const keys = ['make', 'model', 'year'];
  const hasVehicleShape = keys.some((key) => key in value);

  if (hasVehicleShape) {
    return {
      make: value.make,
      model: value.model,
      year: value.year,
      engine: value.engine,
    };
  }

  for (const nestedValue of Object.values(value)) {
    const found = findVehicleInfo(nestedValue, seen);
    if (found) {
      return found;
    }
  }

  return null;
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

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  const url = new URL('https://openlaborproject.com/api/v1/labor-times');
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
  let payload = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorDetails = payload?.error;

    console.error(`Request failed with status ${response.status}`);

    if (errorDetails && (errorDetails.code || errorDetails.message)) {
      const codePart = errorDetails.code ?? 'unknown-code';
      const messagePart = errorDetails.message ?? 'No error message returned';
      console.error(`Error: ${codePart} - ${messagePart}`);
    } else {
      console.error('Error response received but no structured error details were returned.');
    }

    process.exit(1);
  }

  await writeFile(sampleResponsePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const collectedJobs = [];
  collectJobRecords(payload, collectedJobs);

  const uniqueJobs = [];
  const seenJobSlugs = new Set();

  for (const job of collectedJobs) {
    if (typeof job.jobSlug !== 'string' || seenJobSlugs.has(job.jobSlug)) {
      continue;
    }

    seenJobSlugs.add(job.jobSlug);
    uniqueJobs.push(job);
  }

  await writeFile(dedupedJobsPath, `${JSON.stringify(uniqueJobs, null, 2)}\n`, 'utf8');

  const vehicleInfo = findVehicleInfo(payload);
  const meta = isObject(payload) && isObject(payload.meta) ? payload.meta : {};

  if (vehicleInfo) {
    console.log('Vehicle:', JSON.stringify(vehicleInfo));
  }

  if (meta.engineCount !== undefined) {
    console.log(`meta.engineCount: ${meta.engineCount}`);
  }

  if (meta.totalJobs !== undefined) {
    console.log(`meta.totalJobs: ${meta.totalJobs}`);
  }

  console.log(`X-RateLimit-Tier: ${response.headers.get('X-RateLimit-Tier') ?? ''}`);
  console.log(`X-RateLimit-Remaining-Daily: ${response.headers.get('X-RateLimit-Remaining-Daily') ?? ''}`);
  console.log(`X-RateLimit-Reset-Daily: ${response.headers.get('X-RateLimit-Reset-Daily') ?? ''}`);

  console.log(`total raw job records found: ${collectedJobs.length}`);
  console.log(`total unique jobSlug records found: ${uniqueJobs.length}`);

  for (const job of uniqueJobs.slice(0, 20)) {
    console.log([
      getJobName(job),
      job.jobSlug,
      getJobCategory(job),
      job.hours,
      getJobConfidence(job),
    ].join(' | '));
  }
}

main().catch((error) => {
  console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});