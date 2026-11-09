import { requireAccess } from '../auth';
import { aggregateExpenses, monthBounds } from '../../app/models/expense-model';
import {
  amount,
  json,
  query,
  sumMinor,
  text,
  unavailable,
  type FinanceDatabase
} from '../database';

export async function GET(request: Request, database?: FinanceDatabase) {
  const access = await requireAccess(request);
  if (access instanceof Response) return access;
  const month = new URL(request.url).searchParams.get('month') ?? '';
  let bounds;
  try {
    bounds = monthBounds(month);
  } catch {
    return json({ error: 'Invalid month' }, 400);
  }
  if (!database) return unavailable();
  try {
    const rows = await query(
      database,
      `SELECT o.*, c.name AS category, c.include_in_reports FROM operations o
      LEFT JOIN categories c ON c.id=o.category_id
      WHERE o.operation_type=? AND o.operation_date>=? AND o.operation_date<? ORDER BY o.operation_date,o.id`,
      ['Расход', bounds.from, bounds.next]
    );
    for (const currency of new Set(rows.map((row) => row['currency'])))
      sumMinor(
        rows.filter((row) => row['currency'] === currency),
        'amount_minor'
      );
    return json(
      aggregateExpenses(
        rows.map((row) => ({
          id: text(row, 'id'),
          date: text(row, 'operation_date'),
          amount: amount(row, 'amount_minor'),
          currency: text(row, 'currency'),
          category: text(row, 'category'),
          review: row['status'] !== 'Готово',
          merchant: text(row, 'merchant'),
          title: text(row, 'title'),
          includeInReports: row['include_in_reports'] !== 0
        })),
        month
      )
    );
  } catch {
    return unavailable();
  }
}
