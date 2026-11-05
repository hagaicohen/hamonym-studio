# HAMONYM Design System

Direction: a restrained, professional SaaS interface for nonprofit fundraising.
Line icons (Lucide), purple brand, neutral surfaces, soft borders, minimal
shadows, Hebrew RTL first. No decorative emoji, heavy gradients or playful
illustration in product UI.

## Rule: no decorative emoji in application UI

Application UI uses Lucide outline icons only. Do not use emoji (👋 🏢 💛 🤝 🗑 💾
…) as icons, bullets, button prefixes, status marks or decoration, and do not use
the text marks ✓ ✕ ⚠ in their place.

- Icons are decorative by default: wrap them with `aria-hidden="true"` and keep
  the meaning in visible text (or an `aria-label` on an icon-only button).
- Sizes come from `HM_ICON_SIZE` (16 inline/buttons, 20 compact, 24 cards and
  empty states, 40 hero marks), stroke from `HM_ICON_STROKE` (1.75).
- Icon boxes use `--hm-brand-50` background with `--hm-brand-600` icon, or a
  neutral surface with `--hm-text-muted`; status marks use the semantic tokens.
- Not covered: user-generated content, campaign content templates and public
  campaign pages (campaign owners' own text may contain emoji).
- Enforcement: `node scripts/test-no-ui-emoji.cjs` checks the migrated areas;
  each migration adds its paths to `ENFORCED`.

## Decisions (2026-11-03)

- Primary brand purple is `#583cd6` (`--hm-color-primary`). `#7c3aed` remains a
  secondary shade (`--hm-brand-secondary`). Existing hard-coded colors are not
  replaced globally; screens move to tokens when they are migrated.
- Public campaign pages and campaign content templates (presets, user text) are
  out of scope. They keep the campaign theme system.
- Form-control tokens (`--hm-control-*`, `src/styles/_form-controls.scss`) are
  unchanged and remain the source for inputs and dropdowns.
- Rollout is incremental. Phase 1A is the foundation plus 4 empty states;
  nothing else is migrated until approved.

## Phase 1A (implemented)

| Piece | Location |
|---|---|
| Design tokens: brand scale, neutrals, semantic, radius, shadow, spacing (4px grid), type scale, icon boxes | `src/styles/_tokens.scss`, loaded globally before form controls |
| Icon constants: `HM_ICON_SIZE` (16/20/24/40), `HM_ICON_STROKE` (1.75) | `src/app/shared/ui/design-system/icons.ts` |
| Global Lucide defaults, `provideHmIconDefaults()` in `app.config.ts` | same file |
| `hm-empty-state` (standalone) | `src/app/shared/ui/empty-state/` |
| Showcase, local only | `/dev/design-system` |

### Lucide defaults

The global defaults are set in one place but deliberately equal the library
defaults (size 24, stroke 2, `currentColor`). 35 existing icons set no size and
160 set no stroke width, so a different global value would restyle screens that
were not migrated. Design-system components pass `HM_ICON_SIZE` /
`HM_ICON_STROKE` explicitly. Changing the global stroke to 1.75 is a later,
separate decision.

### hm-empty-state

```html
<hm-empty-state [icon]="Handshake" title="אין שותפים עדיין" description="…">
  <button …>+ שותף חדש</button>   <!-- optional, projected -->
</hm-empty-state>
```

Inputs: `icon` (Lucide icon data), `title`, `description`, `size`
(`default` | `compact`, for use inside tables and panels), `headingLevel`
(2–4, rendered as `role="heading"`). The icon is decorative (`aria-hidden`).
Without projected content the action row is hidden. Text is centered and works
in RTL and at 360px.

Migrated (existing copy kept word for word, emoji removed):

| Screen | Before | After |
|---|---|---|
| Partners list | 🤝 + text + button | `Handshake`, default, keeps the create action |
| Campaign builder, sponsors step | 🤝 + text + hint | `Handshake`, compact, hint as description |
| Donations (entity) | text only | `HandCoins`, compact |
| Donors | text only | `Users`, compact |

### Showcase

Route `dev/design-system` is defined in `src/app/modules/dev/dev-only.routes.ts`.
Production builds replace that file with `dev-only.routes.prod.ts` (empty) via
`angular.json` `fileReplacements`, so the page is not in the production bundle;
`devOnlyGuard` also limits it to localhost. View it with `npm start` and open
`http://localhost:4200/dev/design-system`.

### Tests

`src/app/shared/ui/empty-state/empty-state.component.spec.ts` (in
`tsconfig.form-controls.spec.json`): heading semantics, decorative icon, icon
size and stroke, compact variant, hidden empty action row, brand tokens, RTL and
phone width, form-control tokens unchanged, Lucide global defaults unchanged,
showcase route guarded, Partners empty state renders and keeps its action.

## Onboarding flow (2026-11-03)

All emoji in the onboarding flow replaced with Lucide, layout, Hebrew copy,
navigation and logic unchanged:

| Screen | Before | After |
|---|---|---|
| Welcome title | ברוכים הבאים … 👋 | emoji removed |
| Welcome cards | 🏢 💛 🤝 | `Building2`, `HandHeart`, `Megaphone` (24, brand box); arrow → Lucide `ChevronLeft` |
| Onboarding type selection | 🏛️ 🚀 💼 ❤️ | `Landmark`, `Megaphone`, `BriefcaseBusiness`, `HandHeart` (24, 56px brand box) |
| Registration wizard, save draft | 💾 שמור טיוטה | `Save` 16 + text |
| Payment step, connection test | ✓ / ✕ | `Check` / `X` on `--hm-success` / `--hm-danger` |
| Billing step, token saved | ✓ text | `Check` 16 |
| Review step, success overlay | ✓ | `Check` 40 |

Ambassador uses `Megaphone` (raises funds for a campaign); `Handshake` stays
reserved for partners/sponsors. Tests: `src/app/modules/onboarding/onboarding-icons.spec.ts`
and `scripts/test-no-ui-emoji.cjs`.

Known exceptions, left for later phases: the shared `app-organization-checklist`
(✓ / − marks; also used in Super Admin) and the topbar user-menu actions
(🏗️ 🤝 🏭; not shown on the welcome page, which renders the public topbar).

## Category pickers (2026-11-03)

Shared components in `src/app/shared/ui/category-picker/`, used in organization
onboarding (step 1) and organization settings. One source of truth for the list:
`src/app/shared/config/entity-categories.ts` (46 categories, sorted with
`Intl.Collator('he-IL')`, "אחר" last), mirrored in hamonym-backend
`src/modules/campaigns/entity-categories.js` and checked by its sync test.

- One unified multi-select, `app-category-selector` (product decision 2026-11-04):
  a search field ("חפש קטגוריה להוספה...", partial, niqqud-insensitive Hebrew
  match, Escape clears), "קטגוריות שנבחרו (N)" as light-purple chips with an X
  (`aria-label` "הסר …"), always visible regardless of the search, and
  "כל הקטגוריות" as toggle chips (`aria-pressed`, solid purple + check when
  selected). The search filters only "כל הקטגוריות". No dropdown.
- Data contract unchanged (`primary_category` + `secondary_categories`):
  `category-selection.ts` maps the ordered list; the first selected category is
  the primary, removing it promotes the next one. Existing data is shown as
  [primary, ...secondary], deduplicated. Onboarding still requires at least one
  category; in settings, clearing all saves `primary_category: null`.
- Settings view shows one "קטגוריות" list, primary first.
- Category suggestions (`app-category-suggest`, Super Admin page
  `/platform/category-suggestions`, backend migration 086) are built but hidden:
  `CATEGORY_SUGGESTIONS_ENABLED = false` in `src/app/shared/config/category-suggestions.ts`.

## Next phases (not started)

- 1B: remaining empty states (ambassadors, registrations, reports, Super Admin
  lists, notification bell).
- 2: UI emoji to Lucide in navigation and action buttons; ✓ ✕ ⚠ marks.
- 3: shared buttons, badges and notices.
- 4: gradual consolidation of cards, shadows, radii and type per screen.
