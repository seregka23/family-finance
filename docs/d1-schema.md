# D1 finance schema

`migrations/0001_finance.sql` is the authoritative additive schema. It creates no example data. Apply it with Wrangler D1 migrations before serving the read APIs. The Worker receives the native `DB` binding per request; no database credentials or Cloudflare management API are used at runtime. Node SSR requires a verified Access identity; without a D1 binding its authorized finance APIs return HTTP 503.

Money columns end in `_minor` and store integer hundredths of the row currency (RSD, EUR, USD, RUB), never floating point or converted values. `balance_minor` may be negative or unknown (`NULL`); reserve target/saved/spent may be unknown. All other money is nonnegative. API values are major units. Every reported money value and aggregate is limited to ±90,071,992,547,409 hundredths (`floor(Number.MAX_SAFE_INTEGER / 100)`), a conservative precision margin that preserves conversion to major units and back to integer hundredths. Conversion additionally verifies that exact round trip. Stored values may exceed this reporting bound; requests involving them or totals outside the bound fail with HTTP 503 rather than returning rounded money. Foreign keys and currency consistency triggers reject mismatched monetary relationships, including edits of parent currencies.

Dates are canonical `YYYY-MM-DD` calendar dates in Europe/Belgrade. Importers must convert timestamps to that calendar before writing. `operation_time` is optional local `HH:MM`; it is presentation only. Monthly-plan months must be the first day. SQLite checks reject impossible dates. IDs are application-supplied stable text identifiers.

| Table | Columns |
| --- | --- |
| accounts | id, name, currency, balance_minor, active, include_in_capital, owner, kind, bank, mask |
| categories | id, name, section, include_in_reports |
| monthly_plan_items | id, month, category_id, title, currency, amount_minor |
| reserves | id, title, account_id, currency, kind, archived, priority, status, target_minor, saved_minor, spent_minor, deadline |
| operations | id, operation_type, title, merchant, amount_minor, currency, operation_date, operation_time, category_id, account_id, plan_item_id, reserve_id, reserve_amount_minor, source, status, participant, note |
| receipt_items | id, operation_id, title, category_id, currency, amount_minor |
| reserve_events | id, reserve_id, event_type, amount_minor, event_date, title |

Reserve `saved_minor` is the current reserved balance snapshot; `spent_minor` is the lifetime spent snapshot. Events are a separate audit history, not another balance source to add to those snapshots. Archived reserves remain visible in lifecycle/history views and their saved balance remains earmarked until explicitly released; archiving alone never changes account availability. Writers must update snapshots and corresponding history atomically when changing reserves. No public write endpoint is provided.

`GET /api/operations` preserves its optional inclusive `from`/`to` range (maximum 366 days) and optional first-of-month `month`. Journal and receipt rows respect the range; plan actuals always use every expense in the selected month, matched by category and currency. Active accounts, all reserves, and all reserve history are returned independently of the journal range. Plan rows are unique per month/category/currency; unknown categories remain uncategorized. A direct operation plan link controls its label; actuals use the category/currency key. Account balances are authoritative stored snapshots, not reconstructed from an incomplete journal.

`GET /api/expenses?month=YYYY-MM` reads every expense in the requested calendar month and applies the existing daily/category/merchant aggregation, report exclusion, review status, and current-date cutoff. Neither endpoint has a 100-record cap. Queries are prepared with bound user parameters. SQL/schema errors or a missing DB binding return HTTP 503; a correctly migrated empty database returns empty collections.

The API contract remains read-only. Cloudflare Access identity verification and the email allowlist run before any D1 query. Authorized family members share the configured finance database; no per-user data partitioning is introduced.
