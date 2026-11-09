# Family Finance deployment and authentication

## Task

Make the deployed Family Finance application accessible at
`https://family-finance.seregka23.workers.dev/` using Cloudflare Access, as
selected by the user after the successful Worker deployment.

## Acceptance criteria

- Enable the production workers.dev route in deployment configuration and allow
  its exact hostname for Angular SSR.
- Authenticate server-rendered pages and finance APIs using signed Cloudflare
  Access JWTs with the configured team issuer and application audience.
- Reject forged identity headers and invalid, expired, or missing JWTs. Retain
  the family email allowlist and account-owner mapping.
- Use Cloudflare Access for sign-in/sign-out and document required runtime
  variables, secret configuration, and the account-level Access setup.
- Verify both Node and Worker adapters, type checking, builds, and relevant tests;
  obtain a final read-only review.

## Status

Source implementation is complete and reviewed without blocking findings. The
previous deployment fix is merged in PR #6. Validation passed:

- `npm test`: Node and Worker production builds, 28 Node tests (including signed
  JWT and both runtime smoke tests), and 10 Angular tests.
- `npm run typecheck` and `git diff --check`.
- `npm run deploy:check`: 28 browser assets, 1240.94 KiB module upload (dry run).
- `npm run cf:typegen`.
- Fresh `npm ci --no-audit --no-fund`: 453 packages, no warnings.

Live activation remains pending, so the overall deployment task is not closed.
The account requires Access onboarding and a confirmed family email policy; the
deployed Worker has no runtime bindings. Configure the Access team domain,
application audience, allowlist and owner mapping, and add the Notion token as a
Worker secret. Runtime credentials must never be committed or sent in chat.
After the source PR is merged/deployed and Access is configured, verify the live
sign-in flow and authorized finance data. No live settings were changed during
this source task.
