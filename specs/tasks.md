# In-app registration and authorization

## Task

Implement registration, sign-in and authorization inside the D1-backed app,
replacing the Cloudflare Access implementation in the existing authentication PR.
The initial owner email is `seregka23@gmail.com`.

## Acceptance criteria

- Provide public login/registration screens isolated from the finance workspace.
- Use email-bound, expiring, single-use invitations for private family registration;
  no unverified public signup or open administrator bootstrap.
- Store versioned salted password hashes, opaque hashed sessions, invites and
  rate-limit state in an additive D1 migration. Protect passwords with standard
  Web Crypto PBKDF2-SHA256 at 600,000 iterations and a separate random pepper.
- Enforce session expiry, enabled status and member/admin authorization before
  finance reads; revoke/rotate sessions and secure cookies appropriately.
- Protect auth writes with strict Origin checks, JSON body limits and rate limits.
- Keep invitation tokens out of HTTP URLs/logs and remove their browser fragments.
- Preserve finance schemas, reports, precision safeguards and session-expiry UI.
- Pass real registration/authorization/D1/Node/Worker/Angular tests and review.
- Initialize auth storage/configuration and provide a private owner invitation;
  existing finance records remain untouched.

## Status

Source implementation is complete; final read-only review has no blocking findings.
The existing PR #10 is updated to replace Cloudflare Access with application-owned
authentication. No team-domain setup is required.

Validation:

- `npm test`: both production builds, 30 Node/model/API/runtime tests and
  22 Angular tests passed (52 total).
- Real local Worker+D1 tests execute invitation registration, password login,
  authenticated finance reads, logout and persistence across restarts.
- Security tests cover invite replay/expiry/email binding and concurrency,
  password hashing, cookie flags, session rotation/revocation/expiry, disabled
  users/roles, origin/body protections, rate limits and forged identity headers.
- Browser/HTTP tests verify fragment-only invitation delivery, immediate history
  removal, no invitation in HTTP URLs/SSR HTML, and private helper output files.
- Fresh `npm ci` installed 452 packages without warnings.
- TypeScript, generated bindings, whitespace checks, the local migration command
  and deployment dry run passed. Worker packaging contains 34 assets, 1284.16 KiB
  module (292.75 KiB gzip). Native timing-safe comparison was verified in workerd.

Production preparation:

- Applied additive `0002_auth.sql` to the existing D1 database and recorded the
  migration. Verified no foreign-key violations and no users or sessions yet.
- Created a cryptographically random `AUTH_SECRET` directly in Cloudflare without
  printing or committing it. Cloudflare's secret API publishes a secret version
  of the existing Worker; the new application code still awaits PR deployment.
- Stored one expiring, single-use admin invitation for `seregka23@gmail.com` in
  D1 as a hash. Its raw registration link is only in a private mode-0600 file
  delivered to the user, outside the repository. It expires after 24 hours.
- Existing finance tables and records were unchanged.

After merge/deployment, use the private invitation to register and verify the live
flow. Production authentication and CPU usage have not been tested on the deployed
new code. The local 600,000-iteration password hash took about 79 ms; the production
Worker must have sufficient CPU budget. Billing settings were not changed.
Self-service password recovery and account-administration UI are not implemented;
trusted administrators manage invitations and user status through SQL tooling.
