import { requireAccess } from '../auth';
import { json, unavailable, type FinanceDatabase } from '../database';
export async function GET(request: Request, database?: FinanceDatabase): Promise<Response> {
  const user = await requireAccess(request, database);
  if (user instanceof Response) return user;
  try {
    const results = await database!.batch([
      database!.prepare('SELECT id,name,currency FROM accounts WHERE active=1 ORDER BY name,id'),
      database!.prepare('SELECT id,name,section FROM categories ORDER BY section,name,id')
    ]);
    if (
      results.length !== 2 ||
      results.some((result) => !result.success || !Array.isArray(result.results))
    )
      throw new Error('Options query failed');
    return json({ accounts: results[0].results, categories: results[1].results });
  } catch {
    console.error(
      JSON.stringify({ event: 'transaction_failure', stage: 'options', code: 'database_failure' })
    );
    return unavailable();
  }
}
