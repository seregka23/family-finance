import type { FinanceData } from '../finance-types';
const operation = (id: string, category: string, account: string) => ({
  id,
  category,
  account,
  shortAccount: account,
  title: `Purchase ${id}`,
  merchant: 'Shop',
  amount: 100,
  currency: 'RSD' as const,
  operationType: 'Расход' as const,
  date: '5 ноября',
  time: '',
  isoDate: '2026-11-05',
  plan: 'Продукты',
  source: 'SMS' as const,
  status: 'Готово' as const,
  participant: 'Семья' as const,
  note: '',
  notionUrl: 'https://notion.so/test'
});

export const fixtureData: FinanceData = {
  operations: [operation('one', 'Продукты', 'A'), operation('two', 'Транспорт', 'B')],
  accounts: [
    {
      id: 'a',
      name: 'A',
      balance: 1000,
      reserved: 300,
      available: 700,
      reserveNames: ['Отпуск'],
      currency: 'RSD',
      active: true,
      includeInCapital: true,
      owner: 'Муж',
      kind: 'Дебетовая карта',
      bank: 'Raiffeisen',
      mask: '1234'
    }
  ],
  monthlyPlan: {
    month: '2026-11-01',
    items: [
      {
        id: 'p',
        title: 'Продукты',
        category: 'Продукты',
        section: 'Гибкие расходы',
        amount: 1000,
        actual: 200,
        currency: 'RSD',
        notionUrl: 'https://notion.so/p'
      }
    ]
  },
  receipts: { items: [] },
  goals: { items: [], history: [] },
  viewer: { accountOwner: 'Муж' }
};
