# Remove authentication and the Notion database integration

## Task

Remove all application authentication and all integration with the Notion database,
as requested by the user. This supersedes the Cloudflare Access setup task from
merged PR #7.

## Acceptance criteria

- Workspace pages and finance APIs work anonymously without credentials.
- Remove authentication verification, allowlists, owner identity mapping,
  sign-in/sign-out controls and routes, and unused authentication dependencies.
- Remove external database requests, tokens, database identifiers, source mapping,
  and UI links or labels that imply a working Notion integration.
- Retain the Angular finance screens and public read-only API contracts with empty
  data. Do not add fabricated financial data or a replacement persistence system.
- Retain date validation and useful domain calculations and empty states.
- Update configuration, documentation and relevant tests; validate both adapters,
  production builds and strict TypeScript; obtain a read-only review.

## Status

Implementation complete; read-only review found no blocking issues.

Validation:

- `npm test`: both production builds, 15 Node/model/API/runtime tests and
  11 Angular component tests passed.
- `npm run typecheck` and `git diff --check` passed.
- `npm run deploy:check` passed with 28 browser assets and a 1164.51 KiB
  module upload (269.56 KiB gzip), without uploading or deploying.
- Worker types regenerated successfully.
- Removing the unused authentication dependency completed without warnings.

Cloudflare's API confirms Access is not enabled for the account, so no separate
live Access policy required removal. No remote settings or external financial
records were changed or deleted. The change becomes live after the PR is merged
and the deployment pipeline succeeds. The APIs intentionally return empty data;
there is no replacement persistence or editing workflow.
