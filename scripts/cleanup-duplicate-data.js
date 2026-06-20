import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
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

// Service role key is used only in local/server-side maintenance scripts. Never expose this in React/browser code.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const TABLES = ['labor_estimates', 'repair_scores'];

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    limit: Number.POSITIVE_INFINITY,
    table: 'all',
    vehicleId: '',
  };

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;

    const separatorIndex = arg.indexOf('=');
    const key = arg.slice(2, separatorIndex > -1 ? separatorIndex : undefined);
    const value = separatorIndex > -1 ? arg.slice(separatorIndex + 1) : 'true';

    if (key === 'apply') {
      options.apply = value !== 'false';
    } else if (key === 'limit') {
      const limit = Number(value);
      options.limit = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : Number.POSITIVE_INFINITY;
    } else if (key === 'table') {
      options.table = value;
    } else if (key === 'vehicleId') {
      options.vehicleId = String(value ?? '').trim();
    }
  }

  if (options.table !== 'all' && !TABLES.includes(options.table)) {
    throw new Error('--table must be labor_estimates, repair_scores, or all');
  }

  return options;
}

function hasValidNumber(value) {
  return Number.isFinite(Number(value));
}

function compareStableIds(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function getTimestamp(row) {
  const timestamp = row.updated_at ? new Date(row.updated_at).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function chooseMostRecentlyUpdatedOrStable(existingRow, nextRow) {
  const existingUpdatedAt = getTimestamp(existingRow);
  const nextUpdatedAt = getTimestamp(nextRow);

  if (existingUpdatedAt !== null && nextUpdatedAt !== null && existingUpdatedAt !== nextUpdatedAt) {
    return nextUpdatedAt > existingUpdatedAt ? nextRow : existingRow;
  }

  if (existingUpdatedAt === null && nextUpdatedAt !== null) return nextRow;
  if (existingUpdatedAt !== null && nextUpdatedAt === null) return existingRow;

  return compareStableIds(nextRow, existingRow) < 0 ? nextRow : existingRow;
}

function chooseLaborEstimateWinner(existingRow, nextRow) {
  const existingHasLaborHours = hasValidNumber(existingRow.labor_hours);
  const nextHasLaborHours = hasValidNumber(nextRow.labor_hours);

  if (existingHasLaborHours !== nextHasLaborHours) {
    return nextHasLaborHours ? nextRow : existingRow;
  }

  if (existingHasLaborHours && nextHasLaborHours) {
    const existingHours = Number(existingRow.labor_hours);
    const nextHours = Number(nextRow.labor_hours);

    if (existingHours !== nextHours) {
      return nextHours < existingHours ? nextRow : existingRow;
    }
  }

  return chooseMostRecentlyUpdatedOrStable(existingRow, nextRow);
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
    const existingHours = Number(existingRow.labor_hours);
    const nextHours = Number(nextRow.labor_hours);

    if (existingHours !== nextHours) {
      return nextHours < existingHours ? nextRow : existingRow;
    }
  }

  if (!existingHasLaborHours && !nextHasLaborHours && existingHasScore && nextHasScore) {
    const existingScore = Number(existingRow.wrenchability_score);
    const nextScore = Number(nextRow.wrenchability_score);

    if (existingScore !== nextScore) {
      return nextScore > existingScore ? nextRow : existingRow;
    }
  }

  return chooseMostRecentlyUpdatedOrStable(existingRow, nextRow);
}

function getDuplicateKey(row) {
  return `${row.vehicle_id}|${row.repair_task_id}`;
}

function getGroups(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = getDuplicateKey(row);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  return groups;
}

function getDuplicateGroups(rows) {
  return [...getGroups(rows).entries()]
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([key, groupRows]) => ({ key, rows: groupRows }));
}

function chooseWinner(tableName, rows) {
  const choose = tableName === 'repair_scores' ? chooseRepairScoreWinner : chooseLaborEstimateWinner;

  return rows.reduce((winner, row) => choose(winner, row));
}

function getColumns(tableName, includeUpdatedAt = true) {
  const baseColumns = ['id', 'vehicle_id', 'repair_task_id'];

  if (tableName === 'labor_estimates') {
    baseColumns.push('labor_hours');
  } else {
    baseColumns.push('labor_hours', 'wrenchability_score');
  }

  if (includeUpdatedAt) {
    baseColumns.push('updated_at');
  }

  return baseColumns.join(', ');
}

