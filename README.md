# Family Finance

A private family finance interface built with Angular 22, server-side rendering,
TypeScript, and Tailwind CSS 4, with Node and Cloudflare Workers adapters.
Reporting dates use Europe/Belgrade.

## Data and access

Finance data is stored in Cloudflare D1 (SQLite) through the Worker's `DB`
binding. The app provides its own invitation registration and password sign-in.
D1 stores users, hashed passwords, hashed opaque sessions and single-use
invitations. Enabled members and administrators share the family workspace;
finance APIs verify the session and current role/status before reading data.
Signed-in members can add income and expense transactions from the operations
page. Account/category administration remains available through authenticated
SQL tools. No general SQL execution endpoint or unauthenticated write API exists.

The database starts empty. There is no automatic import from the former data
source and no sample financial data is inserted into production. The schema
covers accounts, categories, operations, monthly plans, receipt items, reserves
and reserve history. See [the D1 schema](docs/d1-schema.md).

The authenticated read APIs retain the frontend contract:

- `/api/operations?from=YYYY-MM-DD&to=YYYY-MM-DD&month=YYYY-MM-01`
- `/api/expenses?month=YYYY-MM`

Valid requests return stored finance data; invalid dates or months return 400.
An empty database returns empty collections. A missing binding, missing schema or
failed database query returns 503 rather than a misleading empty report.
Missing authentication configuration or database returns 503; missing or expired
sessions return API 401; disabled or unauthorized accounts receive 403. Anonymous
page requests redirect to `/login`. Authentication screens are public and do not
instantiate or fetch the finance workspace.

## Adding a transaction

Open **Операции → Добавить операцию**. Choose expense or income, enter a title,
a positive amount with up to two decimal places, currency and date. Account,
category, time, merchant and notes are optional. Decimal commas and points are
accepted. Choosing an account selects its currency; mixed-currency account
entries are rejected. You can record the first transaction without an account
or category when the workspace is empty.

Saving inserts the transaction and updates the selected known account balance
atomically: expense subtracts, income adds. Unknown account balances stay unknown;
unlinked transactions affect reports but no account balance. The journal refreshes
and includes the saved date. New records are labelled `Вручную`, committed with
status `Готово`, and attributed to the authenticated creator.

The form disables repeated clicks while saving and reuses its request ID for an
unchanged retry. A lost response can therefore be retried without creating another
transaction or applying the account delta twice. Reusing an ID with different
content or a different creator returns 409. Transactions that would exceed the
reporting limits for monthly currency totals, account balance or known available
balance return 409 and leave both the journal and account unchanged.

- `GET /api/transaction-options`: active accounts and categories for the form.
- `POST /api/operations`: authenticated, same-origin JSON creation.

A create request contains a UUIDv4 `requestId`, `operationType` (`Расход` or
`Доход`), `title`, decimal-string `amount`, `currency`, `operationDate`, optional
`operationTime`, nullable `accountId`/`categoryId`, and optional `merchant`/`note`.
First creation returns 201 `{id, created: true}`; an identical retry returns 200
`{id, created: false}`. The server rejects unsupported write fields and validates
all references and amounts; it does not accept client-controlled creator, source,
status, reserve or receipt data.

The production database has been prepared with `0004_manual_transactions.sql`.
Apply it before deployment in any other environment. It adds manual
entry metadata and an insertion trigger without changing existing records or
recalculating imported account snapshots. Editing or deleting manual entries via
SQL does not automatically undo their balance effects; trusted administrators
must reconcile balances when doing so. This feature does not expose edit/delete
or transfer endpoints.

## Registration and sign-in

- `/login`: email/password sign-in.
- `/register`: create an account using an email-bound, single-use invitation.
- Sign-out posts to `/api/auth/logout`, revokes the server-side session and
  clears its cookie. GET requests cannot sign anyone out.

There is no open registration or public administrator-bootstrap endpoint. A trusted
administrator creates invitations using authenticated SQL tools. Invitations
expire after 24 hours and assign either the `member` or `admin` role. This proves
possession of an administrator-issued invitation; email delivery/verification is
not implemented. Send invitation files privately to the intended recipient.

