const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, rows) => rows.map((row) => `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map((value) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : quote(value)).join(',')});`).join('\n');

// Synthetic test data only: deliberately spans ranges, currencies and more than one API page.
export function seedSql() {
  return [
    insert('accounts', [
      { id: 'cash', name: 'Family cash', currency: 'RSD', balance_minor: 100000 },
      { id: 'euros', name: 'Euro savings', currency: 'EUR', balance_minor: 25000 },
      { id: 'unknown', name: 'Unknown balance', currency: 'USD', balance_minor: null }
    ]),
    insert('categories', [{ id: 'food', name: "Food '); DROP TABLE accounts; --", section: 'Гибкие расходы' }, { id: 'hidden', name: 'Excluded', include_in_reports: 0 }]),
    insert('monthly_plan_items', [{ id: 'plan', month: '2026-08-01', category_id: 'food', title: 'Food budget', currency: 'RSD', amount_minor: 50000 }]),
    insert('reserves', [{ id: 'holiday', title: 'Holiday', account_id: 'cash', currency: 'RSD', saved_minor: 20000, spent_minor: 1000, target_minor: 40000 },
      { id: 'archived', title: 'Archived allocation', account_id: 'cash', currency: 'RSD', saved_minor: 5000, archived: 1 },
      { id: 'euro-goal', title: 'Euro reserve', account_id: 'euros', currency: 'EUR', saved_minor: 5000 }]),
    insert('operations', [
      ...Array.from({ length: 173 }, (_, i) => ({ id: `bulk-${i}`, operation_type: 'Расход', title: `Purchase ${i}`, merchant: 'Shop', amount_minor: 1, currency: 'RSD', operation_date: '2026-08-05', category_id: 'food', account_id: 'cash', status: 'Готово' })),
      { id: 'receipt', operation_type: 'Расход', title: 'Receipt purchase', amount_minor: 300, currency: 'RSD', operation_date: '2026-08-20', category_id: 'food', account_id: 'cash', source: 'Чек', status: 'Готово', reserve_id: 'holiday', reserve_amount_minor: 100 },
      { id: 'eur', operation_type: 'Расход', title: 'Euro expense', amount_minor: 999, currency: 'EUR', operation_date: '2026-08-05', category_id: 'food', account_id: 'euros', status: 'Готово' },
      { id: 'income', operation_type: 'Доход', amount_minor: 10000, currency: 'RSD', operation_date: '2026-08-05', account_id: 'cash', status: 'Готово' },
      { id: 'prior', operation_type: 'Расход', amount_minor: 700, currency: 'RSD', operation_date: '2026-07-31', category_id: 'food', status: 'Готово' },
      { id: 'next', operation_type: 'Расход', amount_minor: 900, currency: 'RSD', operation_date: '2026-09-01', category_id: 'food', status: 'Готово' }
    ]),
    insert('receipt_items', [{ id: 'line-a', operation_id: 'receipt', title: 'Bread', category_id: 'food', currency: 'RSD', amount_minor: 100 }, { id: 'line-b', operation_id: 'receipt', title: 'Milk', category_id: 'food', currency: 'RSD', amount_minor: 200 }]),
    insert('reserve_events', [{ id: 'reserve-add', reserve_id: 'holiday', event_type: 'Пополнение', amount_minor: 20000, event_date: '2026-07-01', title: 'Allocation' }])
  ].join('\n');
}

export async function assertPopulatedOperations(assert, data) {
  assert.equal(data.operations.length, 175);
  assert.ok(data.operations.every((row) => row.isoDate === '2026-08-05'));
  const cash = data.accounts.find((account) => account.id === 'cash');
  assert.equal(cash.balance, 1000);
  assert.equal(cash.reserved, 250);
  assert.equal(cash.available, 750);
  assert.equal(data.accounts.find((account) => account.id === 'unknown').balance, null);
  assert.equal(data.monthlyPlan.items.find((item) => item.id === 'plan').actual, 4.73);
  assert.equal(data.goals.items.find((goal) => goal.id === 'holiday').progress, 50);
  assert.ok(data.goals.history.some((event) => event.id === 'reserve-add'));
}
