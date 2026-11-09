import type { GoalsData } from './models/reserve-model';
export type Tab = 'overview' | 'operations' | 'plan' | 'accounts' | 'dashboards';
export type AccountSummary = {
  id: string;
  name: string;
  balance: number | null;
  reserved: number | null;
  available: number | null;
  reserveNames: string[];
  currency: string;
  active: boolean;
  includeInCapital: boolean;
  owner: string;
  kind: string;
  bank: string;
  mask: string;
};
export type MonthlyPlanItem = {
  id: string;
  title: string;
  section: string;
  category: string;
  amount: number;
  actual: number;
  currency: string;
  notionUrl: string;
};
export type MonthlyPlan = { month: string; items: MonthlyPlanItem[]; unavailable?: boolean };
export type ReceiptSummary = {
  operationId: string;
  title: string;
  itemCount: number;
  total: number;
  currency: string;
  notionUrl: string;
  categories: Array<{ name: string; amount: number; percent: number }>;
};
export type ReceiptData = { items: ReceiptSummary[]; unavailable?: boolean };
export type ViewerData = { accountOwner: string | null };
export type Operation = {
  id: string;
  operationType: 'Расход' | 'Доход';
  title: string;
  merchant: string;
  amount: number;
  currency: 'RSD' | 'EUR' | 'USD' | 'RUB';
  date: string;
  time: string;
  category: string;
  account: string;
  shortAccount: string;
  plan: string;
  source: 'SMS' | 'Чек';
  status: 'Готово' | 'Нужна проверка';
  participant: 'Я' | 'Семья';
  note: string;
  notionUrl: string;
  isoDate: string;
  reserveName?: string;
  reserveAmount?: number;
  items?: number;
};

export type FinanceData = {
  operations: Operation[];
  accounts?: AccountSummary[];
  monthlyPlan?: MonthlyPlan;
  receipts?: ReceiptData;
  goals?: GoalsData;
  viewer?: ViewerData;
  updatedAt?: string;
};

export type ReserveAccount = Pick<
  AccountSummary,
  'id' | 'name' | 'currency' | 'balance' | 'reserved' | 'available'
>;
