import {
  currentMonthStart,
  operationDay,
  validDate,
  validPeriod
} from '../../app/models/finance-ui-model';
import {
  categoryFor,
  categoryKey,
  categoryMap,
  propertyDate as date,
  propertyNumber as num,
  relationIds,
  sectionLabel,
  propertyText as text,
  type NotionPage
} from '../../app/models/notion-finance-model';
import { mapReserves, reservedForAccount, reserveHistory } from '../../app/models/reserve-model';
import { accountOwnerForEmail, isEmailAllowed } from '../access-control';
import { getChatGPTUser } from '../auth';

// Notion's current API queries the data source behind a database. The old
// /databases/:id/query endpoint started returning gateway errors after this
// workspace database was migrated to the newer data-source model.
const DATA_SOURCE_ID = 'd67250ad-1388-41bf-a0bb-4d7b588aea66';
const DATABASE_ID = 'cea34bd95bb844edb69b911a129b2fc7';
const ACCOUNTS_DATA_SOURCE_ID = '46e0c2f3-b40c-4330-855a-6fc7ec0a4530';
const MONTHLY_PLAN_DATA_SOURCE_ID = '0e6a8ec5-32cd-4634-847c-43bc8902d27e';
const RECEIPT_ITEMS_DATA_SOURCE_ID = 'db5f05fe-7e45-45cf-9d2a-a3a80edafe64';
const GOALS_DATA_SOURCE_ID = '79f3cb73-44ae-4e53-9958-06c7f850d6c6';
const RESERVE_MOVEMENTS_DATA_SOURCE_ID = 'f2b50e47-d9e6-4d03-95a8-f0967f3a3323';
const CATEGORIES_DATA_SOURCE_ID = '8d8dd025-16f8-424b-9386-ee16b1aa3095';

const notionHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Notion-Version': '2025-09-03',
  'Content-Type': 'application/json'
});

