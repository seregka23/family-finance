# Finance workspace

## Direction
Operate. Month-first composition informed by YNAB's plan priorities, Monarch's financial overview and Actual's persistent navigation. Inherit the established dark palette; this pass changes hierarchy and navigation, not identity.

## Tokens
Background #070b14, surface #0d1421, text #f5f7fb, muted #a6b2c4, mint #62f5c6, warning #ffcb72. Panel radius 16px. Border defines elevation, without decorative glow. Main text 16px; secondary 14px. Controls at least 44px.

## Composition
Desktop above 1100px: 220px sticky sidebar and fluid content. Smaller screens retain a compact header. Phone up to 700px: five persistent bottom tabs, with safe-area padding. No hidden primary navigation behind a hamburger on phones.

Mobile navigation is explicitly user-pinned to Liquid Glass: floating dark translucent capsule with backdrop blur, a subtle reflective edge, five 24px SVG icons and 52px touch targets. Labels remain accessible; desktop text labels are preserved. Solid fallback for unavailable blur and reduced transparency. This material is local to the navigation, not a site-wide glass theme.

## Overview hierarchy
Month budget summary first: actual, plan, remaining, progress per currency. Then period metrics, personal accounts, categories, latest operation and recent journal. Existing detail/filter flows are preserved. Overspending is explicitly labelled, not represented solely by color.

## Sources
- https://www.ynab.com/whats-new/the-great-ynab-remodel
- https://www.monarch.com/features/tracking
- https://actualbudget.org/docs/tour/user-interface/

## Validation boundaries
Invitation-based registration, password sign-in and server-side sessions protect the workspace and D1 finance APIs. Automated checks cover date boundaries, currency isolation, authenticated SSR/API access and public authentication screens and component interactions.
