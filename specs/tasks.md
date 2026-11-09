# Restore authentication for D1 finance

## Task

Add authentication to the existing D1-backed Family Finance application. Use the
previously selected Cloudflare Access provider and confirmed allowed email
`seregka23@gmail.com`. Preserve the D1 database, schema and financial behavior.

## Acceptance criteria

- Verify signed Access identities for workspace pages and both finance APIs,
  checking issuer, audience, signature, expiry, subject and signed email.
- Enforce the configured email allowlist; ignore spoofed email headers/cookies.
- Missing configuration fails closed (503), missing/invalid identity returns 401,
  denied verified users receive 403. Authenticate before validation or D1 queries.
- Add working Access login/logout routes and accessible sign-out controls;
  recover from expired/denied sessions without exposing old finance totals.
- Preserve D1 reads and precision safeguards, without schema/data changes or a
  local authentication bypass.
- Update configuration/docs and signed-identity API/Node/Worker/Angular tests;
  pass both builds, TypeScript, deployment checks and final review.

## Status

Source implementation is complete and read-only review has no blocking findings.

Validation:

- `npm test`: both production builds, 27 Node/model/API/runtime tests and
  17 Angular tests passed (44 total).
- Signed RSA/JWT tests cover signatures, claims, email allowlisting, spoofed
  identity headers/cookies, configuration errors and denial before D1 access.
- Node and real local D1 Worker smoke tests cover authenticated pages/APIs,
  denied identities and persisted finance data.
- UI regression tests open an operation dialog, trigger 401/403, and verify old
  details disappear and do not return after recovery.
- Strict TypeScript, generated binding types and whitespace checks passed.
- Wrangler deployment dry run passed with D1 and the confirmed email allowlist:
  28 browser assets, 1211.52 KiB module (281.03 KiB gzip).
- Adding `jose` completed without install warnings.

Live activation remains pending: Cloudflare reports Access is not enabled for
this account. The user was asked to complete onboarding and provide the team
domain. The application AUD tag must also be set in Worker runtime settings.
The checked-in allowlist contains `seregka23@gmail.com`. Until setup is complete,
protected routes fail closed. No live configuration, Worker deployment, D1 schema
or financial data was changed during this task. After source merge/deployment
and account setup, verify the live Access sign-in, allowed-user data and logout.
The overall live-authentication task is not yet closed.
