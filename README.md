# Family Finance

A private family finance dashboard built with Next.js 16 App Router, React 19,
TypeScript, and Tailwind CSS 4. The server reads financial records from Notion;
there is no local database. Dates and reporting periods use Europe/Belgrade.

## Development

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Set `NOTION_TOKEN` to a Notion integration with access
to the data sources described in [the data contract](docs/notion-data-contract.md).
`ALLOWED_EMAILS` is a comma-separated email allowlist. `ACCOUNT_OWNER_BY_EMAIL`
maps emails to account owners, for example `you@example.com=Муж`.
Missing authentication or an empty allowlist denies access; missing Notion
configuration returns a private 503 response from the APIs.

## Authentication and deployment

This migration preserves the existing trusted authentication proxy contract.
The proxy must authenticate visitors, strip client-supplied `oai-authenticated-*`
headers, and inject `oai-authenticated-user-email`. Optional full names use
`oai-authenticated-user-full-name` with
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.
The proxy also owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, and `/callback`.
Next.js does not implement these authentication endpoints.

Run the server only behind that trusted proxy, with direct public access to the
Node origin blocked. These identity headers are trusted input, not independently
verified tokens. Do not expose the origin directly to the Internet. Local
requests without the proxy redirect to sign-in; authenticated local testing can
use the same headers against localhost only.

```sh
npm run build
npm start
```

`next start` serves the production build on port 3000; set `PORT` to change it.
Configure the same environment variables on the server. The app uses native
Next.js route handlers and server rendering, so static export is not supported.
It no longer builds a Sites/Cloudflare Worker artifact and does not change the
existing live Sites deployment.

`next.config.ts` also enables a self-contained Node deployment. Copy the static
assets alongside the generated server before running it:

```sh
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
node .next/standalone/server.js
```

Fonts are served from `public/fonts` with their original Unicode subsets; builds
and rendering do not depend on Google Fonts network access.

## Checks

- `npm test`: production build, model/API/component tests, and a real Next.js
  production-server smoke test for redirects, allowlisting, API status codes,
  private caching, and local fonts. No live Notion credentials are needed.
- `npm run test:unit`: model, API, and component tests without a build.
- `npm run typecheck`: generate Next.js route types and check TypeScript.
- `npm run lint`: run ESLint.

## Project layout

- `app/`: dashboard, finance models, authentication helpers, and API routes.
- `docs/`: finance data contracts and feature documentation.
- `tests/`: model, API, rendering, and production-runtime tests.
- `.codex/`: shared Codex configuration and agent definitions.
