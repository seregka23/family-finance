-- Money is integer hundredths in the row currency; dates are Belgrade calendar dates.
CREATE TABLE accounts (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('RSD','EUR','USD','RUB')),
 balance_minor INTEGER   CHECK(balance_minor IS NULL OR (typeof(balance_minor)='integer' AND abs(balance_minor)<=9007199254740991 )), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 include_in_capital INTEGER NOT NULL DEFAULT 1 CHECK(include_in_capital IN (0,1)),
 owner TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '', bank TEXT NOT NULL DEFAULT '', mask TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE TABLE categories (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, section TEXT NOT NULL DEFAULT 'Гибкие расходы',
 include_in_reports INTEGER NOT NULL DEFAULT 1 CHECK(include_in_reports IN (0,1))
) STRICT;
CREATE TABLE monthly_plan_items (
 id TEXT PRIMARY KEY NOT NULL, month TEXT NOT NULL CHECK(month IS NULL OR (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(month, '+0 days') IS NOT NULL AND date(month, '+0 days')=month)),
 category_id TEXT NOT NULL REFERENCES categories(id), title TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN ('RSD','EUR','USD','RUB')), amount_minor INTEGER NOT NULL CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND abs(amount_minor)<=9007199254740991 AND amount_minor>=0)),
 CHECK(substr(month,9,2)='01'), UNIQUE(month,category_id,currency)
) STRICT;
CREATE TABLE reserves (
 id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
 currency TEXT NOT NULL CHECK(currency IN ('RSD','EUR','USD','RUB')), kind TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 priority TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', target_minor INTEGER   CHECK(target_minor IS NULL OR (typeof(target_minor)='integer' AND abs(target_minor)<=9007199254740991 AND target_minor>=0)),
 saved_minor INTEGER   CHECK(saved_minor IS NULL OR (typeof(saved_minor)='integer' AND abs(saved_minor)<=9007199254740991 AND saved_minor>=0)), spent_minor INTEGER   CHECK(spent_minor IS NULL OR (typeof(spent_minor)='integer' AND abs(spent_minor)<=9007199254740991 AND spent_minor>=0)), deadline TEXT   CHECK(deadline IS NULL OR (deadline GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(deadline, '+0 days') IS NOT NULL AND date(deadline, '+0 days')=deadline))
) STRICT;
CREATE TABLE operations (
 id TEXT PRIMARY KEY NOT NULL, operation_type TEXT NOT NULL CHECK(operation_type IN ('Расход','Доход')),
 title TEXT NOT NULL DEFAULT '', merchant TEXT NOT NULL DEFAULT '', amount_minor INTEGER NOT NULL CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND abs(amount_minor)<=9007199254740991 AND amount_minor>=0)), currency TEXT NOT NULL CHECK(currency IN ('RSD','EUR','USD','RUB')),
 operation_date TEXT NOT NULL CHECK(operation_date IS NULL OR (operation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(operation_date, '+0 days') IS NOT NULL AND date(operation_date, '+0 days')=operation_date)), operation_time TEXT NOT NULL DEFAULT '' CHECK(operation_time='' OR (operation_time GLOB '[0-2][0-9]:[0-5][0-9]' AND operation_time<'24:00')),
 category_id TEXT REFERENCES categories(id), account_id TEXT REFERENCES accounts(id),
 plan_item_id TEXT REFERENCES monthly_plan_items(id), reserve_id TEXT REFERENCES reserves(id), reserve_amount_minor INTEGER NOT NULL CHECK(reserve_amount_minor IS NULL OR (typeof(reserve_amount_minor)='integer' AND abs(reserve_amount_minor)<=9007199254740991 AND reserve_amount_minor>=0)) DEFAULT 0,
 source TEXT NOT NULL DEFAULT 'SMS' CHECK(source IN ('SMS','Чек')),
 status TEXT NOT NULL DEFAULT 'Нужна проверка' CHECK(status IN ('Готово','Нужна проверка')),
 participant TEXT NOT NULL DEFAULT 'Семья' CHECK(participant IN ('Я','Семья')), note TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE TABLE receipt_items (
 id TEXT PRIMARY KEY NOT NULL, operation_id TEXT NOT NULL REFERENCES operations(id), title TEXT NOT NULL DEFAULT '',
 category_id TEXT REFERENCES categories(id), currency TEXT NOT NULL CHECK(currency IN ('RSD','EUR','USD','RUB')), amount_minor INTEGER NOT NULL CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND abs(amount_minor)<=9007199254740991 AND amount_minor>=0))
) STRICT;
CREATE TABLE reserve_events (
 id TEXT PRIMARY KEY NOT NULL, reserve_id TEXT NOT NULL REFERENCES reserves(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('Пополнение','Снятие резервирования','Оплата','Ожидает проверки')),
 amount_minor INTEGER NOT NULL CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND abs(amount_minor)<=9007199254740991 AND amount_minor>=0)), event_date TEXT NOT NULL CHECK(event_date IS NULL OR (event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(event_date, '+0 days') IS NOT NULL AND date(event_date, '+0 days')=event_date)), title TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX operations_date ON operations(operation_date,id);
