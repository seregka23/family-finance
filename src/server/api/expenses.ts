import { aggregateExpenses, monthBounds } from '../../app/models/expense-model';

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  });

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get('month') ?? '';
  try {
    monthBounds(month);
  } catch {
    return json({ error: 'Invalid month' }, 400);
  }
  return json(aggregateExpenses([], month));
}