async function selectAllRows(tableName, options = {}) {
  const pageSize = 1000;
  const rows = [];
  let start = 0;
  let includeUpdatedAt = true;

  while (true) {
    let query = supabase
      .from(tableName)
      .select(getColumns(tableName, includeUpdatedAt))
      .order('id', { ascending: true })
      .range(start, start + pageSize - 1);

    if (options.vehicleId) {
      query = query.eq('vehicle_id', options.vehicleId);
    }

    const { data, error } = await query;

    if (error && includeUpdatedAt && String(error.message ?? '').includes('updated_at')) {
      includeUpdatedAt = false;
      start = 0;
      rows.length = 0;
      continue;
    }

    if (error) {
      throw new Error(`Failed to fetch ${tableName}: ${formatSupabaseError(error)}`);
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;

    start += pageSize;
  }

  return rows;
}

async function deleteRowsById(tableName, ids) {
  let deletedCount = 0;

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabase
      .from(tableName)
      .delete()
      .in('id', chunk)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete ${tableName} duplicates: ${formatSupabaseError(error)}`);
    }

    deletedCount += data?.length ?? 0;
  }

  return deletedCount;
}

function buildCleanupPlan(tableName, duplicateGroups, limit) {
  const selectedGroups = duplicateGroups.slice(0, limit);
  const deleteIds = [];
  const examples = [];

  for (const group of selectedGroups) {
    const winner = chooseWinner(tableName, group.rows);
    const loserRows = group.rows
      .filter((row) => String(row.id) !== String(winner.id))
      .sort(compareStableIds);

    deleteIds.push(...loserRows.map((row) => row.id));

    if (examples.length < 10) {
      examples.push({
        key: group.key,
        vehicleId: winner.vehicle_id,
        repairTaskId: winner.repair_task_id,
        groupSize: group.rows.length,
        keepId: winner.id,
        deleteIds: loserRows.map((row) => row.id).slice(0, 8),
        keepLaborHours: winner.labor_hours ?? null,
        keepWrenchabilityScore: winner.wrenchability_score ?? null,
      });
    }
  }

  return {
    selectedGroups,
    deleteIds,
    examples,
  };
}

function printExamples(examples) {
  if (examples.length === 0) return;

  console.log('examples:');
  for (const example of examples) {
    console.log(
      `- ${example.key}; rows: ${example.groupSize}; keep: ${example.keepId}; delete: ${example.deleteIds.join(', ')}`,
    );
  }
}

async function processTable(tableName, options) {
  const rows = await selectAllRows(tableName, options);
  const duplicateGroups = getDuplicateGroups(rows);
  const plan = buildCleanupPlan(tableName, duplicateGroups, options.limit);

  console.log(`\n${tableName}`);
  console.log(`rows scanned: ${rows.length}`);
  console.log(`duplicate groups found: ${duplicateGroups.length}`);
  console.log(`duplicate groups selected: ${plan.selectedGroups.length}`);
  console.log(`rows that ${options.apply ? 'will be' : 'would be'} deleted: ${plan.deleteIds.length}`);
  printExamples(plan.examples);

  let deletedCount = 0;
  if (options.apply && plan.deleteIds.length > 0) {
    deletedCount = await deleteRowsById(tableName, plan.deleteIds);
    console.log(`rows deleted: ${deletedCount}`);
  } else if (!options.apply) {
    console.log('dry run only; pass --apply to delete duplicate rows.');
  }

  const remainingRows = await selectAllRows(tableName, options);
  const remainingDuplicateGroups = getDuplicateGroups(remainingRows);
  console.log(`remaining duplicate ${tableName} groups: ${remainingDuplicateGroups.length}`);

  return {
    tableName,
    rowsScanned: rows.length,
    duplicateGroupsFound: duplicateGroups.length,
    duplicateGroupsSelected: plan.selectedGroups.length,
    rowsPlannedForDelete: plan.deleteIds.length,
    rowsDeleted: deletedCount,
    remainingDuplicateGroups: remainingDuplicateGroups.length,
  };
}

async function main() {
  const options = parseCliArgs();
  const tables = options.table === 'all' ? TABLES : [options.table];

  console.log('Wrenchable Cars duplicate cleanup');
  console.log(`mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`tables: ${tables.join(', ')}`);
  console.log(`group limit per table: ${Number.isFinite(options.limit) ? options.limit : 'none'}`);
  if (options.vehicleId) console.log(`vehicleId filter: ${options.vehicleId}`);

  const summaries = [];

  for (const tableName of tables) {
    summaries.push(await processTable(tableName, options));
  }

  console.log('\nsummary');
  for (const summary of summaries) {
    console.log(
      `${summary.tableName}: duplicate groups found ${summary.duplicateGroupsFound}, selected ${summary.duplicateGroupsSelected}, rows deleted ${summary.rowsDeleted}, remaining duplicate groups ${summary.remainingDuplicateGroups}`,
    );
  }
}

main().catch((error) => {
  console.error('Duplicate cleanup failed:');
  console.error(formatError(error));
  process.exitCode = 1;
});