CREATE INDEX operations_category_currency_date ON operations(category_id,currency,operation_date);
CREATE INDEX operations_account ON operations(account_id);
CREATE INDEX operations_plan ON operations(plan_item_id);
CREATE INDEX operations_reserve ON operations(reserve_id);
CREATE INDEX monthly_plan_month ON monthly_plan_items(month);
CREATE INDEX receipt_items_operation ON receipt_items(operation_id);
CREATE INDEX receipt_items_category ON receipt_items(category_id);
CREATE INDEX reserves_account ON reserves(account_id);
CREATE INDEX reserve_events_reserve_date ON reserve_events(reserve_id,event_date);

-- Composite parent keys keep related monetary values in the same currency.
CREATE UNIQUE INDEX accounts_id_currency ON accounts(id,currency);
CREATE UNIQUE INDEX plan_id_currency ON monthly_plan_items(id,currency);
CREATE UNIQUE INDEX reserves_id_currency ON reserves(id,currency);
CREATE UNIQUE INDEX operations_id_currency ON operations(id,currency);
-- SQLite cannot add foreign keys after creation; enforce existing relation currency on all writes.
CREATE TRIGGER reserves_account_id_currency_insert BEFORE INSERT ON reserves
WHEN NEW.account_id IS NOT NULL AND EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER reserves_account_id_currency_update BEFORE UPDATE ON reserves
WHEN NEW.account_id IS NOT NULL AND EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER accounts_reserves_account_id_currency_update BEFORE UPDATE OF currency ON accounts
WHEN EXISTS(SELECT 1 FROM reserves WHERE account_id=OLD.id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_account_id_currency_insert BEFORE INSERT ON operations
WHEN NEW.account_id IS NOT NULL AND EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_account_id_currency_update BEFORE UPDATE ON operations
WHEN NEW.account_id IS NOT NULL AND EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER accounts_operations_account_id_currency_update BEFORE UPDATE OF currency ON accounts
WHEN EXISTS(SELECT 1 FROM operations WHERE account_id=OLD.id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_plan_item_id_currency_insert BEFORE INSERT ON operations
WHEN NEW.plan_item_id IS NOT NULL AND EXISTS(SELECT 1 FROM monthly_plan_items WHERE id=NEW.plan_item_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_plan_item_id_currency_update BEFORE UPDATE ON operations
WHEN NEW.plan_item_id IS NOT NULL AND EXISTS(SELECT 1 FROM monthly_plan_items WHERE id=NEW.plan_item_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER monthly_plan_items_operations_plan_item_id_currency_update BEFORE UPDATE OF currency ON monthly_plan_items
WHEN EXISTS(SELECT 1 FROM operations WHERE plan_item_id=OLD.id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_reserve_id_currency_insert BEFORE INSERT ON operations
WHEN NEW.reserve_id IS NOT NULL AND EXISTS(SELECT 1 FROM reserves WHERE id=NEW.reserve_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_reserve_id_currency_update BEFORE UPDATE ON operations
WHEN NEW.reserve_id IS NOT NULL AND EXISTS(SELECT 1 FROM reserves WHERE id=NEW.reserve_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER reserves_operations_reserve_id_currency_update BEFORE UPDATE OF currency ON reserves
WHEN EXISTS(SELECT 1 FROM operations WHERE reserve_id=OLD.id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER receipt_items_operation_id_currency_insert BEFORE INSERT ON receipt_items
WHEN NEW.operation_id IS NOT NULL AND EXISTS(SELECT 1 FROM operations WHERE id=NEW.operation_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER receipt_items_operation_id_currency_update BEFORE UPDATE ON receipt_items
WHEN NEW.operation_id IS NOT NULL AND EXISTS(SELECT 1 FROM operations WHERE id=NEW.operation_id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
CREATE TRIGGER operations_receipt_items_operation_id_currency_update BEFORE UPDATE OF currency ON operations
WHEN EXISTS(SELECT 1 FROM receipt_items WHERE operation_id=OLD.id AND currency<>NEW.currency)
BEGIN SELECT RAISE(ABORT,'Currency mismatch'); END;
