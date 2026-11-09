import type { FinanceData } from '../../app/finance-types';
import { currentMonthStart, validDate, validPeriod } from '../../app/models/finance-ui-model';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const requestedMonth = url.searchParams.get('month');
  if ((from !== null || to !== null) && (!from || !to || !validPeriod({ from, to })))
    return json({ error: 'Invalid date range' }, 400);
  if (requestedMonth && (!validDate(requestedMonth) || !requestedMonth.endsWith('-01')))
    return json({ error: 'Invalid month' }, 400);
  const data: FinanceData = {
    operations: [],
    accounts: [],
    monthlyPlan: { month: requestedMonth || currentMonthStart(), items: [] },
    receipts: { items: [] },
    goals: { items: [], history: [] },
    updatedAt: new Date().toISOString()
  };
  return json(data);
}
