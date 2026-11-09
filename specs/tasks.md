# Cloudflare D1 finance storage

## Task

Use Cloudflare D1 (SQLite) as the application's database. This replaces the empty
API implementation from merged PR #8. Authentication remains removed.

## Acceptance criteria

- Provision a dedicated D1 database and configure the Worker binding using its
  real identifier, with reproducible, additive SQL migrations.
- Store accounts, categories, operations, monthly plans, receipt items, reserves
  and reserve history. Use integer minor units, foreign keys and useful indexes.
- Read stored data through the existing public operations and expense APIs,
  preserving payload shapes, date filters, currency isolation and finance totals.
- Use prepared/bound queries and request-scoped D1 bindings; never expose a
  general SQL endpoint or add unauthenticated write endpoints.
- Distinguish an empty database from a missing binding or failed query (503).
- Provide local migration and SQL commands, production migration instructions,
  and tests against actual local D1 with synthetic records only.
- Verify both production builds, TypeScript, API/domain/runtime tests and review.

## Status

Implementation complete and reviewed without blocking findings.

Provisioned `family-finance` D1 in EEUR, identifier
`813be64c-d2eb-45c6-a2a0-83806f1eb85b`. Applied `0001_finance.sql` to this new
empty database through the connected Cloudflare API and recorded it in Wrangler's
`d1_migrations` table. Verified seven finance tables, zero financial records,
no foreign-key violations, and successful execution of all seven actual
application read queries against the remote schema. Existing databases and
financial records were untouched; no production sample data was inserted.

Validation:

- `npm test`: both production builds; 23 Node/model/API/runtime tests and
  11 Angular component tests passed.
- Real local D1 migration, seed and restart tests demonstrate persisted data;
  synthetic fixtures cover more than 100 operations, date/currency isolation,
  plan actuals, receipts, accounts, reserves, constraints and error handling.
- Regression tests cover precise monetary conversion, reporting boundaries,
  oversized totals and derived balance overflow.
- Strict TypeScript, generated binding types and whitespace checks passed.
- Wrangler deployment dry run passed with the real `DB` binding and 28 assets
  (1173.45 KiB module upload, 271.92 KiB gzip).

The Worker code and binding become live after PR merge and the existing deployment
pipeline succeeds. No Worker deployment was performed in this task. Node SSR is
still supported, with finance API 503 responses when no D1 binding is available;
use Wrangler for database-backed local development. The public application
remains read-only; records are managed through authenticated SQL tooling.
