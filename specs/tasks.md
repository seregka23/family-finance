# Add new transactions

## Task

Add a function for signed-in family members to create transactions in the D1
finance workspace. The user explicitly confirmed that selecting an account must
automatically update its balance.

## Acceptance criteria

- Provide an accessible form on the operations page for expenses and income,
  exact amounts, currency, date, title and optional account/category/time/notes.
- Support a completely empty workspace by allowing an unlinked transaction.
- Enforce session authorization, configured Origin, JSON/body limits and strict
  server-side field/reference/currency/date/monetary validation before writes.
- Store records as manual transactions with creator metadata and show them in the
  journal, monthly plan actuals and expense reports.
- Apply expense/income account deltas atomically with insertion; preserve unknown
  balances and imported records, and reject unreportable resulting balances.
- Prevent duplicate inserts or balance changes on retries/concurrent submissions;
  reject reuse of an ID for different content or another creator.
- Preserve the form on recoverable errors, handle expired/denied sessions safely,
  and refresh filters/date range so the saved transaction is visible.
- Add a forward-only D1 migration and meaningful API/Angular/real Worker tests;
  pass both builds, TypeScript, packaging and read-only review.
- Apply only schema preparation remotely; never create test transactions in the
  user's production financial data.

## Status

Implementation complete. Read-only review has no remaining blocking findings.

Validation:

- `npm test`: both production builds, 40 Node/model/API/runtime tests and
  29 Angular component tests passed (69 total).
- Tests cover concurrent/idempotent inserts, correct income/expense deltas,
  empty workspaces, nullable balances, exact decimals, authorization, Origin/body
  guards, invalid references and rollback of reporting/availability overflows.
- The actual local Worker+D1 test creates transactions through HTTP and verifies
  balances, monthly plan actuals, reports and concurrent monthly-limit rejection.
- UI tests cover successful refresh, currency locking, options reload failures,
  retry IDs, busy/cancel behavior and hidden cached data after auth failures.
- Strict TypeScript, generated types and whitespace checks passed.
- Local migration command and deployment dry run passed: 36 browser assets,
  1376.24 KiB module upload (314.94 KiB gzip).

Production preparation: applied and recorded `0004_manual_transactions.sql`.
Verified foreign-key integrity and unchanged operation/account row counts. No
production test transaction was created and no existing balance was modified.
The new code becomes live after PR merge and the existing deployment pipeline.

This is the first application-owned finance write endpoint. Account/category
administration and transaction editing, transfers, deletion, receipt entry and
reserve spending remain outside this task. Imported data still does not adjust
account snapshots automatically. Manual insert guards reject monthly gross or
known availability outside the reporting bound so successful writes cannot make
those reports unreadable.
