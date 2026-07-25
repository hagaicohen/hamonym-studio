# Campaign Builder — Session Context

Summary of a long, continuous session of work on the Campaign Studio /
Page Builder (steps 1 and 9 of the campaign builder, plus the public
preview and the campaigns list). For continuity in a new chat. Covers
four pushes to `main`: `1c99818`, `11dc818`, `144a0bf`, `3b9ded2`.

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals, `@if`/`*ngIf` — this repo (`hamonym-app`)
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`
- Hebrew, RTL throughout.
- `npx ng build` (not just `tsc --noEmit`) is required to catch Angular template compile errors — used after every change this session.

---

## 1. Registration, Presets, Flexible Layouts (`1c99818`)

- **Registration Options**: a first-class step (`campaign-registration-step/`), distinct from Offerings (donation perks). Race/event campaigns (e.g. a running race) define participant options (route, ticket type, etc.); the checkout flow lets a visitor register (multi-participant) and separately donate, in one modal, remembered across open/close cycles. `DonationPayload` (`donation.service.ts`) gained a parallel `participants?: Array<{ name, registrationOptionId?, shirtSize? }>` field alongside `rewards` — "who's registered" vs. "what's being charged," re-priced server-side against `registration_options`.
- **Offerings**: the old "Rewards" step/model renamed to `campaign-offerings-step/` and split cleanly from Registration Options — pure donation perks only.
- **Preset picker**: a new first step ("what kind of campaign?" — donation / race / general) ahead of the Template picker (visual style), driving copy/suggestions elsewhere in the builder. See `builder/presets/campaign-presets.ts` and the new `campaign-preset-picker/` component.
- **Template Picker gained its own palette row**: `TemplatePickerComponent` now emits `{ template, palette }` instead of just `template` — a row of solid-color swatches (`TEMPLATE_PALETTES`, `.tp-swatch`) lets the manager pick a base color at campaign creation, which `buildTheme(palette)` expands into a full 9-field `CampaignTheme`. This is the exact mechanism §5 below reuses in step 9.
- **Hero as a real block**: Hero became an orderable block type (`BlockType = 'hero'`) instead of an implicit, fixed page element. Containers can claim the sticky sidebar rail or the entire main column (`railZone`), making the full-height sidebar layout mode fully symmetric and editable on both sides.
- **Builder navigation became free and purely local**: the stepper (`campaign-stepper.component.ts`) gained a "הרשמה" step (9 steps → 10, `TOTAL_STEPS` in `campaign-editor.component.ts`) and can jump to *any* step directly, not just sequentially or only in edit mode. More importantly, `nextStep()`/`previousStep()`/`goToStep()` no longer save the draft to the backend as a side effect of navigating — `CampaignStudioStateService` already holds the whole draft in memory, so moving between steps (including jumping straight to step 5) never touches the server. The campaign is now only ever persisted by an explicit action: the topbar's "שמור טיוטה" button or reaching Publish. Step transitions also scroll the content panel back to top.
- **Checkout modal fixes**: registration no longer auto-adds a blank participant (only on explicit "+ הוסף משתתף"), participants are always removable to zero, rows are compact single lines instead of large cards, and a `min-height: 0` fix on `.checkout-form-panel` stopped content below the fold from being clipped instead of scrollable.
- New Registrations admin page/module (`campaigns/pages/registrations-page/`).
- Misc: fixed a stuck loader on campaign load failure, `AppLoaderService` NgZone safety, sidebar nav updates, and traced a Hero-above logo appearing off-center all the way to the uploaded logo *file* having 78px of asymmetric transparent padding — fixed by cropping and re-uploading the asset (not a CSS bug).
- Also fixed: a Hero video that didn't play on click — it was missing a `(click)` handler entirely, not a browser/environment issue.

## 2. Hero Text Tiers — Title / Subtitle / Description (`11dc818`)

Three independent text tiers above the campaign's main story, each with its own position control relative to the Hero: `above` / `hero` / `below` / `hidden`. Stored in `layout` (an opaque JSONB passthrough column server-side — no migration needed):

- `heroTitlePosition`, `heroSubtitlePosition` — existing title/subtitle fields (step 1), now positionable instead of a fixed on/off toggle. Also gained independent styling (via `heroTextStyle`/`app-text-style-editor`, surfaced in both step 1 and step 9).
- `projectDescription` / `projectDescriptionPosition` — a genuinely new, third tier: a short rich-text project description, distinct from both the subtitle and the main "story" block. Field lives in step 1, right above the "STORY" (`app-rich-text-editor` bound to the first rich-text block) section.

All three tiers render through the *same* `heroTpl` template in `campaign-preview.component.html` across all three zones (above-Hero, inside-Hero, below-Hero) — zero duplicated rendering logic.

## 3. Tabs Block (`11dc818`)

A new addable Page Builder block (step 9), with 3 visual styles (underline / pills / boxed) and a per-instance accent color.

**Architecture**: a tab's content *is* a regular `container` block — `TabsBlockData.childBlockIds` has the exact same shape as `ContainerBlockData.childBlockIds` (one container per tab), so the entire existing child-management surface (add/remove/reorder/edit-any-block-type-inside) works for tabs via simple type-check widening (`'container'` → `'container' || 'tabs'`), not parallel infrastructure.

- `addBlock('tabs')` seeds 2 starter tabs ("טאב 1"/"טאב 2") — an empty tab bar looks broken, unlike an empty container.
- **Cascade-delete fix**: removing a container/tabs block with children now recursively removes all descendants *and* strips the removed ids from any surviving parent's `childBlockIds` — the first version left orphaned dangling ids, caught by testing (Playwright), not inspection.
- Rendering: `campaign-preview.component.html`'s `blockTpl` gained a `*ngIf="block.type === 'tabs'"` branch — a clickable header bar plus one recursive `[ngTemplateOutlet]` for the active tab's container.

### Bug: tab content leaking into the Story field
Reported: typing into a tab's rich-text block auto-filled the "תיאור קצר של הפרויקט" field. Root cause was actually adjacent: `campaign-basic-step.component.ts`'s `storyContent` getter/setter did a naive `draft.blocks.find(b => b.type === 'rich-text')` over the *flat* blocks array, with zero container/tabs-nesting awareness — a pre-existing latent bug that tabs made easy to trigger (a nested rich-text block could become "first" in the array). `projectDescription` itself was already fully isolated (only ever set via `setProjectDescription`, no path reads `draft.blocks`).

Fix: `storyContent`/`setStoryContent` now skip any rich-text block nested inside a container or tabs (a `nestedBlockIds` helper built from every container/tabs' own `childBlockIds`). Verified even in the worst case — original Story block deleted entirely, so the tab's block is the *only* rich-text block left in the array — `storyContent` still stays empty.

### Tabs UX cleanup
Three separate points of confusion, found by walking the actual UI in Playwright rather than reading code:
1. Each tab displayed the generic block type label "מסגרת" (Frame) prominently, with its own name ("טאב 1") only as a small secondary label. Now shows "📑 טאב" instead when the parent block is `'tabs'`.
2. The nested "+ הוסף לכאן" picker offered all 16 block types including `hero` — nesting a whole Hero section inside a tab makes no sense. `nestedBlockGroups` (the full `BLOCK_GROUPS` minus `hero`) is now used for any nested/mini picker.
3. A legacy, separate checkbox list ("בלוקים בתוך הקונטיינר") let you manually reparent *any* existing block anywhere in the draft (including Hero, stats, other tabs) into a container by checking it off — fully redundant with, and far more confusing than, the tree-based "+ הוסף לכאן" flow. Removed entirely (`toggleContainerChild` and its CSS deleted too).

## 4. CTA Purpose Picker (`11dc818`)

CTA blocks (`type: 'cta'`) previously always scrolled to the donation widget on click, regardless of the button's label text. For race/event campaigns (those with Registration Options configured), a single always-visible "מטרת הכפתור" toggle (תרומה / הרשמה למירוץ) now sets **both** the click action (`ctaAction: 'donate' | 'register'`) and a matching default button label together — no separate "עיצוב מתקדם" step required. `register` opens the registration checkout (`startRegistration()`) instead of `scrollToDonation()`.

First version gated the picker behind `registrationOptions.length > 0`, which made it too easy to miss — simplified to always show it, positioned as the very first field in the CTA editor.

## 5. Theme Color Palette Presets (`11dc818`)

The Page Builder's "צבעי תמה" section (step 9) previously only had 4 manual color pickers (primary/secondary/accent/body text). Added one-click palette swatches — deliberately reusing the *exact same* 8 base-color palettes and derivation logic (`TEMPLATE_PALETTES` + `buildTheme()`, exported from `builder/templates/campaign-templates.ts`) already used by the initial Template Picker shown at campaign creation, so there's one source of truth for palettes instead of two. Renders as a row of simple solid-color circles (`.theme-palette-swatch`), matching the Template Picker's own `.tp-swatch` look exactly, per explicit user preference over an earlier, more elaborate multi-dot card design.

## 6. Campaign Card Video Thumbnail (`144a0bf`)

The campaigns list (`/campaigns`, grid and list views) only ever checked `coverImageUrl` for the card background. Video-hero campaigns have `coverImageUrl: null`, so their cards rendered blank/gray. Added `cardCoverUrl(c)` — falls back to the YouTube thumbnail (`https://img.youtube.com/vi/<id>/hqdefault.jpg`) extracted from `videoUrl`, same regex pattern already used in the builder (`getYoutubeThumbnail`, duplicated locally rather than extracted to a shared util, matching this codebase's existing pattern).

