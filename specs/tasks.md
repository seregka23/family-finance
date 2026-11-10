# Review and fix the site with Impeccable

## Task and acceptance criteria

Review the existing site and implement concrete usability/accessibility fixes.
Preserve PRODUCT.md/DESIGN.md, the dark month-first hierarchy and pinned mobile
navigation. Use local synthetic data; do not modify production finances.

- Inspect signed-in routes and authentication on desktop/mobile.
- Fix identified field validation, touch targets, dialog and empty-state issues.
- Preserve authentication, transaction and D1 behavior.
- Add focused regressions; pass production builds, tests, typecheck, packaging and
  read-only review. Record findings and remaining limits in docs/ui-review.md.

## Status

Complete. Read-only review has no unresolved code blockers; the final requested
mobile Cancel pointer check passes after the footer sizing correction.

- `npm test`: both production builds, 40 Node/model/API/runtime tests and 37
  Angular tests pass (77 total).
- `npm run typecheck`, worker rebuild after the final CSS fix, deployment dry run
  and `git diff --check` pass. There is no separate lint script in this project.
- Initial 17-frame audit and bounded 20-state confirmation used local synthetic
  data. Confirmation reported no axe violations, horizontal overflow or page
  errors; field errors focus the relevant input. The inner select height was
  corrected after confirmation. Mobile modal scrolling and real Cancel click
  were separately verified after the final correction.
- No production data, auth/backend contracts, migrations or dependencies changed.

See docs/ui-review.md for findings, corrections, scores and limits. Automated
checks do not constitute full WCAG certification; broader assistive-technology
and device coverage remain non-blocking follow-up work. No deployment performed.
