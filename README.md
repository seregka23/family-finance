# Family Finance

A public family finance interface built with Angular 22, server-side rendering,
TypeScript, and Tailwind CSS 4, with Node and Cloudflare Workers adapters.
Reporting dates use Europe/Belgrade.

## Data and access

Authentication and the Notion integration have been removed. No sign-in,
allowlist, API token, or database configuration is required. The application
starts with empty operations, accounts, monthly plans, receipts, and reserves.
It does not fetch, store, or modify external financial records. No replacement
database or sample financial data is included.

The public read-only APIs retain the frontend contract:

- `/api/operations?from=YYYY-MM-DD&to=YYYY-MM-DD&month=YYYY-MM-01`
- `/api/expenses?month=YYYY-MM`

Valid requests return empty finance data; invalid dates or months return 400.
The former sign-in, sign-out and callback routes return 404.

## Development

Use Node.js 22.22.3 or newer (or Node.js 24 LTS).

```sh
npm ci
npm run dev
```

Open http://localhost:4200. Environment files are optional. `SSR_ALLOWED_HOSTS`
can override the SSR hostname allowlist with comma-separated hostnames, without
scheme or port. `.env.example` documents this optional setting.

## Production

```sh
npm run build
npm start
```

The Node server listens on `127.0.0.1:4000`. Set `HOST` and `PORT` to change the
listener. Deploy `dist/family-finance` as a complete directory so the server can
serve the sibling browser assets. `npm start` loads `.env.local` if present.

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
uploading. `npm run cf:typegen` regenerates local Worker types.

No runtime secrets are needed. Previously configured authentication or database
variables are unused and can be removed from the Worker dashboard. If Cloudflare
Access was enabled separately in the dashboard, disable its protection for this
Worker to allow public access; application code cannot remove an edge policy.

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
  smoke tests, and Angular component tests.
- `npm run test:unit`: model and API tests without a build.
- `npm run typecheck`: strict TypeScript checks.
- `npx ng test --watch=false`: Angular component tests.

## Layout

- `src/app/`: finance UI, domain models, state and HTTP client.
- `src/server/`: public page routing and empty read-only finance APIs.
- `src/server.ts`: Node Express SSR adapter.
- `src/server.worker.ts`: Cloudflare SSR adapter.
- `worker/` and `wrangler.jsonc`: Worker entry and deployment configuration.
- `public/`: fonts, favicon and static assets.
- `tests/`: model, endpoint and runtime tests.
- `.agents/skills/`: installed Angular development skills.
- `.codex/`: shared agent configuration.
