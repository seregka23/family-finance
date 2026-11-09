import {
  propertyText as text,
  propertyNumber as num,
  propertyDate as date,
  relationIds,
  type NotionPage,
  type NotionProperty
} from './notion-finance-model';

export type FinancialReserve = {
  id: string;
  title: string;
  accountId: string;
  account: string;
  currency: string;
  kind: string;
  archived: boolean;
  priority: string;
  status: string;
  target: number | null;
  saved: number | null;
  spent: number | null;
  progress: number | null;
  deadline: string;
  notionUrl: string;
};
export type ReserveEvent = {
  id: string;
  reserveId: string;
  reserve: string;
  account: string;
  currency: string;
  type: 'Пополнение' | 'Снятие резервирования' | 'Оплата' | 'Ожидает проверки';
  amount: number;
  date: string;
  title: string;
  notionUrl: string;
};
export type GoalsData = {
  items: FinancialReserve[];
  history: ReserveEvent[];
  unavailable?: boolean;
  historyUnavailable?: boolean;
};

export function computedNumber(property?: NotionProperty): number | null {
  const value = property?.formula?.number ?? property?.rollup?.number ?? property?.number;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mapReserves(
  pages: NotionPage[],
  accounts: Map<string, string>
): FinancialReserve[] {
  return pages
    .filter((page) => !page.archived && !page.in_trash)
    .map((page) => {
      const p = page.properties,
        accountId = relationIds(p['Счет'])[0] ?? '';
      const targetValue = computedNumber(p['Целевая сумма']);
      const target = targetValue !== null && targetValue > 0 ? targetValue : null;
      // A failed formula is unknown, never a zero reserve or wholly available cash.
      const saved = p['В резерве']
        ? computedNumber(p['В резерве'])
        : computedNumber(p['Накоплено']);
      return {
        id: page.id,
        title: text(p['Цель']) || 'Без названия',
        accountId,
        account: accounts.get(accountId) || 'Счёт не выбран',
        currency: text(p['Валюта']) || 'RSD',
        kind: text(p['Вид']) || 'Накопительная цель',
        archived: p['Архив']?.checkbox === true,
        priority: text(p['Приоритет']),
        status: text(p['Статус']),
        target,
        saved,
        spent: computedNumber(p['Оплачено из резерва']),
        progress:
          target !== null && saved !== null
            ? Math.max(0, Math.min(100, (saved / target) * 100))
            : null,
        deadline: date(p['Дедлайн']),
        notionUrl: page.url
      };
    })
    .sort(
      (a, b) => Number(a.archived) - Number(b.archived) || a.title.localeCompare(b.title, 'ru')
    );
}

export function reserveHistory(
  movements: NotionPage[],
  payments: NotionPage[],
  goals: FinancialReserve[]
): ReserveEvent[] {
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const entries: ReserveEvent[] = [];
  for (const [pages, payment] of [
    [movements, false],
    [payments, true]
  ] as const) {
    for (const page of pages) {
      if (page.archived || page.in_trash) continue;
      const p = page.properties,
        goal = byId.get(relationIds(p['Резерв'])[0]);
      const amount = num(p[payment ? 'Из резерва' : 'Сумма']);
      const kind = payment
        ? text(p['Тип']) === 'Расход'
          ? text(p['Статус разбора']) === 'Готово'
            ? 'Оплата'
            : 'Ожидает проверки'
          : ''
        : text(p['Тип']);
      if (
        !goal ||
        amount <= 0 ||
        !['Оплата', 'Ожидает проверки', 'Пополнение', 'Снятие резервирования'].includes(kind)
      )
        continue;
      entries.push({
        id: page.id,
        reserveId: goal.id,
        reserve: goal.title,
        account: goal.account,
        currency: goal.currency,
        type: kind as ReserveEvent['type'],
        amount,
        date: date(p['Дата']),
        title: text(p[payment ? 'Операция' : 'Движение']),
        notionUrl: page.url
      });
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function reservedForAccount(
  goals: FinancialReserve[],
  accountId: string,
  currency: string
): number | null {
  const matched = goals.filter((goal) => goal.accountId === accountId);
  return matched.some((goal) => goal.saved === null || goal.currency !== currency)
    ? null
    : matched.reduce((sum, goal) => sum + goal.saved!, 0);
}
