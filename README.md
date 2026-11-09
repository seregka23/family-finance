# Family Finance

A private family finance dashboard built with Angular 22, server-side rendering,
TypeScript, and Tailwind CSS 4, with Node and Cloudflare Workers adapters. The server reads financial
records from Notion; there is no local database. Reporting dates use Europe/Belgrade.

## Development

Use Node.js 22.22.3 or newer (or the current Node.js 24 LTS).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:4200 through the existing trusted authentication proxy.
Set `NOTION_TOKEN` to a Notion integration with access to the data sources in
[the data contract](docs/notion-data-contract.md). `ALLOWED_EMAILS` is a
comma-separated email allowlist. `ACCOUNT_OWNER_BY_EMAIL` maps emails to account
owners, for example `you@example.com=Муж`.

For development, export these variables in the shell before `npm run dev`.
The production `npm start` command also loads `.env.local` if present. Never
commit real credentials. Missing identity or an empty allowlist denies access;
missing Notion configuration returns a private 503 response from the APIs.

## Authentication and production

The app preserves the existing trusted authentication proxy contract. The proxy
must authenticate visitors, strip client-supplied `oai-authenticated-*` headers,
and inject `oai-authenticated-user-email`. Optional names use
`oai-authenticated-user-full-name` and
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.
The proxy owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, and `/callback`.
Direct requests to those endpoints return a configuration error rather than an
Angular page.

```sh
npm run build
npm start
```

The production server listens on `127.0.0.1:4000` by default. `PORT` and `HOST`
configure the listener. Deploy `dist/family-finance` as a complete directory so
that `server/server.mjs` can serve the sibling `browser` assets. For a container,
set `HOST=0.0.0.0` and restrict ingress to the trusted proxy.

Keep direct public access to the Node origin blocked. Identity headers are
trusted proxy input, not independently verified tokens. The SSR host allowlist
in `angular.json` includes localhost, 127.0.0.1, and the existing Family Finance
hostname. Set `SSR_ALLOWED_HOSTS` to an explicit comma-separated hostname list
when deploying at a different origin (hostnames only, without scheme or port).
Do not enable wildcard host trust or forward unchecked proxy headers.

The Express server checks authentication and allowlisting before Angular SSR,
serves the Notion APIs at `/api/operations` and `/api/expenses`, and marks private
HTML and API responses `private, no-store`. Angular hydrates the server-rendered
workspace and loads financial data through HttpClient after hydration. Request
cancellation and timeouts prevent older responses from replacing a newer date
selection. User-specific API responses are excluded from HTTP transfer caching.

The app retains the overview, operation filters and details, monthly plan,
accounts, reserve balances and history, and expense charts and breakdowns.
Fonts are local assets; no Google Fonts network access is needed.

`npm run build` creates both `dist/family-finance` (Node) and
`dist/family-finance-worker` (Cloudflare). `npm run build:node` builds only Node.
The existing live Sites deployment is unchanged.

## Cloudflare Workers deployment

The repository includes a pinned Wrangler dependency and an explicit
`wrangler.jsonc`. It points at the Worker module in `worker/index.mjs` and the
assets in `dist/family-finance-worker/browser`. The Angular `worker`
configuration uses a platform-neutral SSR entry, not the Node Express listener.
The Node and Worker adapters share the page authentication boundary.

The existing Workers Builds pipeline can keep these commands:

```sh
# Build command
npm run build
# Deploy command
npx wrangler deploy
```

Wrangler will use the checked-in paths instead of running framework auto-setup.
For a Worker-only build and deployment, use `npm run deploy`. For local Workers
runtime testing, use `npm run preview`. After a build, `npm run deploy:check`
checks packaging without uploading or deploying anything. `npm run cf:typegen`
regenerates local Workers types after configuration changes.

In the Cloudflare dashboard, configure the runtime values `ALLOWED_EMAILS`,
`ACCOUNT_OWNER_BY_EMAIL`, and `SSR_ALLOWED_HOSTS` for the exact hostname your
trusted proxy serves. Store `NOTION_TOKEN` as a Worker secret. Build-time
variables do not replace Worker runtime variables. The compatibility settings
make runtime bindings available through `process.env`; `keep_vars` preserves
existing dashboard-managed variables on deployment.

This app trusts identity headers from the existing authentication proxy, so its
Worker must remain an origin reachable only through that proxy (for example,
a Service Binding from the proxy Worker). Direct `workers.dev` and version
preview URLs are disabled in the checked-in configuration. Keep the proxy's
existing sign-in routes and header replacement; do not attach an unprotected
public route directly to this Worker.

Cloudflare's [static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
serves browser files while page and API paths run the Worker first. No SPA HTML
fallback is configured, so an API request cannot become a successful HTML page.

## Angular structure

The shell uses a router outlet; each workspace page is loaded as a separate lazy
route: `/` (overview), `/operations`, `/plan`, `/accounts`, and `/dashboards`.
These URLs support direct SSR loads and normal browser back/forward navigation.
The authentication proxy continues to protect every route.

`FinanceWorkspace` owns the shared filter state and resource-backed finance data.
Derived values use `computed`; dependent choices use `linkedSignal`. The resource
unsubscribes obsolete HttpClient requests, and pending or failed requests hide old
totals. Feature components use signals directly rather than getter/setter adapters.
The operation dialog uses a two-way model input and a post-render effect for native
focus/scroll management. Presentational components live under `shared/`.

## Build dependency compatibility

Angular Build 22.2.6 includes `@oxc-parser/binding-wasm32-wasi@0.156.0`, which
pins Emnapi alpha versions outside its WASM runtime's supported peer ranges.
The version-scoped `overrides` in `package.json` align that binding's Emnapi core
and runtime to `2.0.0-beta.3`, supported by `@napi-rs/wasm-runtime@1.2.7`.
This keeps normal npm peer validation enabled. Remove the workaround when the
upstream binding fixes its dependency declarations; the parser WASI regression
test checks synchronous and asynchronous parsing without native fallback.

## Checks

- `npm test`: both production Angular builds, model/API tests, Node and local
  Cloudflare runtime smoke tests, and Angular component interaction tests.
- `npm run test:unit`: model and API tests without a build.
- `npm run typecheck`: strict TypeScript checking.
- `npx ng test --watch=false`: Angular component tests with Vitest and jsdom.

Tests use fixtures, not live Notion credentials. The production smoke test checks
anonymous redirects, denied and allowed identities, actual SSR HTML, private API
responses, and font serving. Component tests cover filtering, operation details,
plans, account totals, request cancellation, chart modes, merchant expansion,
HTML escaping, and reserve/history filtering.

## Layout

- `src/app/`: shell, shared workspace state, HttpClient service, and finance models.
- `src/app/features/`: lazy feature pages, expenses, and reserves.
- `src/app/shared/`: reusable UI components with signal inputs.
- `src/server/`: trusted proxy authentication, access control, and Notion APIs.
- `src/server.ts`: Express server and Node SSR adapter.
- `src/server.worker.ts`: platform-neutral Angular SSR and API entry.
- `worker/` and `wrangler.jsonc`: Cloudflare module and deployment configuration.
- `public/`: fonts, favicon, and other static assets.
- `docs/`: finance data contracts and feature documentation.
- `tests/`: finance model, API, and production-server tests.
- `.agents/skills/`: installed Angular development skills.
- `.codex/`: shared Codex configuration and agent definitions.
