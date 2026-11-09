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

Access the development server through a Cloudflare Access-protected tunnel.
Configure `CF_ACCESS_TEAM_DOMAIN` (for example,
`https://your-team.cloudflareaccess.com`) and `CF_ACCESS_AUD` with your Access
application audience. The application verifies Access JWT signatures and claims;
client-supplied identity headers cannot authenticate a request.
Set `NOTION_TOKEN` to a Notion integration with access to the data sources in
[the data contract](docs/notion-data-contract.md). `ALLOWED_EMAILS` is a
comma-separated email allowlist. `ACCOUNT_OWNER_BY_EMAIL` maps emails to account
owners, for example `you@example.com=Муж`.

For development, export these variables in the shell before `npm run dev`.
The production `npm start` command also loads `.env.local` if present. Never
commit real credentials. Missing identity or an empty allowlist denies access;
missing Notion configuration returns a private 503 response from the APIs.

## Authentication and production

Cloudflare Access authenticates visitors. The server independently verifies the
`Cf-Access-Jwt-Assertion` signature against your team's signing keys, requires
its issuer and application audience, and checks token expiry. It then checks the
signed email against `ALLOWED_EMAILS`. Neither `oai-authenticated-*` nor
`Cf-Access-Authenticated-User-Email` headers grant access.

Configure `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in the runtime environment.
Missing configuration denies access. The existing sign-in/sign-out URL aliases
use Cloudflare Access rather than the former Sites authentication proxy.

```sh
npm run build
npm start
```

The production server listens on `127.0.0.1:4000` by default. `PORT` and `HOST`
configure the listener. Deploy `dist/family-finance` as a complete directory so
that `server/server.mjs` can serve the sibling `browser` assets. For a container,
set `HOST=0.0.0.0` behind your Access-protected ingress.

The SSR host allowlist in `angular.json` includes localhost, 127.0.0.1, the
existing Sites hostname, and `family-finance.seregka23.workers.dev`.
Set `SSR_ALLOWED_HOSTS` to an explicit comma-separated hostname list when
using another origin (hostnames only, without scheme or port).

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

Complete this setup before using the deployed app:

1. Enable Zero Trust/Access in your Cloudflare account. In **Workers & Pages →
   family-finance → Access**, protect production traffic with an Allow policy
   containing only the family email addresses that should sign in. You can also
   enable Access under **Settings → Domains & Routes** for the `workers.dev` URL.
2. Copy the Access team domain and application's AUD tag into Worker runtime
   variables `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`.
3. Set `ALLOWED_EMAILS` to the same comma-separated email allowlist. Configure
   `ACCOUNT_OWNER_BY_EMAIL` for finance ownership and `SSR_ALLOWED_HOSTS` if
   using a different hostname.
4. Add `NOTION_TOKEN` as a Worker **secret** with access to the required Notion
   data sources. Never put this token into source control or chat.
5. Deploy the updated Worker and open
   https://family-finance.seregka23.workers.dev/. Access should display its sign-in
   flow before the finance dashboard.

Build-time variables do not replace Worker runtime variables. The compatibility
settings make runtime bindings available through `process.env`; `keep_vars`
preserves dashboard-managed variables on deployment. `workers_dev` is enabled;
the application rejects unsigned or invalid identity even if Access has not yet
been configured. Missing Notion configuration returns a private 503 API response.
Version preview URLs remain disabled. Use `npx wrangler deploy` for the production
pipeline; `npx wrangler preview` requires separate preview configuration and is
not the production deploy command.

See [Cloudflare's Worker Access setup](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
and [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Cloudflare's [static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
serves browser files while page and API paths run the Worker first. No SPA HTML
fallback is configured, so an API request cannot become a successful HTML page.

## Angular structure

The shell uses a router outlet; each workspace page is loaded as a separate lazy
route: `/` (overview), `/operations`, `/plan`, `/accounts`, and `/dashboards`.
These URLs support direct SSR loads and normal browser back/forward navigation.
The server verifies Cloudflare Access identity before rendering each workspace route.

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
- `src/server/`: verified Cloudflare Access authentication, access control, and Notion APIs.
- `src/server.ts`: Express server and Node SSR adapter.
- `src/server.worker.ts`: platform-neutral Angular SSR and API entry.
- `worker/` and `wrangler.jsonc`: Cloudflare module and deployment configuration.
- `public/`: fonts, favicon, and other static assets.
- `docs/`: finance data contracts and feature documentation.
- `tests/`: finance model, API, and production-server tests.
- `.agents/skills/`: installed Angular development skills.
- `.codex/`: shared Codex configuration and agent definitions.
