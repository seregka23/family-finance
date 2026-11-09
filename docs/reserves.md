# Account reserves

Accounts → Goals and reserves retains reserve summaries and history views.
The authenticated operations API reads accounts, reserves and history from D1.
Cloudflare Access and the email allowlist protect all finance reads. Reserve snapshots are explicit
database fields; inserting a history event does not automatically alter a snapshot.

Reusable finance calculations keep currencies separate. Reserve allocations are
not expenses; payments are not counted twice. Positive targets enable progress;
missing targets do not imply a percentage. Unknown amounts remain unknown.
