import { requireAccess } from '../auth';
import type { FinanceData, Operation } from '../../app/finance-types';
import { currentMonthStart, validDate, validPeriod } from '../../app/models/finance-ui-model';
import { type FinancialReserve } from '../../app/models/reserve-model';
import {
  amount,
  json,
  majorAmount,
  sumMinor,
  text,
  unavailable,
  type DatabaseRow,
  type FinanceDatabase
} from '../database';

export async function GET(request: Request, database?: FinanceDatabase) {
  const access = await requireAccess(request);
  if (access instanceof Response) return access;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const requestedMonth = url.searchParams.get('month');
  if ((from !== null || to !== null) && (!from || !to || !validPeriod({ from, to })))
    return json({ error: 'Invalid date range' }, 400);
  if (requestedMonth && (!validDate(requestedMonth) || !requestedMonth.endsWith('-01')))
    return json({ error: 'Invalid month' }, 400);
  const month = requestedMonth || currentMonthStart();
  if (!database) return unavailable();
  try {
    const next = new Date(`${month}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const operationSql = `SELECT o.*, c.name AS category, a.name AS account, p.title AS plan_title, r.title AS reserve_name,
      (SELECT COUNT(*) FROM receipt_items i WHERE i.operation_id=o.id) AS receipt_item_count
      FROM operations o LEFT JOIN categories c ON c.id=o.category_id LEFT JOIN accounts a ON a.id=o.account_id
      LEFT JOIN monthly_plan_items p ON p.id=o.plan_item_id LEFT JOIN reserves r ON r.id=o.reserve_id
      ${from && to ? 'WHERE o.operation_date>=? AND o.operation_date<=?' : ''} ORDER BY o.operation_date DESC,o.operation_time DESC,o.id`;
    const statements = [
      database.prepare(operationSql).bind(...(from && to ? [from, to] : [])),
      database.prepare('SELECT * FROM accounts ORDER BY name,id'),
      database
        .prepare(
          `SELECT p.*, c.name AS category,c.section,
        COALESCE((SELECT SUM(o.amount_minor) FROM operations o WHERE o.operation_type='Расход'
        AND o.category_id=p.category_id AND o.currency=p.currency AND o.operation_date>=? AND o.operation_date<?),0) AS actual_minor
        FROM monthly_plan_items p JOIN categories c ON c.id=p.category_id WHERE p.month=? ORDER BY c.section,p.amount_minor DESC,p.id`
        )
        .bind(month, next.toISOString().slice(0, 10), month),
      database
        .prepare(
          `SELECT i.*, c.name AS category FROM receipt_items i LEFT JOIN categories c ON c.id=i.category_id
        JOIN operations o ON o.id=i.operation_id ${from && to ? 'WHERE o.operation_date>=? AND o.operation_date<=?' : ''} ORDER BY i.id`
        )
        .bind(...(from && to ? [from, to] : [])),
      database.prepare(
        'SELECT r.*,a.name AS account FROM reserves r JOIN accounts a ON a.id=r.account_id ORDER BY r.id'
      ),
      database.prepare(`SELECT e.*,r.title AS reserve,a.name AS account,r.currency FROM reserve_events e
        JOIN reserves r ON r.id=e.reserve_id JOIN accounts a ON a.id=r.account_id ORDER BY e.event_date DESC,e.id`)
    ];
    const results = await database.batch<DatabaseRow>(statements);
    if (
      results.length !== statements.length ||
      results.some((result) => !result.success || !Array.isArray(result.results))
    )
      throw new Error('Incomplete database response');
    const [journal, accounts, plan, receiptItems, reserves, events] = results.map(
      (result) => result.results
    );
    const goals: FinancialReserve[] = reserves.map((row) => {
      const target = amount(row, 'target_minor'),
        saved = amount(row, 'saved_minor');
      return {
        id: text(row, 'id'),
        title: text(row, 'title'),
        accountId: text(row, 'account_id'),
        account: text(row, 'account'),
        currency: text(row, 'currency'),
        kind: text(row, 'kind'),
        archived: row['archived'] === 1,
        priority: text(row, 'priority'),
        status: text(row, 'status'),
        target,
        saved,
        spent: amount(row, 'spent_minor'),
        progress: target && saved !== null ? (saved / target) * 100 : null,
        deadline: text(row, 'deadline')
      };
    });
    const operations: Operation[] = journal.map((row) => ({
      id: text(row, 'id'),
      operationType: text(row, 'operation_type') as Operation['operationType'],
      title: text(row, 'title') || 'Операция без названия',
      merchant: text(row, 'merchant'),
      amount: amount(row, 'amount_minor')!,
      currency: text(row, 'currency') as Operation['currency'],
      isoDate: text(row, 'operation_date'),
      date: new Date(`${text(row, 'operation_date')}T12:00:00Z`).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Belgrade'
      }),
      time: text(row, 'operation_time'),
      category: text(row, 'category') || 'Без категории',
      account: text(row, 'account') || 'Счёт не указан',
      shortAccount: text(row, 'account') || 'Счёт не указан',
      plan:
        text(row, 'plan_title') ||
        (plan.find(
          (p) =>
            p['category_id'] === row['category_id'] &&
            p['currency'] === row['currency'] &&
            text(row, 'operation_date').startsWith(month.slice(0, 7))
        )?.['title'] as string) ||
        'Не привязана',
      reserveName: text(row, 'reserve_name'),
      reserveAmount: amount(row, 'reserve_amount_minor')!,
      source: text(row, 'source') as Operation['source'],
      status: text(row, 'status') as Operation['status'],
      participant: text(row, 'participant') as Operation['participant'],
      note: text(row, 'note'),
      items: Number(row['receipt_item_count'])
    }));
    const receiptGroups = new Map<string, DatabaseRow[]>();
    for (const item of receiptItems) {
      const id = text(item, 'operation_id');
      receiptGroups.set(id, [...(receiptGroups.get(id) ?? []), item]);
    }
    const data: FinanceData = {
      operations,
      accounts: accounts
        .filter((row) => row['active'] === 1)
        .map((row) => {
          const balance = amount(row, 'balance_minor');
          const accountReserves = reserves.filter((reserve) => reserve['account_id'] === row['id']);
          const reserved = accountReserves.some((reserve) => reserve['saved_minor'] === null)
            ? null
            : sumMinor(accountReserves, 'saved_minor') / 100;
          const availableMinor =
            reserved !== null && row['balance_minor'] !== null
              ? Number(row['balance_minor']) - sumMinor(accountReserves, 'saved_minor')
              : null;
          return {
            id: text(row, 'id'),
            name: text(row, 'name'),
            balance,
            reserved,
            available: availableMinor === null ? null : majorAmount(availableMinor),
            reserveNames: goals
              .filter((goal) => goal.accountId === row['id'] && !goal.archived)
              .map((goal) => goal.title),
            currency: text(row, 'currency'),
            active: true,
            includeInCapital: row['include_in_capital'] === 1,
            owner: text(row, 'owner'),
            kind: text(row, 'kind'),
            bank: text(row, 'bank'),
            mask: text(row, 'mask')
          };
        }),
      monthlyPlan: {
        month,
        items: plan.map((row) => ({
          id: text(row, 'id'),
          title: text(row, 'title'),
          section: text(row, 'section'),
          category: text(row, 'category'),
          amount: amount(row, 'amount_minor')!,
          actual: amount(row, 'actual_minor')!,
          currency: text(row, 'currency')
        }))
      },
      receipts: {
        items: operations.flatMap((operation) => {
          const items = receiptGroups.get(operation.id);
          if (!items) return [];
          // A receipt may have multiple currencies: never add those amounts together.
          return [...new Set(items.map((item) => text(item, 'currency')))].map((currency) => {
            const same = items.filter((item) => item['currency'] === currency);
            const total = sumMinor(same, 'amount_minor');
            const categories = new Map<string, number>();
            for (const item of same) {
              const category = text(item, 'category') || 'Другое';
              categories.set(
                category,
                (categories.get(category) ?? 0) + Number(item['amount_minor'])
              );
            }
            return {
              operationId: operation.id,
              title: operation.merchant || operation.title,
              itemCount: same.length,
              total: total / 100,
              currency,
              categories: [...categories]
                .map(([name, minor]) => ({
                  name,
                  amount: minor / 100,
                  percent: total ? (minor / total) * 100 : 0
                }))
                .sort((a, b) => b.amount - a.amount)
            };
          });
        })
      },
      goals: {
        items: goals,
        history: events.map((row) => ({
          id: text(row, 'id'),
          reserveId: text(row, 'reserve_id'),
          reserve: text(row, 'reserve'),
          account: text(row, 'account'),
          currency: text(row, 'currency'),
          type: text(row, 'event_type') as 'Пополнение',
          amount: amount(row, 'amount_minor')!,
          date: text(row, 'event_date'),
          title: text(row, 'title')
        }))
      },
      updatedAt: new Date().toISOString()
    };
    return json(data);
  } catch {
    return unavailable();
  }
}