Passwords require 12–128 characters. New passwords use native scrypt with
`N=32768`, `r=8`, `p=3`, a 32-byte output, a 64 MiB memory ceiling, a unique random
salt and a separate HMAC pepper (`AUTH_SECRET`). This is an
[OWASP recommended scrypt configuration](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Password_Storage_Cheat_Sheet.md#scrypt).
The `N*r*p` cost is 786432, below Workers' default scrypt ceiling of 1048576.
Passwords, raw session tokens and raw invitation tokens are never stored in D1.
Production sessions use a seven-day `__Host-` cookie with `HttpOnly`, `Secure`,
`SameSite=Lax`, and `Path=/`; local HTTP loopback uses a separate development
cookie. Expiry, current account status and role are checked on every protected
request. Login rotates the current session; logout revokes it.

Auth POST endpoints require JSON and an exact browser Origin matching
`AUTH_ORIGIN`. D1-backed IP, email and invitation rate limits restrict attempts;
failures are generic. No client-side token storage is used. HTML responses carry
`private, no-store` and `Referrer-Policy: no-referrer`.

`AUTH_SECRET` must be a stable cryptographically random secret of at least 32
bytes, stored as a Worker secret. It is a password pepper: replacing it without a
credential migration makes existing passwords unusable. Never commit it or send
it in chat. `AUTH_ORIGIN` is the exact HTTPS application origin; HTTP is accepted
only for local loopback development. Cloudflare Access is no longer required.

There is no self-service password reset, email sending or account administration
UI in this change. Trusted database administrators manage users and invitations.
Disabling a user immediately blocks its sessions. Future password recovery must
verify a trusted reset credential, not merely accept an email address.

## Production authentication setup

The initial production auth migration and random Worker secret have been
configured. An owner invitation is delivered separately as a private file.
For another installation:

1. Apply all D1 migrations through `0004_manual_transactions.sql`.
2. Set the stable Worker secret `AUTH_SECRET`. The checked-in `AUTH_ORIGIN` is
   `https://family-finance.seregka23.workers.dev`.
3. Deploy the updated Worker, then privately provide an invitation to the owner.

Create an invitation (these output paths must not already exist):

```sh
npm run auth:invite -- --email you@example.com --role admin \
  --origin https://family-finance.seregka23.workers.dev \
  --output /private/owner-invitation.txt --sql-output /private/owner-invitation.sql
npm run db:execute:remote -- --file=/private/owner-invitation.sql
```

The helper writes exclusive mode-0600 files and never prints the raw invitation.
Only its hash is in the SQL file. Registration links use `/register#token=…`:
the fragment never reaches the HTTP server, and the browser clears it immediately
after reading it. Tokens in query strings are ignored. The recipient opens the
private link, enters the matching email, chooses a password, and is signed in.
Use `--role member` for additional family members.

Cloudflare's production PBKDF2 cap is 100,000 iterations, while local Miniflare
removes that cap. The previous 600,000-iteration implementation could therefore
pass local tests but fail registration in production. Tests now explicitly model
that production limit and exercise the native scrypt path without a PBKDF2
fallback. Native scrypt was verified in workerd at about 225 ms; validate actual
production behavior after deployment. No billing plan is changed by this fix.

Migration `0003` adds `password_scheme`, the actual hash discriminator. The old
`password_version` column remains a compatibility marker required by the original
schema; it does not identify new credentials. Existing hashes, sessions and
invitation references are not changed. Legacy PBKDF2 credentials retain the full
600,000-iteration verification where the provider supports it; they fail closed
on a capped provider. No legacy users existed in this production database when
the fix was prepared. The existing owner invitation remains valid and unused.

Unexpected authentication failures emit only fixed internal operation/stage/code
labels. Passwords, emails, tokens, hash values and raw SQL/exception messages are
never included in those diagnostics.

## Development

Use Node.js 22.22.3 or newer (or Node.js 24 LTS).

```sh
npm ci
npm run auth:setup:local
npm run db:migrate:local
npm run preview
```

Open the local URL printed by Wrangler (normally http://localhost:8787).
Local D1 uses persistent storage under `.wrangler/state`, isolated from production.
`auth:setup:local` creates a random private `.dev.vars` without overwriting an
existing file. Create a local invitation using `auth:invite` with
`--origin http://localhost:8787`, then apply its SQL with `db:execute:local`.
Use `/register` and `/login` locally; there is no authentication bypass.
`npm run dev` still runs Angular UI development on port 4200, but the Node adapter
does not have a Cloudflare D1 binding; use Wrangler for database-backed development.

Environment files are optional. `SSR_ALLOWED_HOSTS`
can override the SSR hostname allowlist with comma-separated hostnames, without
scheme or port. `.env.example` documents this optional setting.

## Production

```sh
npm run build
npm start
```

For Node hosting, `.env.local` may provide environment configuration. The Node server listens on `127.0.0.1:4000`. Set `HOST` and `PORT` to change the
listener. Deploy `dist/family-finance` as a complete directory so the server can
serve the sibling browser assets. `npm start` loads `.env.local` if present.
The standalone Node adapter retains the authentication boundary. After
authentication, finance APIs return 503 because D1 bindings are supplied by
Cloudflare Workers. Use the Worker adapter
for the database-backed application.

`npm run build` creates both `dist/family-finance` (Node) and
`dist/family-finance-worker` (Cloudflare). `npm run build:node` and
`npm run build:worker` build individual adapters.

## Cloudflare Workers

`wrangler.jsonc` points to `worker/index.mjs` and the static browser assets.
The Worker uses Angular's platform-neutral SSR entry. Production workers.dev is
enabled at https://family-finance.seregka23.workers.dev/; version preview URLs
remain disabled. The build pipeline uses:

```sh
npm run build
npx wrangler deploy
```

`npm run deploy` builds and deploys only the Worker. `npm run preview` builds and
runs local Wrangler development. `npm run deploy:check` checks packaging without
uploading. `npm run cf:typegen` regenerates local Worker types. Builds and
TypeScript checks generate these types automatically, including the `DB` binding.

The dedicated production database is `family-finance`, identifier
`813be64c-d2eb-45c6-a2a0-83806f1eb85b`, created in Cloudflare's EEUR region. The
binding and migration directory are checked into `wrangler.jsonc`. The running Worker uses the binding, without database credentials; authentication
requires the separate `AUTH_SECRET` Worker secret.

The initial `0001_finance.sql` migration has been applied to this production
database; all finance tables are empty. For local setup and future migrations,
apply schema migrations **before deploying code that expects them**:

```sh
npm run db:migrate:local
# Authenticated Cloudflare account access is required for production commands:
npm run db:migrate:remote
npm run deploy
```

Wrangler tracks applied migrations in `d1_migrations`. Add new numbered migration
files for future schema changes; do not edit migrations already applied in
production. Database content is independent of Worker code deployments.

Inspect or load data with SQL:

```sh
npm run db:execute:local -- --command="SELECT id, name, currency FROM accounts"
npm run db:execute:local -- --file=path/to/your-data.sql
# Production commands explicitly target the real database:
npm run db:execute:remote -- --command="SELECT COUNT(*) AS count FROM operations"
```

Do not run test fixture SQL against production. Amounts are integer minor units
(e.g. 12345 means 123.45); dates are calendar dates in Europe/Belgrade. Account
balances and reserve snapshots are stored explicitly, not automatically changed
by inserting an operation. See the schema guide for relationships and totals.

Static files use Workers Static Assets. Workspace and API routes run the Worker
first. No SPA fallback is configured, so unknown APIs remain 404 responses.

## Angular structure

Five lazy workspace routes provide overview, operations, monthly plans, accounts,
and expense dashboards. `FinanceWorkspace` owns shared signal-based state and
resource-backed data. Components retain empty, loading, and error states. Fonts
are bundled locally.

## Build dependency compatibility

Angular Build 22.2.6 includes `@oxc-parser/binding-wasm32-wasi@0.156.0`, which
pins Emnapi alpha versions outside its WASM runtime's supported peer ranges.
Version-scoped overrides align the binding's Emnapi core and runtime to
`2.0.0-beta.3`. Remove this workaround when upstream fixes its declarations.
The parser WASI test checks synchronous and asynchronous parsing without native
fallback.

## Checks

- `npm test`: production builds, model/API tests, Node and local Worker runtime
  smoke tests with a temporary D1 database, and Angular component tests.
- `npm run test:unit`: model and API tests without a build.
- `npm run typecheck`: strict TypeScript checks.
- `npx ng test --watch=false`: Angular component tests.

## Layout

- `src/app/`: finance UI, domain models, state and HTTP client.
- `src/server/`: session authentication, registration and D1 finance APIs.
- `migrations/`: versioned D1 SQLite schema migrations.
- `src/server.ts`: Node Express SSR adapter.
- `src/server.worker.ts`: Cloudflare SSR adapter.
- `worker/` and `wrangler.jsonc`: Worker entry and deployment configuration.
- `public/`: fonts, favicon and static assets.
- `tests/`: model, endpoint and runtime tests.
- `.agents/skills/`: installed Angular development skills.
- `.codex/`: shared agent configuration.