async function queryAllPages(
  token: string,
  dataSourceId: string,
  body: Record<string, unknown>,
  legacyDatabaseId?: string
) {
  const results: NotionPage[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let legacy = false;
  do {
    const query = () =>
      fetch(
        legacy
          ? `https://api.notion.com/v1/databases/${legacyDatabaseId}/query`
          : `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
        {
          method: 'POST',
          headers: {
            ...notionHeaders(token),
            ...(legacy ? { 'Notion-Version': '2022-06-28' } : {})
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            ...body,
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {})
          })
        }
      );
    let response = await query();
    if (response.status === 404 && legacyDatabaseId && !legacy) {
      legacy = true;
      response = await query();
    }
    if (!response.ok) throw new Error(`Notion ${dataSourceId} query failed: ${response.status}`);
    const payload = (await response.json()) as {
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    if (!Array.isArray(payload.results)) throw new Error('Incomplete Notion response');
    results.push(...payload.results);
    cursor = payload.has_more ? (payload.next_cursor ?? undefined) : undefined;
    if (payload.has_more && (!cursor || cursors.has(cursor)))
      throw new Error(`Notion ${dataSourceId} pagination incomplete`);
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return results;
}

async function optionalQuery(query: Promise<NotionPage[]>) {
  try {
    return { results: await query, ok: true };
  } catch {
    return { results: [] as NotionPage[], ok: false };
  }
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  const user = getChatGPTUser(request);
  if (!user) return json({ error: 'Authentication required' }, 401);
  if (!isEmailAllowed(user.email)) return json({ error: 'Access denied' }, 403);

  const token = process.env['NOTION_TOKEN'];
  if (!token) return json({ error: 'Notion is not configured' }, 503);

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const requestedMonth = url.searchParams.get('month');
    if ((from !== null || to !== null) && (!from || !to || !validPeriod({ from, to })))
      return json({ error: 'Invalid date range' }, 400);
    if (requestedMonth && (!validDate(requestedMonth) || !requestedMonth.endsWith('-01')))
      return json({ error: 'Invalid month' }, 400);
    const month = requestedMonth || currentMonthStart();
    const dateFilter =
      from && to
        ? {
            and: [
              { property: 'Дата', date: { on_or_after: from } },
              { property: 'Дата', date: { on_or_before: to } }
            ]
          }
        : undefined;
    const payload = {
      results: await queryAllPages(
        token,
        DATA_SOURCE_ID,
        {
          ...(dateFilter ? { filter: dateFilter } : {}),
          sorts: [{ property: 'Дата', direction: 'descending' }]
        },
        DATABASE_ID
      )
    };
    const operationIds = payload.results.map((page) => page.id);
    const receiptRequest = optionalQuery(
      (async () => {
        const rows: NotionPage[] = [];
        for (let index = 0; index < operationIds.length; index += 100)
          rows.push(
            ...(await queryAllPages(token, RECEIPT_ITEMS_DATA_SOURCE_ID, {
              filter: {
                or: operationIds
                  .slice(index, index + 100)
                  .map((id) => ({ property: 'Операция', relation: { contains: id } }))
              }
            }))
          );
        return Array.from(new Map(rows.map((row) => [row.id, row])).values());
      })()
    );
    const nextMonth = new Date(`${month}T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const [
      accountResponse,
      planResponse,
      categoryResponse,
      planOperationsResponse,
      receiptResponse,
      goalsResponse,
      reserveMovementsResponse,
      reservePaymentsResponse
    ] = await Promise.all([
      queryAllPages(token, ACCOUNTS_DATA_SOURCE_ID, {}),
      optionalQuery(
        queryAllPages(token, MONTHLY_PLAN_DATA_SOURCE_ID, {
          filter: { property: 'Месяц', date: { equals: month } }
        })
      ),
      queryAllPages(token, CATEGORIES_DATA_SOURCE_ID, {}),
      optionalQuery(
        queryAllPages(
          token,
          DATA_SOURCE_ID,
          {
            filter: {
              and: [
                { property: 'Тип', select: { equals: 'Расход' } },
                { property: 'Дата', date: { on_or_after: month } },
                { property: 'Дата', date: { before: nextMonth.toISOString().slice(0, 10) } }
              ]
            }
          },
          DATABASE_ID
        )
      ),
      receiptRequest,
      optionalQuery(queryAllPages(token, GOALS_DATA_SOURCE_ID, {})),
      optionalQuery(queryAllPages(token, RESERVE_MOVEMENTS_DATA_SOURCE_ID, {})),
      optionalQuery(
        queryAllPages(token, DATA_SOURCE_ID, {
          filter: { property: 'Резерв', relation: { is_not_empty: true } }
        })
      )
    ]);
    const accountPayload = { results: accountResponse };
    const planPayload = planResponse;
    const categoryPayload = { results: categoryResponse };
    const planOperationsPayload = planOperationsResponse;
    const receiptPayload = receiptResponse;
    const goalsPayload = goalsResponse;
    const categories = categoryMap(categoryPayload.results);
    const accountNames = new Map(
      accountPayload.results.map((page) => [page.id, text(page.properties['Счет'])])
    );
    const planNames = new Map(
      planPayload.results.map((page) => [
        page.id,
        text(page.properties['Строка плана']) ||
          text(page.properties['Категория']) ||
          'Статья плана'
      ])
    );
    const planByCategory = new Map(
      planPayload.results.flatMap((page) =>
        relationIds(page.properties['Category']).map(
          (id) =>
            [
              `${id}|${text(page.properties['Валюта плана']) || 'RSD'}`,
              text(page.properties['Строка плана']) || categories.get(id)?.name || 'Статья плана'
            ] as const
        )
      )
    );
    const goals = mapReserves(goalsPayload.results, accountNames);
    const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
    const history = reserveHistory(
      reserveMovementsResponse.results,
      reservePaymentsResponse.results,
      goals
    );
    const accountSummaries = accountPayload.results
      .filter((page) => page.properties['Активен']?.checkbox === true)
      .map((page) => {
        const p = page.properties;
        const balance = p['Текущий баланс']?.formula?.number ?? p['Текущий баланс']?.number ?? null;
        const reserved = goalsResponse.ok
          ? reservedForAccount(goals, page.id, text(p['Валюта']) || 'RSD')
          : null;
        return {
          reserved,
          available: balance !== null && reserved !== null ? balance - reserved : null,
          reserveNames: goals
            .filter((goal) => goal.accountId === page.id && !goal.archived)
            .map((goal) => goal.title),
          id: page.id,
          name: text(p['Счет']) || 'Счёт без названия',
          balance,
          currency: text(p['Валюта']) || 'RSD',
          active: true,
          includeInCapital: p['Включать в капитал']?.checkbox === true,
          owner: text(p['Владелец']),
          kind: text(p['Тип']),
          bank: text(p['Банк или эмитент']),
          mask: text(p['Маска карты или счета'])
        };
      });
    const operations = payload.results
      .filter((page) => ['Расход', 'Доход'].includes(text(page.properties['Тип'])))
      .map((page) => {
        const p = page.properties;
        const operationType = text(p['Тип']) as 'Расход' | 'Доход';
        const rawDate = date(p['Дата']);
        const parsed = new Date(rawDate);
        const resolvedCategory = categoryFor(p, categories);
        const relationId =
          p[operationType === 'Доход' ? 'Счет зачисления' : 'Счет списания']?.relation?.[0]?.id;
        const account =
          (relationId ? accountNames.get(relationId) : undefined) ||
          text(p['Счет (старое поле)']) ||
          'Счёт не указан';
        const directPlan = relationIds(p['Строка бюджета'])
          .map((id) => planNames.get(id))
          .filter(Boolean)
          .join(', ');
        const currency =
          text(p[operationType === 'Доход' ? 'Валюта зачисления' : 'Валюта списания']) ||
          text(p['Валюта бюджета']) ||
          'RSD';
        const plan =
          directPlan ||
          (operationDay(rawDate).startsWith(month.slice(0, 7)) && resolvedCategory.id
            ? planByCategory.get(`${resolvedCategory.id}|${currency}`)
            : '') ||
          'Не привязана';
        return {
          id: page.id,
          operationType,
          title:
            text(p['Операция']) || text(p['Магазин или получатель']) || 'Операция без названия',
          merchant: text(p['Магазин или получатель']),
          amount: num(p[operationType === 'Доход' ? 'Сумма зачисления' : 'Сумма списания']),
          currency,
          isoDate: rawDate,
          date: rawDate
            ? parsed.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                timeZone: 'Europe/Belgrade'
              })
            : 'Дата не указана',
          time: rawDate.includes('T')
            ? parsed.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Belgrade'
              })
            : '',
          category: resolvedCategory.name,
          account,
          shortAccount: account,
          plan,
          reserveName: goalsById.get(relationIds(p['Резерв'])[0])?.title ?? '',
          reserveAmount: num(p['Из резерва']),
          source: (text(p['Источник']) || 'SMS') as 'SMS',
          status: (text(p['Статус разбора']) || 'Нужна проверка') as 'Готово',
          participant: (text(p['Участник']) || 'Семья') as 'Семья',
          note: text(p['Комментарий']),
          notionUrl: page.url
        };
      });
    const operationById = new Map(operations.map((operation) => [operation.id, operation]));
    const receiptGroups = new Map<
      string,
      { itemCount: number; total: number; currency: string; categories: Map<string, number> }
    >();
    for (const page of receiptPayload.results) {
      const p = page.properties;
      const operationId = p['Операция']?.relation?.[0]?.id;
      if (!operationId || !operationById.has(operationId)) continue;
      const group = receiptGroups.get(operationId) ?? {
        itemCount: 0,
        total: 0,
        currency: text(p['Валюта']) || operationById.get(operationId)?.currency || 'RSD',
        categories: new Map<string, number>()
      };
      const amount = num(p['Сумма']);
      const category = text(p['Категория товара']) || 'Другое';
      group.itemCount += 1;
      group.total += amount;
      group.categories.set(category, (group.categories.get(category) ?? 0) + amount);
      receiptGroups.set(operationId, group);
    }
    const receipts = operations.flatMap((operation) => {
      const group = receiptGroups.get(operation.id);
      if (!group) return [];
      const total = group.total || operation.amount;
      return [
        {
          operationId: operation.id,
          title: operation.merchant || operation.title || 'Чек',
          itemCount: group.itemCount,
          total,
          currency: group.currency,
          notionUrl: operation.notionUrl,
          categories: Array.from(group.categories.entries())
            .map(([name, amount]) => ({
              name,
              amount,
              percent: total ? (amount / total) * 100 : 0
            }))
            .sort((first, second) => second.amount - first.amount)
        }
      ];
    });
    const sectionOrder = ['Обязательные расходы', 'Гибкие расходы', 'Сбережения и цели', 'Доход'];
    const actualByCategory = new Map<string, number>();
    for (const operation of planOperationsPayload.results) {
      const properties = operation.properties;
      const resolvedCategory = categoryFor(properties, categories);
      const currency =
        text(properties['Валюта списания']) || text(properties['Валюта бюджета']) || 'RSD';
      const keys = new Set([
        `${categoryKey(resolvedCategory.id, resolvedCategory.name)}|${currency}`,
        `${categoryKey('', resolvedCategory.name)}|${currency}`
      ]);
      for (const key of keys)
        actualByCategory.set(
          key,
          (actualByCategory.get(key) ?? 0) + num(properties['Сумма списания'])
        );
    }
    const planItems = planPayload.results
      .filter((page) => date(page.properties['Месяц']) === month)
      .map((page) => {
        const p = page.properties;
        const useManualActual = p['Использовать факт вручную']?.checkbox === true;
        const rollupActual = p['Факт по операциям']?.rollup?.number ?? 0;
        const resolvedCategory = categoryFor(p, categories);
        const currency = text(p['Валюта плана']) || 'RSD';
        const computedActual =
          actualByCategory.get(
            `${categoryKey(resolvedCategory.id, resolvedCategory.name)}|${currency}`
          ) ?? actualByCategory.get(`${categoryKey('', resolvedCategory.name)}|${currency}`);
        return {
          id: page.id,
          title: resolvedCategory.name || text(p['Строка плана']) || 'Статья плана',
          section: sectionLabel(resolvedCategory.meta?.section || text(p['Раздел'])),
          category: resolvedCategory.name,
          amount: num(p['План']),
          actual: useManualActual ? num(p['Факт вручную']) : (computedActual ?? rollupActual),
          currency,
          notionUrl: page.url
        };
      })
      .filter((item) => item.amount > 0)
      .sort((a, b) => {
        const sectionDifference = sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
        return sectionDifference || b.amount - a.amount;
      });
    return json({
      operations,
      accounts: accountSummaries,
      monthlyPlan: {
        month,
        items: planItems,
        unavailable: !planResponse.ok || !planOperationsResponse.ok
      },
      receipts: { items: receipts, unavailable: receiptResponse ? !receiptResponse.ok : false },
      goals: {
        items: goals,
        history,
        unavailable: !goalsResponse.ok,
        historyUnavailable: !reserveMovementsResponse.ok || !reservePaymentsResponse.ok
      },
      viewer: { accountOwner: accountOwnerForEmail(user.email) },
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Notion operations query threw', error);
    return json({ error: 'Unable to reach Notion' }, 502);
  }
}
