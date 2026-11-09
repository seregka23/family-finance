# Fix production registration failure

## Task

Fix registration returning HTTP 503 and the Russian service-unavailable message.
Preserve account authorization, strong password hashing and existing finance data.

## Acceptance criteria

- Use a standard password KDF supported by Cloudflare's production limits without
  lowering password security. Keep the separate pepper and per-user salts.
- Add a forward-only schema migration for the actual credential scheme; do not
  edit the applied auth migration, rebuild user tables or invalidate references.
- Preserve legacy credential metadata and verification where supported; never
  silently lower iteration counts to work around a provider limit.
- Add safe internal diagnostics for unexpected auth failures, without logging
  passwords, tokens, emails or parameterized SQL.
- Reproduce the production PBKDF2 cap in tests, exercise real native scrypt and
  register/login against the built Worker and D1, and retain finance regressions.
- Pass builds, strict TypeScript, deployment packaging and read-only review;
  apply the additive migration before the new code is deployed.

## Findings and status

Production registration reached all rate-limit stages but returned app503 without
creating a user or consuming the invitation. Its invocation outcome was `ok`,
CPU 4 ms, wall 772 ms. Runtime bindings and auth migrations were present.

Upstream workerd defines a default 100,000-iteration PBKDF2 cap; local workerd's
server factory disables the cap. A new production-limit regression reproduces
our previous 600,000-iteration registration failure. Both WebCrypto and Node PBKDF2
share the same limit, so changing only the API would not fix it.

Implementation complete and reviewed without blocking findings.

New registrations use native scrypt N=32768, r=8, p=3, 32-byte output and a
64 MiB memory ceiling, with the original per-user salt and HMAC pepper. This
matches the OWASP recommended 32 MiB configuration and stays under the production
scrypt cost ceiling (786432 < 1048576). Additive migration0003 introduces the
actual `password_scheme` discriminator without rebuilding or deleting anything;
legacy verification never silently reduces its iteration count.

Validation passed:

- `npm test`: both production builds, 33 Node/model/API/runtime tests and
  22 Angular tests (55 total).
- Explicit production PBKDF2 limit reproduced the original503 before the fix;
  registration and login now succeed with that limit enabled, using real scrypt.
- Independent native scrypt vector, migration record preservation, legacy
  behavior and diagnostic log privacy regressions passed.
- Strict TypeScript, generated bindings, whitespace and deployment dry run passed:
  34 assets;1285.31 KiB module (293.41 KiB gzip).

Applied and recorded `0003_auth_password_scheme.sql` on the production D1 database.
Verified no foreign-key violations, no users yet and the existing owner invitation
still unused. No finance records, credentials, sessions or invitations were reset.
New application code awaits PR merge/deployment through the existing pipeline.
Live registration/login on the new code has not been verified; direct site HTTP
access was unavailable to this execution environment, so production logs and
server-side database checks were used for diagnosis. Retry the existing invitation
after deployment, then confirm successful registration and login.