## 7. Mobile Device-Preview Scroll Blocked (`3b9ded2`)

Reported live by the user: viewing the campaign preview in the Studio's mobile-device simulator (the phone-frame toggle in the topbar, `s.device === 'mobile'`), scrolling inside the frame didn't work at all. Root cause: `.preview-inner--mobile` (`campaign-studio-page.component.css`) had `overflow: hidden` — added only to clip content at the phone frame's rounded corners (`border-radius: 24px`), but `overflow: hidden` disables scrolling on both axes, not just the clipping it was meant for. Fixed to `overflow-y: auto; overflow-x: hidden` — still clips horizontally at the rounded frame, restores vertical scroll. Verified via Playwright: with real overflow content (2480px inside an 877px frame), `scrollTop` now moves on assignment and `getComputedStyle(...).overflowY` reads `auto`; the rounded-corner clipping still renders correctly (confirmed via screenshot, no square corners bleeding past the phone-frame shape).

---

## Verification Done

Every change this session was verified with `npx ng build --configuration development` (catches template-level NG errors that `tsc --noEmit` alone misses) and `npx ng test --browsers=ChromeHeadless --watch=false` (40/40 passing throughout), plus targeted Playwright scripts against the real running dev server (`localhost:4200`) for anything UI-behavioral — screenshots and live DOM/state assertions, not just code reading. Several bugs (the cascade-delete orphan bug, the "מסגרת" label confusion, the missing CTA action field) were only found this way, not by inspection.

