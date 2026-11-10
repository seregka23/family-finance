# UI review — 10 November 2026

Reviewed with the Impeccable audit/harden/craft-floor guidance. This is a refinement
of the existing Russian, month-first workspace. The dark palette, currency
separation, budget hierarchy and pinned Liquid Glass mobile navigation remain.

## Findings and fixes

| Priority | Location | Impact and implemented correction | Reference |
| --- | --- | --- | --- |
| P1 | Registration route link, `src/styles.css` | Link identification depended on mint color alone (1.57:1 against surrounding text). Added a persistent underline and a 44px target. | WCAG 1.4.1; harden |
| P1 | Auth and transaction forms | Generic validation did not identify the field to correct. Added inline Russian errors, `aria-invalid`, descriptive associations and first-invalid focus; entered values survive errors. | WCAG 1.3.1, 3.3.1, 3.3.3; harden |
| P2 | Transaction dialog and operation details | Background scrolling remained possible while adding a transaction. Shared reference-counted locking now restores the original overflow after the last dialog closes. | Interaction integrity; harden |
| P2 | Operations empty state | A new workspace offered filter reset instead of a useful first action. Separate true-empty and filtered states now offer Add or Reset respectively. | First-use clarity; polish |
| P2 | Period selector and auth link | Controls measured 42px and 22px tall. Both meet the project's 44px target floor. This is a product standard, not a claim that every smaller inline link fails WCAG. | DESIGN.md; adapt |
| P2 | Reduced-motion styles | Blanket animation/transition cancellation was replaced with targeted suppression of spatial animation and smooth scrolling while retaining color feedback. | Reduced-motion preference; harden |
| P3 | Transaction controls | Replaced text plus/close symbols with the existing SVG icon component; aligned dialog radius and heading with the design system. | Craft consistency; polish |

## Assessment

Scores use 0–4: absent, poor, partial, good, strong. These are bounded qualitative
ratings, not certification or performance benchmarks.

| Dimension | Before | After | Evidence |
| --- | --- | --- | --- |
| Accessibility | 2 | 3 | Color-only link fixed; field associations/focus covered in DOM tests and browser checks. Full assistive-technology audit remains outside scope. |
| Performance | 3 | 3 | Existing lazy routes and local assets preserved; no dependency added. No Lighthouse benchmark performed. |
| Responsive behavior | 3 | 3 | Desktop/mobile/narrow frames checked; target sizes improved. Wider device coverage remains useful. |
| Theming | 3 | 3 | Existing tokens and pinned navigation retained; form radius/icon inconsistencies corrected. |
| Interaction integrity | 2 | 3 | Empty-state actions, validation and overlapping-dialog cleanup covered by regression tests. |

The existing monthly hierarchy, readable dark surfaces, 16px inputs and mobile
navigation are strengths. The initial pass found no horizontal overflow or page
errors across 17 desktop/mobile/narrow frames. Automated accessibility checks
flagged the registration link; other tested states had no reported violations.

## Validation boundary

All browser work used a local Worker, local D1 and synthetic fixtures. No
production financial records were read or changed. Inspection was bounded to an
initial batched pass and one confirmation pass. Axe checks cover WCAG 2 A/AA and
2.1 A/AA rules available to the tool; a clean scan is not full WCAG compliance.
The Impeccable context launcher/detector was not installed in this checkout;
PRODUCT.md, DESIGN.md, source review, Chromium, axe and component tests supplied
context and verification instead.

Confirmation captured 20 rendered states with no axe violations, horizontal
overflow or page errors. Field errors focused the first invalid input; desktop
Cancel restored body scrolling. The mobile Cancel check exposed a clipped footer
in the long validation form. Added internal modal scrolling and contained
overscroll. A focused functional check also identified a global mobile CTA width
rule pushing Cancel outside the footer; scoped footer sizing corrects that
interaction (no additional visual polishing pass). The confirmation also caught the select's inner control
remaining 42px; the final rule applies 44px directly to the select. Regression
tests additionally verify loading/error states do not show first-use journal copy.

Final result: mobile Cancel receives the actual pointer click, closes the modal
and restores body scrolling. The long form scrolls internally (1417px content in
an 810px client area). Both production builds and all 77 tests pass (40 Node/
model/API/runtime, 37 Angular), as do strict type checking, deployment packaging
dry run and whitespace checks. The Worker build was repeated after the final
CSS-only footer fix. Read-only review reports no unresolved blocking findings.
No deployment was performed.
