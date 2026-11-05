# Organization Dashboard mobile layout

The Dashboard previously stacked all four KPI cards vertically, constrained the
date presets inside a flex row, and nested multiple padded status panels. Local
Dashboard variables were incorrectly declared on an emulated `:root`, rather
than its component host, so intended colors were not reliably applied.

The existing Dashboard now uses a two-column KPI grid below 768px and retains
four desktop columns. The mobile header places title/context and the accessible
alert button together. Date presets are separate rounded buttons in one compact
row, with a light-purple selected state and horizontal scrolling on narrow
screens. The actual date range remains below the buttons.
The custom-date panel fits the same container and preserves existing behavior.

Organization cards retain their names, per-organization links, administrator
feedback and readiness rules. Mobile spacing/typography are reduced, primary
buttons span the card, explanatory next steps use plain muted text and actual
administrator comments keep their highlighted treatment. Zero failed payments
use a neutral KPI style. No data or financial calculations were changed.

Tables scroll inside their own cards when necessary; the page itself does not
scroll horizontally. Dashboard colors are defined on `:host`. The shared
sidebar, authentication, business clock and backend are unchanged.

Verification uses real Angular components with mocked HTTP and real styles,
plus `node scripts/verify-dashboard-responsive.cjs` for exact 320/390/768/1440px
viewport checks and local screenshots. Its HTML is explicitly isolated fixture
markup, not a new product page. It does not use application credentials or the
shared backend. Real device/Safari verification is not covered by these tests.

Metric cards use white surfaces, rounded corners and subtle shadows without
borders or colored top stripes. The Dashboard grid keeps all four cards equal
in height; semantic colors stay on headings/icons. Platform Dashboard and
campaign ambassador metric cards follow the same surface treatment. Form,
organization status and alert borders are preserved. Rounded zero-percent
changes have neutral text and no directional arrow; missing comparison data
is explicitly identified instead of being presented as growth.

Verification passed: 254 lifecycle/responsive regression executions, followed
by 80 final Dashboard-focused executions after the neutral empty-failure style.
Exact viewport containment/date reachability checks passed at all four widths;
320px and 390px screenshots were visually inspected. Production build passed
with the existing, unchanged campaign-preview CSS budget warning.