## Known Issue — Not Yet Fixed

`campaign-publish-step.component.ts`'s AI title/description suggestion adopt buttons ("אמץ בלי להציג ב-Hero") set the legacy `showHeroTitle`/`showHeroSubtitle` boolean fields. Since §2 above, actual Hero rendering is driven entirely by `layout.heroTitlePosition`/`heroSubtitlePosition` — the legacy booleans only matter as a one-time migration fallback (`?? (data.show_hero_title === false ? 'hidden' : 'hero')`) that's short-circuited whenever `layout.heroTitlePosition` is already set, which it always is for any campaign created after §2 shipped. **Net effect: "אמץ בלי להציג ב-Hero" currently does nothing.** Flagged to the user, not yet fixed — needs `adoptTitle`/`adoptShortDescription` to call `setHeroTitlePosition('hidden')` instead (or in addition).

---

## Relevant File Paths

| File | Purpose |
|------|---------|
| `src/app/modules/campaigns/services/campaign-studio-state.service.ts` | `CampaignDraft`/`CampaignLayout`/block-type model, all block CRUD (`addBlock`, `removeBlock`, `addBlockToContainer`, `patchTheme`, hero/description position setters) |
| `src/app/modules/campaigns/services/campaign-api.service.ts` | snake_case ⇄ camelCase mapping, incl. legacy `show_hero_title`/`show_hero_subtitle` fallback |
| `src/app/modules/campaigns/builder/steps/campaign-basic-step/` | Step 1 — title/subtitle/description fields + position pickers, Story field |
| `src/app/modules/campaigns/builder/steps/campaign-page-builder-step/` | Step 9 — full block tree editor, Tabs editor, CTA editor, theme colors |
| `src/app/modules/campaigns/builder/steps/campaign-publish-step/` | AI title/description suggestions (see Known Issue above) |
| `src/app/modules/campaigns/builder/steps/campaign-registration-step/` | New step — Registration Options (race/event participant options) |
| `src/app/modules/campaigns/builder/steps/campaign-offerings-step/` | Renamed from `campaign-rewards-step` — pure donation perks |
| `src/app/modules/campaigns/builder/presets/campaign-presets.ts` + `builder/preset-picker/` | "What kind of campaign?" step, ahead of the Template Picker |
| `src/app/modules/campaigns/builder/template-picker/` | Initial design picker — now also emits a base-color palette (`TemplateSelection`) |
| `src/app/modules/campaigns/builder/templates/campaign-templates.ts` | `TEMPLATE_PALETTES`, `buildTheme()` (now exported, reused by step 9's palette presets) |
| `src/app/modules/campaigns/studio/editor/campaign-editor/campaign-editor.component.ts` | Step navigation — now free/local-only, no backend save on transition (see §1) |
| `src/app/modules/campaigns/shared/components/campaign-stepper/` | Stepper UI — 10 steps, click any step to jump directly |
| `src/app/modules/campaigns/studio/preview/campaign-preview/` | Public-facing render: Hero tiers, Tabs, CTA, checkout modal wiring |
| `src/app/modules/campaigns/shared/components/checkout-modal/` | Combined registration + donation checkout |
| `src/app/modules/campaigns/services/donation.service.ts` | `DonationPayload.participants` — registration data on the donate/checkout call |
| `src/app/modules/campaigns/pages/registrations-page/` | New admin page — registrations across a campaign/entity |
| `src/app/modules/campaigns/pages/campaigns-page/` | Campaigns list — grid/list cards, video-thumbnail fallback |
