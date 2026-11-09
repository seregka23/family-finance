/** Small structural subset of native D1; request bindings are never stored globally. */
export type FinanceDatabase = Pick<Env['DB'], 'prepare' | 'batch'>;
export type DatabaseRow = Record<string, string | number | null>;
export async function query(
  database: FinanceDatabase,
  sql: string,
  values: (string | number | null)[] = []
) {
  const result = await database
    .prepare(sql)
    .bind(...values)
    .all<DatabaseRow>();
  if (!result.success || !Array.isArray(result.results)) throw new Error('Database query failed');
  return result.results;
}
export const text = (row: DatabaseRow, key: string) => String(row[key] ?? '');
// Leave a factor of 100 below the integer precision ceiling for major-unit
// conversion and the dashboard's subsequent multiplication back to hundredths.
export const MAX_REPORT_MINOR = Math.floor(Number.MAX_SAFE_INTEGER / 100);
export function majorAmount(minor: number): number {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_REPORT_MINOR)
    throw new Error('Money exceeds reportable range');
  const major = minor / 100;
  if (Math.round(major * 100) !== minor) throw new Error('Money loses minor-unit precision');
  return major;
}
export function amount(row: DatabaseRow, key: string): number | null {
  return row[key] === null ? null : majorAmount(Number(row[key]));
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const unavailable = () => json({ error: 'Database unavailable' }, 503);

/** Keep sums in integer hundredths and reject totals outside JavaScript's exact range. */
export function sumMinor(rows: DatabaseRow[], key: string): number {
  let total = 0;
  for (const row of rows) {
    const value = row[key];
    if (value === null || !Number.isSafeInteger(value)) throw new Error('Invalid money');
    total += Number(value);
    majorAmount(total);
  }
  return total;
}
