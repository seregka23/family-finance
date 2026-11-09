# Account reserves

Reserves extend the existing authenticated Family Finance workspace. Open
Accounts → Goals and reserves, or use the overview shortcut. The account
balance view remains available; the phone navigation keeps its five buttons.
Editing follows the linked Notion records.

## Data flow

`app/api/operations/route.ts` reads the live Notion accounts, goals, reserve
movements and reserve-linked operations with full pagination. The goals payload
contains current reserve amounts and lifetime history, independent of the
journal's selected date range. `app/reserve-model.ts` maps these records;
`app/reserves-panel.tsx` renders account totals, reserve rows and history.

Notion remains the site's source. An external Supabase mirror is not a site
connection or an automatic synchronization mechanism. Never embed a real
balance, reserve name or sample transaction as a production fallback.

- Each reserve uses its linked account and currency. Account available money is
  the current account balance minus its reserved amount; reserving money does
  not create another account or expense.
- History includes allocations, releases and expense payments. Payment history
  uses the portion attributed to the reserve, not the full expense. Completed
  payments and payments awaiting review have distinct labels; pending payments
  are not represented as confirmed debits.
- The journal retains its original expense and adds reserve attribution. Do not
  count allocation/release records as income or expense, or count payment history
  as an additional expense.
- Positive targets enable progress; absent/nonpositive targets have no invented
  percentage. Deadlines are optional. Archive visibility is a display filter:
  archived goals still contribute earmarked cash until it is released. Notion
  pages archived or moved to trash are excluded from the mapped records.

## Unknown amounts and currencies

Computed amounts accept finite formula, rollup or number values. Missing or
failed formulas remain unknown rather than zero. If the goals query fails,
account reserved and available amounts are unknown. A failed history query
produces a separate retry state without discarding readable current amounts.

If any linked reserve has an unknown amount or a currency different from its
account, both reserved and available account totals remain unknown. No FX
conversion or cross-currency sum is performed. Missing currency currently uses
the existing RSD fallback; event currency is inherited from the linked reserve,
not independently reconciled against the operation. Keep that source-data limit
in mind when adding new currencies or changing relations. A negative available
amount is shown with a warning, not clamped to zero.

## Privacy and verification

The existing ChatGPT authentication and email allowlist run before Notion access.
Browser and upstream fetches use `no-store`; all endpoint JSON responses use
`Cache-Control: private, no-store`. Keep credentials server-side and do not weaken
authentication to obtain screenshots.

The implementation follows the incumbent `PRODUCT.md`, `DESIGN.md`, existing
page components and CSS: dark surfaces, mint actions, explicit warning text,
44px controls and responsive rows. The local glass material remains confined to
the existing mobile navigation. This feature does not refresh the design system
or resolve unrelated preexisting design drift.

Model/API tests, the build and focused TypeScript checks were reported passing
for this change. Coverage includes untargeted reserves, unknown formulas,
archived earmarks, currency mismatch and lifetime partial/pending payments.
Browser QA was blocked by CUA/OpenInCodex infrastructure, so no screenshot,
authenticated visitor rendering or mobile interaction verification is claimed.
The design detector/context tooling was unavailable because its binary-cache
installation required a denied directory. These checks do not establish an
automatic Notion–Supabase sync or deployment of the feature.
