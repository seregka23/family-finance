# Family Finance

A private family finance dashboard built with Angular 22, server-side rendering,
TypeScript, Tailwind CSS 4, and an Express Node server. The server reads financial
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
hostname; add an explicit hostname and rebuild when deploying at a new origin.
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

This repository builds Angular SSR for Node. It no longer emits a Sites Worker
artifact. The existing live Sites deployment is unchanged by this migration.

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

## Checks

- `npm test`: production Angular build, model/API tests, real SSR-server smoke
  test, and native Angular component interaction tests.
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
- `src/server.ts`: Express server and Angular SSR adapter.
- `public/`: fonts, favicon, and other static assets.
- `docs/`: finance data contracts and feature documentation.
- `tests/`: finance model, API, and production-server tests.
- `.agents/skills/`: installed Angular development skills.
- `.codex/`: shared Codex configuration and agent definitions.
