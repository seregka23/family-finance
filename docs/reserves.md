# Account reserves

Accounts → Goals and reserves retains reserve summaries and history views.
The public operations API reads accounts, reserves and history from D1.
There is no sign-in or account identity mapping. Reserve snapshots are explicit
database fields; inserting a history event does not automatically alter a snapshot.

Reusable finance calculations keep currencies separate. Reserve allocations are
not expenses; payments are not counted twice. Positive targets enable progress;
missing targets do not imply a percentage. Unknown amounts remain unknown.
