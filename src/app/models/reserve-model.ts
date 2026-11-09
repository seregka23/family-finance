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
};
export type GoalsData = {
  items: FinancialReserve[];
  history: ReserveEvent[];
  unavailable?: boolean;
  historyUnavailable?: boolean;
};

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
