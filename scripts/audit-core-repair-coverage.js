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

// Service role key is used only in local/server-side scripts. Never expose this in React/browser code.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const CORE_OWNERSHIP_REPAIR_SLUGS = [
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
];

const CORE_REPAIR_SLUG_SET = new Set(CORE_OWNERSHIP_REPAIR_SLUGS);

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

function parseNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isEnabled(value) {
  return value === true || String(value ?? '').toLowerCase() === 'true';
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function formatScore(score) {
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? numericScore.toFixed(1).replace(/\.0$/, '') : 'no score';
}

function getVehicleTitle(vehicle) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

function getVehicleConfiguration(vehicle) {
  if (hasText(vehicle.engine)) return vehicle.engine.trim();
  if (hasText(vehicle.source_engine_slug)) return vehicle.source_engine_slug.trim();
  return 'Base / unspecified engine';
}

function getCoverageLabel(coreCount) {
  if (coreCount >= 16) return 'Strong coverage';
  if (coreCount >= 10) return 'Good coverage';
  if (coreCount >= 5) return 'Limited coverage';
  return 'Early estimate';
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getTopEntries(map, limit = 20) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

async function selectAllRows(tableName, selectColumns) {
  const pageSize = 1000;
  const rows = [];
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .range(start, start + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${tableName}: ${error.message}`);
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
    start += pageSize;
  }

  return rows;
}

function buildRepairScoresByVehicleId(repairScores) {
  const map = new Map();

  for (const repairScore of repairScores) {
    if (!map.has(repairScore.vehicle_id)) {
      map.set(repairScore.vehicle_id, []);
    }

    map.get(repairScore.vehicle_id).push(repairScore);
  }

  return map;
}

function analyzeVehicle(vehicle, vehicleScore, repairScores, repairTaskById) {
  const presentCoreSlugs = new Set();
  const missingLaborSlugs = new Set();
  const missingScoreSlugs = new Set();

  for (const repairScore of repairScores ?? []) {
    const repairTask = repairTaskById.get(repairScore.repair_task_id);
    const slug = repairTask?.source_job_slug;

    if (!slug || !CORE_REPAIR_SLUG_SET.has(slug)) continue;

    presentCoreSlugs.add(slug);

    if (repairScore.labor_hours === null || repairScore.labor_hours === undefined) {
      missingLaborSlugs.add(slug);
    }

    if (repairScore.wrenchability_score === null || repairScore.wrenchability_score === undefined) {
      missingScoreSlugs.add(slug);
    }
  }

  const missingCoreSlugs = CORE_OWNERSHIP_REPAIR_SLUGS.filter((slug) => !presentCoreSlugs.has(slug));
  const coreCount = presentCoreSlugs.size;

  return {
    vehicleId: vehicle.id,
    title: getVehicleTitle(vehicle),
    configuration: getVehicleConfiguration(vehicle),
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    engine: vehicle.engine,
    source_engine_slug: vehicle.source_engine_slug,
    overall_score: vehicleScore?.overall_score ?? null,
    score_label: vehicleScore?.score_label ?? null,
    coreCount,
    coverageLabel: getCoverageLabel(coreCount),
    missingCoreSlugs,
    missingLaborSlugs: [...missingLaborSlugs],
    missingScoreSlugs: [...missingScoreSlugs],
    hasVehicleScore: Boolean(vehicleScore),
  };
}

function shouldIncludeVehicle(vehicle, options) {
  const makeFilter = normalizeText(options.make);
  const modelFilter = normalizeText(options.model);

  if (makeFilter && normalizeText(vehicle.make) !== makeFilter) return false;
  if (modelFilter && normalizeText(vehicle.model) !== modelFilter) return false;

  return true;
}

function buildSummary(vehicles, analyses) {
  const vehiclesWithScores = analyses.filter((analysis) => analysis.hasVehicleScore).length;
  const totalCoreCount = analyses.reduce((total, analysis) => total + analysis.coreCount, 0);
  const averageCoreCoverageCount = analyses.length > 0 ? totalCoreCount / analyses.length : 0;

  return {
    totalVehicles: vehicles.length,
    vehiclesWithVehicleScores: vehiclesWithScores,
    vehiclesMissingVehicleScores: analyses.length - vehiclesWithScores,
    averageCoreRepairCoverageCount: Number(averageCoreCoverageCount.toFixed(2)),
    strongCoverageCount: analyses.filter((analysis) => analysis.coreCount >= 16).length,
    goodCoverageCount: analyses.filter((analysis) => analysis.coreCount >= 10 && analysis.coreCount < 16).length,
    limitedCoverageCount: analyses.filter((analysis) => analysis.coreCount >= 5 && analysis.coreCount < 10).length,
    earlyEstimateCount: analyses.filter((analysis) => analysis.coreCount < 5).length,
    vehiclesWithAll20CoreRepairs: analyses.filter((analysis) => analysis.coreCount === 20).length,
    vehiclesWithZeroCoreRepairs: analyses.filter((analysis) => analysis.coreCount === 0).length,
  };
}

function buildMissingFrequency(analyses) {
  const missingFrequency = new Map(CORE_OWNERSHIP_REPAIR_SLUGS.map((slug) => [slug, 0]));

  for (const analysis of analyses) {
    for (const slug of analysis.missingCoreSlugs) {
      incrementMap(missingFrequency, slug);
    }
  }

  return getTopEntries(missingFrequency, CORE_OWNERSHIP_REPAIR_SLUGS.length)
    .map(([slug, missingCount]) => ({ slug, missingCount }));
}

function getWeakVehicles(analyses, minCore, limit) {
  return analyses
    .filter((analysis) => analysis.coreCount < minCore)
    .sort((left, right) => (
      left.coreCount - right.coreCount ||
      Number(left.overall_score ?? -1) - Number(right.overall_score ?? -1) ||
      left.title.localeCompare(right.title) ||
      left.configuration.localeCompare(right.configuration)
    ))
    .slice(0, limit);
}

function getStrongVehicles(analyses, limit) {
  return [...analyses]
    .sort((left, right) => (
      right.coreCount - left.coreCount ||
      Number(right.overall_score ?? -1) - Number(left.overall_score ?? -1) ||
      left.title.localeCompare(right.title) ||
      left.configuration.localeCompare(right.configuration)
    ))
    .slice(0, limit);
}

function printSection(title) {
  console.log(`\n${title}`);
}

function printVehicleLine(analysis, includeMissing = false) {
  const score = formatScore(analysis.overall_score);
  const label = analysis.score_label ?? '';
  const scoreText = label ? `${score} ${label}` : score;
  const missing = analysis.missingCoreSlugs.slice(0, 8).join(', ');
  const missingText = includeMissing && missing ? ` | missing: ${missing}` : '';

  console.log(
    `${analysis.title} - ${analysis.configuration} | ${scoreText} | ${analysis.coreCount}/20 ${analysis.coverageLabel}${missingText}`,
  );
}

function printHumanReport(report, options) {
  console.log('Wrenchable Cars core repair coverage audit');

  if (hasText(options.make) || hasText(options.model)) {
    console.log(`filters: make=${options.make ?? 'all'} model=${options.model ?? 'all'}`);
  }

  printSection('Summary');
  console.log(`total vehicles: ${report.summary.totalVehicles}`);
  console.log(`vehicles with vehicle_scores: ${report.summary.vehiclesWithVehicleScores}`);
  console.log(`vehicles missing vehicle_scores: ${report.summary.vehiclesMissingVehicleScores}`);
  console.log(`average core repair coverage count: ${report.summary.averageCoreRepairCoverageCount}/20`);
  console.log(`strong coverage count: ${report.summary.strongCoverageCount}`);
  console.log(`good coverage count: ${report.summary.goodCoverageCount}`);
  console.log(`limited coverage count: ${report.summary.limitedCoverageCount}`);
  console.log(`early estimate count: ${report.summary.earlyEstimateCount}`);
  console.log(`vehicles with all 20 core repairs: ${report.summary.vehiclesWithAll20CoreRepairs}`);
  console.log(`vehicles with zero core repairs: ${report.summary.vehiclesWithZeroCoreRepairs}`);

  printSection(`Weakest core coverage vehicles below ${report.minCore}/20`);
  if (report.weakVehicles.length === 0) {
    console.log('none');
  } else {
    for (const analysis of report.weakVehicles) {
      printVehicleLine(analysis, true);
    }
  }

  printSection('Strongest core coverage vehicles');
  if (report.strongVehicles.length === 0) {
    console.log('none');
  } else {
    for (const analysis of report.strongVehicles) {
      printVehicleLine(analysis);
    }
  }

  printSection('Missing most often');
  for (const row of report.missingFrequency) {
    console.log(`- ${row.slug}: missing on ${row.missingCount} vehicles`);
  }
}

async function main() {
  const options = parseCliArgs();
  const minCore = parseNumber(options.minCore, 10);
  const limit = parseNumber(options.limit, 20);
  const jsonOutput = isEnabled(options.json);

  const [allVehicles, vehicleScores, repairScores, repairTasks] = await Promise.all([
    selectAllRows('vehicles', 'id, year, make, model, engine, source_engine_slug'),
    selectAllRows('vehicle_scores', 'vehicle_id, overall_score, score_label'),
    selectAllRows('repair_scores', 'vehicle_id, repair_task_id, labor_hours, wrenchability_score'),
    selectAllRows('repair_tasks', 'id, name, source_job_slug, category'),
  ]);

  const vehicles = allVehicles.filter((vehicle) => shouldIncludeVehicle(vehicle, options));
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const repairTaskById = new Map(repairTasks.map((repairTask) => [repairTask.id, repairTask]));
  const vehicleScoreByVehicleId = new Map(vehicleScores.map((score) => [score.vehicle_id, score]));
  const repairScoresByVehicleId = buildRepairScoresByVehicleId(
    repairScores.filter((repairScore) => vehicleIds.has(repairScore.vehicle_id)),
  );

  const analyses = vehicles.map((vehicle) => analyzeVehicle(
    vehicle,
    vehicleScoreByVehicleId.get(vehicle.id),
    repairScoresByVehicleId.get(vehicle.id) ?? [],
    repairTaskById,
  ));

  const report = {
    summary: buildSummary(vehicles, analyses),
    minCore,
    limit,
    weakVehicles: getWeakVehicles(analyses, minCore, limit),
    strongVehicles: getStrongVehicles(analyses, limit),
    missingFrequency: buildMissingFrequency(analyses),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report, options);
}

main().catch((error) => {
  console.error(`Core repair coverage audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
