-- Additive metadata; existing imports never change account snapshots.
ALTER TABLE operations ADD COLUMN entry_method TEXT NOT NULL DEFAULT 'import'
 CHECK(entry_method IN ('manual','import'));
ALTER TABLE operations ADD COLUMN created_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL;
ALTER TABLE operations ADD COLUMN created_at INTEGER CHECK(created_at IS NULL OR created_at>0);
ALTER TABLE operations ADD COLUMN request_fingerprint TEXT
 CHECK(request_fingerprint IS NULL OR (length(request_fingerprint)=64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'));
CREATE INDEX operations_created_by ON operations(created_by);
CREATE INDEX operations_type_currency_date ON operations(operation_type,currency,operation_date);

-- INSERT and its balance effect are one SQLite transaction. An ignored duplicate
-- INSERT never fires this trigger; concurrent requests cannot double-apply money.
CREATE TRIGGER operations_manual_balance AFTER INSERT ON operations
WHEN NEW.entry_method='manual'
BEGIN
 SELECT CASE WHEN NEW.amount_minor<=0 OR NEW.amount_minor>90071992547409
   OR NEW.created_by IS NULL OR NEW.created_at IS NULL OR NEW.request_fingerprint IS NULL
   THEN RAISE(ABORT,'Manual transaction metadata invalid') END;
 -- TOTAL avoids SQLite int64 overflow on pre-existing oversized imports. All
 -- amounts are nonnegative: near this ceiling integer totals remain exact (<2^47),
 -- and any larger inexact total is still safely greater than the ceiling.
 SELECT CASE WHEN (SELECT TOTAL(amount_minor) FROM operations
   WHERE operation_type=NEW.operation_type AND currency=NEW.currency
   AND operation_date>=substr(NEW.operation_date,1,7)||'-01'
   AND operation_date<=substr(NEW.operation_date,1,7)||'-31')>90071992547409
   THEN RAISE(ABORT,'Manual transaction monthly total exceeds reporting limit') END;
 SELECT CASE WHEN NEW.account_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM accounts WHERE id=NEW.account_id AND active=1 AND currency=NEW.currency)
   THEN RAISE(ABORT,'Manual transaction account invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND balance_minor IS NOT NULL
   AND (abs(balance_minor)>90071992547409 OR abs(balance_minor + CASE WHEN NEW.operation_type='Расход' THEN -NEW.amount_minor ELSE NEW.amount_minor END)>90071992547409))
   THEN RAISE(ABORT,'Manual transaction balance exceeds reporting limit') END;
 -- Archived reserves still earmark cash. A NULL saved balance means unknown
 -- availability, matching read-model semantics; do not fabricate a numeric value.
 SELECT CASE WHEN EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.account_id
   AND NOT EXISTS(SELECT 1 FROM reserves r WHERE r.account_id=a.id AND r.saved_minor IS NULL)
   AND ((SELECT TOTAL(saved_minor) FROM reserves r WHERE r.account_id=a.id)>90071992547409
     OR (a.balance_minor IS NOT NULL AND abs(a.balance_minor + CASE WHEN NEW.operation_type='Расход' THEN -NEW.amount_minor ELSE NEW.amount_minor END
       - (SELECT TOTAL(saved_minor) FROM reserves r WHERE r.account_id=a.id))>90071992547409)))
   THEN RAISE(ABORT,'Manual transaction availability exceeds reporting limit') END;
 UPDATE accounts SET balance_minor=balance_minor + CASE WHEN NEW.operation_type='Расход' THEN -NEW.amount_minor ELSE NEW.amount_minor END
   WHERE id=NEW.account_id AND balance_minor IS NOT NULL;
END;
