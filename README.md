# Family Finance

A private family finance interface built with Angular 22, server-side rendering,
TypeScript, and Tailwind CSS 4, with Node and Cloudflare Workers adapters.
Reporting dates use Europe/Belgrade.

## Data and access

Finance data is stored in Cloudflare D1 (SQLite) through the Worker's `DB`
binding. Cloudflare Access authenticates visitors and the application verifies each
signed identity token before rendering finance pages or reading D1. Only emails
in `ALLOWED_EMAILS` can access the workspace. The APIs are read-only; manage
records using Cloudflare's dashboard or authenticated SQL tools.
No general SQL endpoint or public write API is exposed.

The database starts empty. There is no automatic import from the former data
source and no sample financial data is inserted into production. The schema
covers accounts, categories, operations, monthly plans, receipt items, reserves
and reserve history. See [the D1 schema](docs/d1-schema.md).

The authenticated read-only APIs retain the frontend contract:

- `/api/operations?from=YYYY-MM-DD&to=YYYY-MM-DD&month=YYYY-MM-01`
- `/api/expenses?month=YYYY-MM`

Valid requests return stored finance data; invalid dates or months return 400.
An empty database returns empty collections. A missing binding, missing schema or
failed database query returns 503 rather than a misleading empty report.
Missing Access configuration returns 503; missing or invalid identity returns
401; authenticated emails outside the allowlist receive 403. These checks run
before database queries. The UI provides sign-in recovery and sign-out controls.

## Authentication setup

1. Enable Zero Trust/Access in your Cloudflare account. Protect production traffic
   for **Workers & Pages → family-finance → Access** with an Allow policy restricted
   to `seregka23@gmail.com` (or the intended family emails).
2. Copy the Access team domain (such as `https://your-team.cloudflareaccess.com`)
   and application AUD tag into Worker runtime variables `CF_ACCESS_TEAM_DOMAIN`
   and `CF_ACCESS_AUD`. The team domain is a hostname, not an email address.
3. The checked-in Worker allowlist is `seregka23@gmail.com`. Update `ALLOWED_EMAILS`
   and the Access policy together when adding family members.
4. Deploy the updated Worker. Access performs browser sign-in before forwarding
   requests; the application verifies RS256 signatures, issuer, audience, expiry,
   subject and signed email. It never trusts plain email headers or cookies as
   proof of identity.

`/auth/login?return_to=/` redirects to a validated local application path, allowing
Access to initiate sign-in. `/auth/logout` uses the documented application-domain
`/cdn-cgi/access/logout` flow. Access manages its authorization cookies; the
frontend stores no tokens. Expired API sessions show a sign-in link, and denied
users can sign out to switch accounts. HTML and finance responses use
`Cache-Control: private, no-store`.

At implementation time Cloudflare reports that Access is not enabled for the
account. Complete onboarding and provide the team domain and application audience
before expecting a working live login. Missing setup fails closed.

See [Worker Access setup](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
and [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Development

Use Node.js 22.22.3 or newer (or Node.js 24 LTS).

```sh
npm ci
cp .env.example .dev.vars
# Fill in the Access team domain and application audience.
npm run db:migrate:local
npm run preview
```

Open the local URL printed by Wrangler (normally http://localhost:8787).
Local D1 uses persistent storage under `.wrangler/state`, isolated from production.
Use an Access-protected Cloudflare Tunnel to the local server for browser sign-in;
configure its Access application audience in `.dev.vars`. There is no local
authentication bypass. Tests use signed synthetic identities with test-only keys.
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

For Node hosting, set the Access variables in `.env.local` behind an
Access-protected ingress. The Node server listens on `127.0.0.1:4000`. Set `HOST` and `PORT` to change the
listener. Deploy `dist/family-finance` as a complete directory so the server can
serve the sibling browser assets. `npm start` loads `.env.local` if present.
The standalone Node adapter verifies Access before SSR and API handling. After
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
binding and migration directory are checked into `wrangler.jsonc`. No database
password or API token is needed by the running Worker.

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
- `src/server/`: verified Access identity, protected routing and D1 finance APIs.
- `migrations/`: versioned D1 SQLite schema migrations.
- `src/server.ts`: Node Express SSR adapter.
- `src/server.worker.ts`: Cloudflare SSR adapter.
- `worker/` and `wrangler.jsonc`: Worker entry and deployment configuration.
- `public/`: fonts, favicon and static assets.
- `tests/`: model, endpoint and runtime tests.
- `.agents/skills/`: installed Angular development skills.
- `.codex/`: shared agent configuration.
