export function formatSupabaseError(error) {
  if (!error) return 'Unknown Supabase error';

  const parts = [];

  if (error.message) parts.push(`message: ${error.message}`);
  if (error.details) parts.push(`details: ${error.details}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  if (error.code) parts.push(`code: ${error.code}`);

  if (parts.length > 0) return parts.join('\n');

  return formatError(error);
}

export function formatError(error) {
  if (!error) return 'Unknown error';

  if (error instanceof Error) {
    const detailLines = [];

    if (error.message) detailLines.push(error.message);
    if (error.details) detailLines.push(`details: ${error.details}`);
    if (error.hint) detailLines.push(`hint: ${error.hint}`);
    if (error.code) detailLines.push(`code: ${error.code}`);
    if (error.stack) detailLines.push(error.stack);

    return detailLines.join('\n');
  }

  if (typeof error === 'string') return error;

  if (typeof error === 'object') {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}
