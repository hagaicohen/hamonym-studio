# Campaign Builder Studio — feature parity checklist

The Studio (`/campaigns/:id/studio`, `/campaigns/create/studio`) replaces the classic
builder (`/campaigns/:id/edit`, `/campaigns/create`) only when every applicable item
below is **Done** and tested in the Studio itself. Until then the classic builder
stays, unchanged. Nothing is removed to simplify the Studio.

Rules: reuse the existing state operations (`CampaignStudioStateService`), editors,
validators and step components; no duplicated business logic; donation, payment and
checkout behavior unchanged.

Status: **Done** (in the Studio, tested) · **Partial** · **Link** (reachable only
through a link to the classic builder) · **Missing**.
Location: **Tree**, **Canvas**, **Props** (properties panel), **Toolbar**, **Dialog**/**Menu**.

Audit date: 2026-11-04, branch `feat/campaign-builder-studio`.

## A. Shell, toolbar and navigation

| # | Capability (classic) | Source | Studio location | Status |
|---|---|---|---|---|
| A1 | Campaign title in header, exit | topbar | Toolbar | Done |
| A2 | Save draft (create on first save, update after), save states | topbar `saveDraft` | Toolbar | Done |
| A3 | Desktop / mobile preview | topbar, `StudioUiService` | Toolbar | Done |
| A4 | Full screen preview and back | topbar | Toolbar | Done |
| A5 | AI advisor ("קבל המלצות"), gated by entity AI flag | topbar | Toolbar | Done |
| A6 | Dashboard link, view live campaign | topbar | Toolbar | Done |
| A7 | Campaign status | — | Toolbar | Done |
| A8 | Step navigation, prev/next, `returnStep`, edit mode landing | editor, stepper, footer | Tree page areas | Done (all 10 steps reachable: פתיחה = 1, הגדרות הקמפיין = 2–8, blocks and design = 9, פרסום = 10; same gating) |
| A9 | Step gating: ongoing hides registration; minimal format gates 4–9; published locks slug | editor `disabledSteps`, basic step | Props (same rules) | Done (shared `wizard-steps.ts` for steps 2–8; step 10 always available, as in the wizard; tested on every combination) |
| A10 | Undo / redo | — (new) | Toolbar | Done (final sprint): StudioHistory — deep snapshots, 500ms settle, 50 steps, server fields kept, Ctrl+Z / Ctrl+Y outside fields |
| A11 | Warn before leaving with unsaved changes | — (new, not in classic) | Toolbar | Done (final sprint): route guard + beforeunload; baseline = last load or API save |
| A12 | New campaign: preset picker, template picker, skip | studio page | Dialog | Done |
| A13 | Minimal donation page format | minimal-details step, `MinimalDonationPageComponent` | Opening area / canvas | Done (final sprint): minimal-details step, MinimalDonationPage canvas, steps 2–3 + publish; created in the Studio |
| A14 | Partner and campaign-partner pages | partner builder pages | — | Out of scope for now (classic) |

## B. Templates and design (Step 9, Zone 3 "עיצוב הקמפיין")

| # | Capability | Source | Studio location | Status |
|---|---|---|---|---|
| B1 | Change template + palette (non-destructive) | `switchTemplate` | Toolbar → Dialog | Done |
| B2 | Campaign Style (12 styles) | `setCampaignStyle` | Props: Page design | Done (hosted Step 9 design area), area "עיצוב העמוד" |
| B3 | Opening composition + reset to style recommendation | `setOpeningComposition` | Props: Page design | Done (hosted Step 9 design area), area "עיצוב העמוד" |
| B4 | Colors: primary, secondary, accent, body text; per-field reset; reset all | `setStyleColorOverride`, `patchTheme`, `applyThemePalette` | Props: Page design | Done (hosted Step 9 design area), area "עיצוב העמוד" |
| B5 | Donation CTA color auto / custom | `setDonationCtaColor*` | Props: Page design | Done (hosted Step 9 design area), area "עיצוב העמוד" |
| B6 | Campaign logo upload/remove, entity logo fallback | `onCampaignLogoChange`, `removeCampaignLogo` | Props: Page design | Done (hosted Step 9 design area), area "לוגו" (tested) |
| B7 | Logo appearance: placement, strip align, shape, size, border, strip background | `setLogo*`, `LogoAppearanceEditor` | Props: Page design | Done (hosted Step 9 design area), area "לוגו", appearance panel open (tested: shape, size, border) |
| B8 | Title / subtitle / short description positions (above, hero, below, hidden) | layout fields | Props: Opening | Done (hosted Step 9 design area), area "עיצוב העמוד" (and step 1 in "פתיחה") |
| B9 | Hero text style and hero CTA | `onHeroTextStyleChange`, `onHeroCtaConfigChange` | Props: Opening | Done (hosted Step 9 design area), area "עיצוב העמוד" |
| B10 | Page background: none / color / image-GIF | `updateLayoutBg`, `onCampaignBgImageSelected` | Props: Page design | Done (hosted Step 9 design area), area "עיצוב העמוד" |
| B11 | Footer: background, text color, contact column (email, phone, hours), show/hide | layout footer fields | Props: Footer area | Done (hosted Step 9 design area), area "פוטר" (tested) |
| B12 | Section collapse state of the design panels | `toggleSection` | Props | Done (hosted Step 9 design area), area "עיצוב העמוד" |

## C. Block management (Step 9 Zones 1–2)

| # | Capability | Source | Studio location | Status |
|---|---|---|---|---|
| C1 | Hierarchical list: containers, tabs, panels, nesting | `containerChildren`, `scopeBlocksFor` | Tree | Done |
| C2 | Select block / open its editor | `toggleEdit`, `requestFocusBlock` | Tree, Canvas | Done |
| C3 | Hover sync builder ↔ preview | `setHoveredBlock` | Tree, Canvas | Done |
| C4 | Move up / down within scope | `moveBlockUpInScope` / `DownInScope` | Tree | Done |
| C5 | Show / hide block | `toggleBlockVisibility` | Tree, Props | Done |
| C6 | Delete block | `removeBlock` | Tree menu, Props | Done (tree menu, right-click, properties; confirmation with nested count) |
| C7 | Add block from catalog (groups, single-instance rule, owner filter) | `addBlock`, `BLOCK_GROUPS`, `isSectionAvailableFor` | Tree footer | Done (top level) |
| C8 | Add block inside a container ("+ הוסף לכאן") | `addBlockToContainer` | Tree menu | Done (tree menu / properties; same catalog, no Hero) |
| C9 | Add tab / add panel | `addTab`, `addPanel` | Tree menu | Done (`addTab` / `addPanel` moved to the state; Step 9 delegates) |
| C10 | Convert tabs ↔ panels | `convertTabsAccordionType` | Props / Tree menu | Done (tree menu / properties and inside the hosted editor) |
| C11 | Swap container children (right ↔ left) | `swapContainerChildren` | Tree menu | Done (`swapContainerChildren` moved to the state; same row-header condition) |
| C12 | Drag existing block to reorder / re-parent (builder list) | `onBlockDragStart`, `moveBlockTo` | Tree | Done (tree drag: before / after / into; `moveBlockTo`) |
| C13 | Drag new block from catalog to page | `onPickerDragStart`, `insertBlockAt` | Tree, Canvas | Done (catalog item dragged into the tree, `insertBlockAt`; or onto the canvas) |
| C14 | Drag and drop inside the preview (existing and new blocks, empty-container drop hint) | preview `onPreviewDrop` | Canvas | Partial (tree/catalog drag reaches the renderer and its drop handler is tested; pointer hit-testing on the real canvas needs a manual check) |
| C15 | Import review badge, "סמן כנבדק" | `clearImportReview` | Tree | Done (tree badge; "סימון כנבדק" via `clearImportReview`, moved to the state) |
| C16 | Block label / heading (shown on page for text, video, gallery) | `updateBlockLabel` | Props | Done |
| C17 | Block spacing top / bottom | `updateBlockSpacing` | Props | Done |
| C18 | Duplicate block | — not in classic | Tree menu | Done (final sprint): new ids for the block and everything nested, placed right after it; single-instance types excluded |

## D. Block editors (Step 9 per-type)

| # | Block type | Classic controls | Status |
|---|---|---|---|
| D1 | rich-text | content (rich editor), line height, heading style | Done (hosted; shared editor) |
| D2 | image | upload/replace/remove, caption, width, align, height/reset | Done (hosted; shared editor) |
| D3 | hero | positional note; move like any block | Done (hosted note; content via opening area) |
| D4 | video | video URL | Done (hosted Step 9 editor) |
| D5 | gallery | upload many, captions, reorder, remove, style, aspect ratio | Done (hosted Step 9 editor) |
| D6 | cta | action (donate / race registration / link), URL, title, description, background, button design, text roles, block height | Done (hosted Step 9 editor) |
| D7 | container | name, open-by-default, icon, rail zone (normal / sidebar / main column), direction, background, border, divider between children, background image, split %, outer spacing | Done (hosted Step 9 editor; name via Studio field) |
| D8 | tabs | style (underline / pills / boxed), accent, mobile behavior, title/tab colors, content border style/color, convert | Done (hosted Step 9 editor) |
| D9 | accordion | style, accent, mobile behavior, convert | Done (hosted Step 9 editor) |
| D10 | stats | style, size, conversion layout (classic / unified / compact / hero card / split), icon color auto/custom, background, border, text roles, progress ring, item order and visibility, contrast warning | Done (hosted Step 9 editor) |
| D11 | donation-widget | title, subtitle, button text/color/icon, payment logos, amount buttons style/preset, style and text roles | Done (hosted Step 9 editor; display settings only, donation logic unchanged) |
| D12 | rewards | placement (full width / sidebar), image position/size, advanced colors, section presentation | Done (hosted Step 9 editor) |
| D13 | ambassadors | placement, presentation, style/text roles | Done (hosted Step 9 editor) |
| D14 | donors | placement, presentation, text roles, fields | Done (hosted Step 9 editor) |
| D15 | updates | placement, view mode (slider/list), presentation | Done (hosted Step 9 editor) |
| D16 | sponsors, comments | view config (data edited in their steps) | Done (hosted Step 9 editor) |
| D17 | divider | show line, line color, height | Done (hosted Step 9 editor) |
| D18 | share | platforms (copy link, email, X, …) | Done (hosted Step 9 editor) |
| D19 | split | split fields | Done (hosted Step 9 editor; legacy type, tested: tree, editor, move, delete) |
| D20 | coupons, map, opening hours | partner-only | Out of scope until partner Studio |

## E. Campaign fields and data sections (other steps)

| # | Step | Capabilities | Studio location | Status |
|---|---|---|---|---|
| E1 | 1 פרטי בסיס | cover image/video, title, subtitle, short description and positions, story, category, location, manager name, slug + availability check, hero title/subtitle display | Props: Opening | Done (step reused as-is) |
| E2 | 2 סוג ויעד | lifecycle one-time/ongoing, race conflict dialog, funding model, target, start/end dates and validation | Props: Campaign settings | Done (area "סוג, יעד ותאריכים", step 2 hosted as-is; tested against the wizard) |
| E3 | 3 תרומות | suggested amounts, free amount, monthly donation and amounts, installments mode/count, donor fields | Props: Donation settings (host step as-is; financial-adjacent, no logic change) | Done (area "הגדרות תרומה", step 3 hosted as-is, untouched; published → Workspace link; tested against the wizard) |
| E4 | 4 תשורות | list, add/edit/remove, quantity, supplier, image, recommended | Props / Dialog | Done (area "רשימת התשורות", step 4 hosted as-is; partner linking stays in the Studio; tested against the wizard) |
| E5 | 5 הרשמה (race only, hidden for ongoing) | options: title, price, description, code; duplicate/edit/delete | Props / Dialog | Done (area "אפשרויות הרשמה", hidden for ongoing as in the wizard; tested against the wizard) |
| E6 | 6 חסויות | placement, logo, name, link, add/edit/delete | Props / Dialog | Done (area "רשימת החסויות"; tested against the wizard) |
| E7 | 7 שגרירים | add/edit, slug validation, personal target/message, import | Props / Dialog | Done (area "רשימת השגרירים"; tested against the wizard) |
| E8 | 8 עדכונים | media, title, date, description, link, add/edit/delete | Props / Dialog | Done (area "רשימת העדכונים"; tested against the wizard) |
| E9 | 10 סיכום ופרסום | summary, AI title/description suggestions (adopt / reject / regenerate), checklist, publish and its validations | Toolbar → Dialog | Done ("פרסום" in the toolbar opens step 10 as-is in a dialog; read-only readiness indicator; tested against the wizard) |

## F. Canvas

| # | Capability | Source | Studio location | Status |
|---|---|---|---|---|
| F1 | Real renderer | `CampaignPreviewComponent` | Canvas | Done |
| F2 | Click block to select; selection outline; scroll to selected | preview `onBlockClick` | Canvas | Done |
| F3 | Preview-only placeholders for empty campaigns (never saved) | `studio-placeholders.ts` | Canvas | Done |
| F4 | Click hero / navigation / footer to select its page area | — | Canvas | Done (final sprint): Hero → opening, navigation → page design, footer → footer; outlined when selected. A Hero rendered by a Hero block keeps the block click |
| F5 | Drag and drop on the canvas | preview `onPreviewDrop` | Canvas | Partial (see C14) |

## Group D verification (2026-11-04)

The Studio properties panel renders Step 9's own editor body for the selected
block only (`CampaignPageBuilderStepComponent` with `studioBlockId`; the body is the
shared `#blockEditorBody` template that Step 9 also renders inline). No editor logic
was copied. In single-block mode Step 9 does not toggle page-builder mode, does not
handle focus requests and does not run the sidebar migration (see Group C
verification: the Studio does not run it either).

Tests (`campaign-builder-studio-page.component.spec.ts`):
- all 19 campaign block types from the catalog (rich-text, image, video, gallery,
  container, hero, tabs, accordion, donation-widget, cta, rewards, share, stats,
  donors, sponsors, ambassadors, updates, comments, divider): selectable, exactly one
  editor shown, controls rendered, selected in the tree;
- write-through via the hosted editor: label, spacing, video URL, divider line,
  container design section, rich text and image (shared editors);
- switching blocks and areas keeps canvas selection mode on; canvas click still selects;
- classic Step 9 still renders the full builder, opens editors inline and toggles
  page-builder mode on/off.

Not part of the editor body (tracked in Group C): a container's children list and
"+ הוסף לכאן", "+ הוסף טאב" / "+ הוסף פאנל", the right/left swap button. The
container name is edited by the Studio's own field (same `updateBlockLabel`).

## Group C verification (2026-11-05)

Block actions come from one list (`blockActions`) shown in the tree context menu
(⋯ button, right-click, Shift+F10) and in the properties panel, with the same
conditions as the classic block row. Step 9's `addTab`, `addPanel`,
`swapContainerChildren` and `clearImportReview` logic moved into
`CampaignStudioStateService`; Step 9 now delegates, so both editors share it.
Delete (`removeBlock`, which also removes nested blocks and cleans the parent's
`childBlockIds`) asks for confirmation in the Studio; classic Step 9 never did and
is unchanged.

Tree drag and drop uses `moveBlockTo` (existing blocks) and `insertBlockAt`
(catalog items). Drop rules on top of `moveBlockTo`'s self/descendant guard:
tabs and panels hold only containers; Hero never goes into a container (as the
classic "add inside" catalog). Dragging also publishes the block / type to the
state, so the existing canvas drop works from the tree and the catalog.

Legacy sidebar conversion: the Studio no longer runs `migrateSidebarToContainers`
on load, so opening the Studio never changes a campaign (tested: blocks and layout
identical after load and selection; no save call). The renderer shows legacy sidebar
layouts as they are. Classic Step 9 still converts on entry (tested), and the
conversion is idempotent (tested: a second run changes nothing).

## Group B verification (2026-11-05)

Step 9's design area ("עיצוב הקמפיין", Zone 3) moved into the shared
`#designBody` template; classic Step 9 renders it inside its zone as before
(tested). The Studio hosts it with `studioDesign` in three page areas: "עיצוב
העמוד" (style section open), "לוגו" (logo section and its appearance panel open)
and "פוטר" (footer section open). All sections stay available in each area. Same
lifecycle guards as the single-block mode.

## Totals (2026-11-05, after the final sprint)

78 items: Done 74 · Partial 2 (C14/F5: canvas drag and drop works through the renderer's own drop handler, RTL rule `before = clientX > midX` unchanged; real pointer hit-testing needs a manual check) · Out of scope for now 2.

---

# BUSINESS LOGIC PARITY

Audit 2026-11-05 of the classic wizard's business logic (all 10 steps, the editor
shell, save/publish paths and the backend contract). The Studio must keep every
rule below. "Enforced" = what actually blocks; "displayed" = a hint or inline
error that does not block anything.

## G. Editor shell (`campaign-editor.component.ts`)

| # | Rule | Kind |
|---|---|---|
| G1 | Free navigation between steps; no step validates on "next" or on step change | Behavior |
| G2 | Ongoing campaign (`campaignLifecycle = 'ongoing'`): step 5 (registration) is skipped | Gating |
| G3 | Minimal page (`layout.pageFormat = 'minimal'`): steps 4–9 are skipped; step 1 is the minimal-details step instead of basic details | Gating |
| G4 | Published campaign (`status !== 'draft'`): steps 3–8 (donation settings, rewards, registration, sponsors, ambassadors, updates) are skipped — they are edited in the Workspace pages, which save immediately | Gating |
| G5 | `returnStep` opens a step; a gated step falls forward to the nearest enabled step | Behavior |
| G6 | New campaign: preset picker (general / donation / race, or minimal), then template picker (or skip) | Flow |

## H. Fields, defaults and in-step validation

| # | Step | Rule | Kind |
|---|---|---|---|
| H1 | 1 | Mounting step 1 fills `managerName` from the organization when empty | Side effect |
| H2 | 1 | Hero type image ⇄ video clears the other (`videoUrl` / `coverImageUrl`); choosing image without a cover opens the file picker | Side effect |
| H3 | 1 | "סיפור הקמפיין" reads/writes the first top-level rich-text block (not inside container/tabs) | Cross-step (step 9 blocks) |
| H4 | 1 | Category: from the canonical list only; search limited to 20 characters | Enforced (UI); server validates id |
| H5 | 1 | Location: canned labels for nationwide / online / international; region stores `city` = label | Derived |
| H6 | 1 | Slug: lower-case, only `a-z 0-9 א-ת -`; availability checked after 800 ms when ≥ 3 characters, excluding the campaign itself | Displayed |
| H7 | 1 | Slug locked once `publishedAt` is set | Enforced (UI + server) |
| H8 | 2 | Ongoing ⇒ `fundingType = 'recurring'`; back to one-time from recurring ⇒ `flexible` | Derived |
| H9 | 2 | Race preset conflicts with ongoing: dialog to keep one-time or drop race (`preset = 'general'`); one-time after ongoing asks whether to make it a race | Flow |
| H10 | 2 | Funding model and dates hidden for ongoing | Conditional visibility |
| H11 | 2 | Target required, end ≥ start, campaign-day count, donors-needed estimate | Displayed (enforced only at publish) |
| H12 | 3 | Suggested and monthly amounts: max 6, minimum value 1, new = last × 2 (defaults 100 / 50) | Enforced (UI) |
| H13 | 3 | Installments count ≥ 1; billing mode until-cancelled / fixed; donor required fields fixed | Enforced (UI) |
| H14 | 4 | Reward needs a title; minimum amount default 250; stock optional; duplicate/edit/delete; image upload | Enforced (UI) |
| H15 | 4 | Linking a business partner to a reward on an unsaved campaign creates the campaign first and navigates to `/campaigns/:id/edit` | Side effect (route) |
| H16 | 5 | Registration option needs a title and price > 0; duplicate/edit/delete | Enforced (UI) |
| H17 | 6 | Sponsor needs a name; logo/link optional | Enforced (UI) |
| H18 | 7 | Ambassador needs a name and a valid, unique slug (auto-suggested from the name); personal goal above the campaign goal warns; delete confirms; CSV/Excel import keeps rows with a name | Enforced (UI) / displayed |
| H19 | 6, 7, 8 | Show/hide toggles flip the `visible` flag of the page block of that section (same flag as step 9) | Cross-step (step 9 blocks) |
| H20 | 8 | Update needs a title; date defaults to today; media type from the uploaded file | Enforced (UI) |
| H21 | 10 | AI title/description suggestions only when saved, AI enabled and title or description empty; adopting can hide the field on the Hero | Behavior |

## I. Save vs. publish (not the same rules)

| # | Action | Rules | Where |
|---|---|---|---|
| I1 | **Save draft** (topbar, any step) | No client validation. First save `POST /campaigns` (then the URL becomes `/campaigns/:id/edit`), later `PATCH /campaigns/:id` with the whole draft | Client |
| I2 | Save — create | Organization required, caller owns it, organization not in `draft` registration (409); defaults: title "", slug `draft-…` placeholder, `status = 'draft'` | Server |
| I3 | Save — update | Caller owns the campaign, campaign not locked, slug unchanged after publish, valid category id, unique slug; ambassadors and registration options are synced to their own tables on every save | Server |
| I4 | Save of a published campaign | The payload always carries `status`; `status = 'published'` re-runs the publish checks (I6), so saving a published campaign with a missing required field fails | Server |
| I5 | **Publish** (step 10) | Client blocks unless: title, slug, cover image or video (not for minimal), target > 0, valid dates for one-time; and the organization is `active`. Then save + `PATCH status = 'published'` | Client |
| I6 | Publish | Same blockers server-side (`getPublishBlockers`) and organization `active`; `published_at` set once | Server |
| I7 | **Confirm and continue** (step 10, organization not yet approved) | Saves; when the campaign is ready, records `publish_requested_at` (`POST /request-publish`), then opens the campaign dashboard | Client + server |
| I8 | Organization approval | Publishes every requested campaign that passes the blockers; others stay draft | Server |

## J. Studio parity risks (identified)

| # | Risk | Mitigation in the Studio plan |
|---|---|---|
| J1 | Gating rules G2–G4 must hold: published campaigns must not edit steps 3–8 in place | Show those areas only when the wizard would; for published campaigns link to the Workspace pages, as the wizard does |
| J2 | Step components that navigate: reward-partner link (H15) goes to `/campaigns/:id/edit`; publish goes to the dashboard / campaign list | Reward-partner link resolved (K1, increment 2); step 10 keeps its own navigation (increment 3) |
| J3 | Step-local unsaved forms (reward, registration, sponsor, ambassador, update) are lost when leaving the step | Same as the wizard; switching areas in the Studio destroys them the same way |
| J4 | Side effects on mount (H1, step 10 AI suggestion) run each time the area is opened | Same as revisiting a step; idempotent |
| J5 | Cross-step flags (H3, H19) | Same state fields; no copy |
| J6 | Publish rules exist in two places (client + server) | Studio reuses step 10 as-is; no new publish path (verified, increment 3) |
| J7 | Minimal pages stay on the classic editor | Unchanged |

## Group E — increment 1 verification (2026-11-05)

- **Shared step rules.** `disabledWizardSteps` moved verbatim from the wizard into
  `builder/wizard-steps.ts`; the wizard now reads it from there. Tested on all 8
  combinations (one-time/ongoing × full/minimal × draft/published) against the
  previous wizard rules, including through the classic editor itself.
  `wizardStepAccess` adds the Studio's reading of the same rules: edit / Workspace
  (published, steps 3–8) / hidden (ongoing registration, minimal steps 4–9).
- **Steps 2–3.** Group "הגדרות הקמפיין" in the tree: "סוג, יעד ותאריכים" hosts
  `CampaignTypeStepComponent`, "הגדרות תרומה" hosts `CampaignDonationStepComponent`,
  both unchanged. On a published campaign step 2 stays editable (as in the wizard)
  and step 3 links to `/campaigns/:id/donation` (the Workspace page, which saves
  immediately); the area is not an editable form there.
- **Wizard vs. Studio comparison.** The same action sequences run on the wizard's
  step component and on the instance hosted in the Studio, from identical drafts;
  the resulting drafts and the real `CampaignApiService.update` request bodies are
  equal. Step 2: lifecycle changes with the race question, race-vs-ongoing conflict
  (drop race / keep one-time), target, funding model. Step 3: amount limit of 6,
  minimum value 1, add/edit/remove, monthly giving and amounts, installments.
- **Save.** An incomplete draft (no title, no target, end before start) still saves;
  no save-time validation added.

## Group E — increment 2 verification (2026-11-05)

- **Steps 4–8 hosted as-is**: rewards, registration, sponsors, ambassadors and updates
  (areas named "רשימת …" so they do not read like the page blocks of the same
  sections). Visibility from `wizardStepAccess`: registration is not offered for an
  ongoing campaign; for a published campaign each area links to its Workspace page
  (`rewards`, `registration`, `sponsors`, `ambassadors`, `dashboard#updates`)
  instead of an editable form. Tested for draft, ongoing and published.
- **Partner linking on an unsaved campaign (H15, K1).** Step 4 gained an optional
  `afterCreate` input. The wizard does not pass it and keeps navigating to
  `/campaigns/:id/edit` (tested). The Studio passes a handler that only replaces the
  address with `/campaigns/:id/studio` (`Location.replaceState`), so the page, the
  draft, the selected area and the link dialog stay. Tested: one create even when the
  action is triggered again while it is in flight and once more afterwards; the id is
  in the draft and the next topbar save is an update; no router navigation.
- **Wizard vs. Studio comparison**, same clock and random sequence for both runs so
  generated ids match: rewards (invalid form, add, edit, duplicate, delete), registration
  (invalid, add, edit, duplicate, delete, with the save delay), sponsors (add, edit,
  delete, hide the page section), ambassadors (slug rules, duplicate slug, goal above the
  campaign goal, edit, import with an invalid row, confirmed delete, hide the page
  section), updates (add, edit, delete, hide the page section). Resulting drafts and
  real `CampaignApiService.update` bodies are equal; the body carries
  `registration_options`, `ambassadors`, `rewards`, `sponsors`, `updates`, `blocks`,
  from which the server syncs the related tables on every save.
- **Half-filled forms** are dropped when leaving the area, as when leaving the wizard step.

## Group E — increment 3 verification (2026-11-05)

- **Publish action.** "פרסום" in the Studio toolbar (separate from "שמור טיוטה")
  opens `CampaignPublishStepComponent` unchanged in a dialog: summary, AI suggestions,
  publish, "confirm and continue" (publish request), its error messages and its
  navigation (campaign list after publishing, campaign dashboard after confirming).
- **Readiness indicator.** Step 10's checks moved verbatim into
  `campaign-publish-step/publish-readiness.ts` (`publishMissingFields`,
  `publishHasHero`, `publishEntityApproved`); step 10 now calls them, and the
  indicator reads the same functions — no second copy. Tested equal to the previous
  step 10 logic on 11 cases (title, slug, image/video hero, minimal page, target, date
  range, ongoing). States: missing (with the list), ready but organization awaiting
  approval, ready. Read-only: it never blocks saving (tested: an incomplete draft
  saves, nothing is published); clicking it opens the publish dialog.
- **Wizard vs. Studio comparison** (step 10 on its own vs. hosted in the dialog, same
  draft and organization status), comparing the server calls with their arguments,
  router navigation, error message, resulting status and id: publish when ready and
  approved; publish of an unsaved campaign (create, then publish the new id); missing
  fields; organization awaiting approval; publish rejected by the server; confirm and
  continue when ready and awaiting approval (save + publish request + dashboard), when
  not ready (save only), when approved (save only), and when the save fails. All equal.
  The server checks (`getPublishBlockers`, organization `active`) are unchanged.

## K. Decisions requested (2026-11-05)

| # | Question | Recommendation |
|---|---|---|
| K1 | Hosted steps that navigate to the classic editor (reward-partner link on an unsaved campaign, H15) | Continue in the Studio (`/campaigns/:id/studio`), through an input like the topbar's `editorPath`; the save itself unchanged |
| K2 | Where publishing lives in the Studio | A "פרסום" toolbar action that opens step 10 as-is (summary, AI suggestions, publish, confirm-and-continue); no second publish path |
| K3 | Published campaigns and steps 3–8 | Keep the wizard rule: those areas link to the existing Workspace pages instead of editing in place |
| K4 | Publish readiness in the Studio | Optional read-only indicator in the toolbar using step 10's own `missingFields` / organization status; changes no rule |

## L. Group E plan (reuse, no rule changes)

1. **Gating as one shared function.** Move `disabledSteps` (G2–G4) out of the
   wizard into a pure function used by the wizard and the Studio; a test runs the
   full matrix (one-time/ongoing × full/minimal × draft/published) and expects the
   wizard's current result.
2. **Campaign settings and donations.** Page areas "הגדרות קמפיין" (step 2) and
   "תרומות" (step 3), hosting the step components as-is; step 3 untouched
   (financial-adjacent). Hidden/linked exactly per the gating function.
3. **Data sections.** Areas for rewards (4), registration (5, not for ongoing),
   sponsors (6), ambassadors (7) and updates (8), hosted as-is; the section's page
   block stays the same object as in step 9. K1 applied to step 4.
4. **Publishing.** K2: step 10 hosted in a dialog from the toolbar.
5. **Comparison tests.** For identical campaign inputs, drive the classic step
   components and the Studio-hosted ones and compare the resulting draft and the
   API payload (`campaignApi` create/update/publish/request-publish calls,
   `toSnake`), plus the gating matrix and the publish blockers.
6. Update this checklist (group E rows) with verified results.
