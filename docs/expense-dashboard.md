# Monthly expense dashboard

Live authenticated `/api/expenses?month=YYYY-MM` queries the Notion Operations
data source `d67250ad-1388-41bf-a0bb-4d7b588aea66`, with full pagination.
One row is one expense operation; amount is `Сумма списания`, not a receipt
line or an inferred fee-adjusted amount. Income and transfers are excluded.
Calendar dates use Europe/Belgrade. Current months stop at today, historical
months include every day. Currencies are separate; there is no FX conversion.
Zero-amount operations count as operations. Days without operations are not
proof that no spending occurred outside Notion.

## Views and metric contract

| View | Question | Encoding and fields |
| --- | --- | --- |
| Daily / cumulative expenses | When did spending occur or accumulate? | Existing zero-based daily bars; amount or cumulative amount, 1–31 observed calendar days, no forecast; exact click/keyboard detail. Bars also suit sparse current months. |
| Merchants | Where does money go; where do we pay most often? | Ranked horizontal bars, amount or operation count; top 6 preview, expandable full list. Labels include amount, count, average amount and share of all expenses in the selected currency. |
| Categories | What was money spent on? | Existing ranked share bars, same denominator and window. |
| Largest expenses | Which records deserve inspection? | Exact-lookup list, largest 10 by amount, date, original merchant and category, links to Notion. |
| Month highlights | What is the daily pace and largest spending day? | Daily average uses elapsed calendar days including zero-operation days; largest day by daily sum (earliest on ties); count of days with zero expense operations. |

## Merchant grouping

Verified against live Notion merchant names on 2026-09-05. Known descriptor
variants for Univerexport, Maxi, Lidl, Wolt, RSOFT Online and Yandex Go are
grouped by network/service. Branches are intentionally combined. Wolt is the
payment service, not an inferred restaurant. Unknown names are only normalized
for Unicode, whitespace and case; missing values remain a visible group.
Original merchant names remain in the largest-expense list. No Notion records
are rewritten. Future aliases require reviewed evidence rather than fuzzy guesses.

## Rendering and QA

Existing live Site components are the user-selected surface; retain the dark
theme and native controls rather than exporting a static analytics snapshot.
Single blue mark root, neutral grid/baselines, mint selection inherited from
the Site. Direct labels, exact values and selected-state underlining supplement
color. Desktop breakdowns use two columns, mobile uses one; long names wrap.
No chart-library or external script dependency. Loading, empty and error states
remain explicit; partial paginated results fail closed; server auth is unchanged.

Run model, endpoint and component-render tests, followed by the production Angular SSR
build. Tests reconcile merchant/day/category totals, cumulative final values,
multiple currencies, missing data, aliases, top-10 bounds, source text parsing,
escaping and authentication. Browser visual QA was not requested.
