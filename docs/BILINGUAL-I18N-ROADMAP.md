# HAMONYM — Bilingual Interface (Hebrew / English) and RTL/LTR Roadmap

| | |
|---|---|
| Status | **Architecture APPROVED with adjustments (2026-11-07). No implementation has started; Phase 0 starts on explicit instruction.** |
| Created | 2026-11-07 |
| Owner of decisions | Product owner (Hagai). Claude executes approved phases only. |
| Living document | Every implementation session updates §12 (Status), §13 (Decision log) and §14 (Progress log) in this same file. |

Evidence tags used throughout:

- **[C] Confirmed**: checked in the code on 2026-11-07. A file path or a rerunnable command is given.
- **[D] Documented-only**: stated by a vendor's documentation, not exercised against our system.
- **[A] Assumption**: believed true, must be verified at the phase that depends on it.
- **Open**: a decision still pending in §13; the dependent phase may not start until it is decided.

---

## 0. How a future session uses this document

1. Read §12 (Status table) to find the next phase. Read its section in §6 completely.
2. Read the decisions in §13 that the phase depends on. If one is still **Open**, stop and ask; do not pick a default. Check the phase's **Entry** criteria in §6.
3. Rerun the audit commands in §1.9 to refresh the numbers (the codebase moves).
4. Before starting work, run the Hebrew baseline (§8.4). Hebrew must look and behave exactly the same after the phase, including payment processing (D-14).
5. After the phase: tick its acceptance items, update §12, append to §14, and record any new decisions in §13.

Working-tree caveats that were true when this document was written **[C]**:

- The frontend has **uncommitted multi-currency work** in `checkout-v2`, `campaign-preview`, `donation-success`, `donations-page`, `donation-toast` and `campaign-donation-step`. It does **not** block Phases 0–5 (D-13). Overlapping files are coordinated only when Phase 5 (`donations-page`), 6 and 7 begin, and the two efforts are never mixed in one commit.
- Local `main` contains unpushed FIN-11 / Collection Ops commits. Publish i18n work only through the clean-worktree + cherry-pick procedure, never with a plain push.
- `hamonym-app/hamonym-backend/` is a stale copy. Backend work goes to `C:\DEV\HamonymStudio\hamonym-backend\` only.
- Migration **087** is reserved for multi-currency, prepared but not applied. Any i18n migration uses the next free number at implementation time (088 or higher).

---

## 1. Current State Audit

### 1.1 Stack facts relevant to i18n [C]

| Fact | Evidence |
|---|---|
| Angular **18**, standalone components (168 files with `standalone: true`), esbuild `application` builder | `package.json`, `angular.json` |
| **No localization library** of any kind (no `@angular/localize`, Transloco or ngx-translate) | `package.json`; `grep -rn "transloco\|ngx-translate\|\$localize" src` → nothing |
| **No `LOCALE_ID`** provided and **no `registerLocaleData`**, so Angular pipes (`| number`, `| date`) run as `en-US` | `grep -rn "LOCALE_ID\|registerLocaleData" src` → nothing |
| **No Angular Material and no `@angular/cdk`.** All overlays, dialogs, menus and drag-and-drop are hand-written | `package.json` |
| Rich text: **TipTap 3** (`TextAlign` configured, no default alignment) | `shared/ui/rich-text-editor/rich-text-editor.component.ts:103` |
| Charts: **Chart.js 4**, axis position hard-coded to `'right'` (RTL assumption) | `modules/dashboard/pages/dashboard/dashboard.component.ts:230`, `modules/reports/shared/report-chart/report-chart.component.ts:92-93` |
| Tooltips: `tippy.js` (positions itself and is direction-neutral by default) [A] | `package.json` |
| `index.html` is hard-coded to `<html lang="he" dir="rtl">` and `<title>המונים</title>`. Nothing ever changes `documentElement.lang/dir` | `src/index.html`; grep for `documentElement` → nothing |
| `styles.scss` sets `html, body { direction: rtl; }` globally | `src/styles.scss:21` |
| Fonts: Heebo, Frank Ruhl Libre, Varela Round and Assistant, all with Latin subsets | `src/index.html` |
| `tsconfig.json` has **no `resolveJsonModule`** | `tsconfig.json` |
| Tests: Karma + Jasmine, 82 spec files, several per-feature `tsconfig.*.spec.json` | repo root |
| **No CI at all**: no `.github/` in either repo; backend `npm test` is a placeholder | `ls -a`, `hamonym-backend/package.json` |
| Existing static rule scanner pattern: `scripts/test-no-ui-emoji.cjs` (scans `src/app`, ignores comments, `ALLOWED` list with reasons). **It forbids regional-indicator flag emoji** (`U+1F1E6–U+1F1FF`) | `scripts/test-no-ui-emoji.cjs` |
| Existing browser verification pattern: raw Chrome DevTools Protocol via `ws`, no Playwright dependency | `scripts/verify-dashboard-responsive.cjs` |

### 1.2 Hard-coded Hebrew strings [C]

Measured with the scripts in §1.9 (comments excluded, `.spec.ts` excluded):

| Measure | Value |
|---|---|
| Hebrew string **occurrences** in `src/app` (`.html` text nodes + attributes, `.ts` literals) | **≈ 5,390** |
| **Unique** Hebrew strings | **≈ 3,415** |
| Non-comment Hebrew lines: `.html` / `.ts` / `.css` | 3,797 / 1,588 / 37 (the CSS ones are `content:` strings) |
| Hebrew in `placeholder` / `aria-label` / `title` / `alt` attributes | ≈ 388 |
| `window.confirm()` / `alert()` with Hebrew text | 19 |
| Hebrew lines inside spec files (assertions on rendered Hebrew) | ≈ 1,077 lines in 66 specs |

By area (occurrences):

| Area | Occurrences | Notes |
|---|---|---|
| `modules/campaigns` | ≈ 2,455 | Studio, builder steps, public preview, checkout, workspace pages |
| `modules/platform` (Super Admin) | ≈ 1,457 | 14 pages; billing-ops and collection-ops alone ≈ 510 lines |
| `modules/settings` | ≈ 296 | |
| `shared` (ui editors, config, utils) | ≈ 268 | |
| `modules/organization-registration` | ≈ 249 | 6 steps, includes CardCom card capture |
| `modules/reports` | ≈ 121 | |
| `core` (topbar, sidebar, bell, toasts, idle modal, services) | ≈ 93 | |
| dashboard, registrations, ambassadors, auth, donations, donors, onboarding, billing | 19–81 each | |

The largest single files: `campaign-page-builder-step.component.html` (330 lines), `campaign-preview.component.html` (259), `platform-billing-ops-page.component.html` (176) / `.ts` (120), `platform-collection-ops-page` (140 / 77), `campaign-templates.ts` (102, mostly **content**, see §4).

Kinds of string that need different migration treatment **[C]**:

1. **Template text and attributes**: the bulk.
2. **TS label maps keyed by enum**: `JOB_LABELS` / `JOB_FREQUENCY_LABELS` (`modules/platform/utils/ops-labels.ts`), status maps in 13 files (`campaigns-page`, `recurring.service`, `campaign-dashboard-status`, `platform-*-page`, `shared/utils/organization-next-action.ts` …), `entity-categories.ts` (`{ id, label }`), `block-catalog.ts` (`BLOCK_GROUPS` labels), `TEMPLATE_PALETTES` names, date-range presets (`date-range-picker.component.ts:7-14`). These are evaluated **once at module load**, so they will not react to a language switch unless they become keys.
3. **Strings built in TS at runtime**: `Title.setTitle(...)` in `campaign-public-page`, `donation-success` and `receipt-view`; success messages; `confirm()` prompts; CSV file names and headers (`ambassadors-page.component.ts:241-247`, `ambassador.service.ts:266-270`, `donations-page`).
4. **Copy that names a physical side** (9 places), for example `campaign-preview.component.html:59` "הוסיפו בלוק ראשון מהעריכה שמימין" ("…from the editor on the right"), and the stats-order arrows in `campaign-page-builder-step.component.html:1082-1088`. In LTR the panel is on the other side, so this copy must be rewritten, not only translated.
5. **Campaign content defaults** (template seed text, preset copy, AI-agent prompts producing Hebrew content). This is **content**, not interface (§4).

### 1.3 RTL assumptions [C]

**Global**

- `index.html` `lang="he" dir="rtl"`, and `styles.scss` `html, body { direction: rtl }`.
- `select` chevron: `background-position: left 14px center` (`styles.scss`).

**Component-level `direction` declarations**

- `direction: rtl` appears **211 times** across component CSS. Top files: `campaign-preview.sections.css` (12), `donations-page` (6), and 5 each in `registrations-page`, `platform-users-page`, `platform-organization-detail-page`, `donors-page`, `ambassadors-page`, `campaign-preview.hero/.donation/.rewards.css`. In LTR mode each of these **forces RTL back on**, so they must be removed or replaced by inheritance.
- `dir="rtl"` appears in 16 templates, as hard-coded roots: `topbar.component.html:1`, `campaign-builder-studio-page.component.html:14`, `donation-success`, `receipt-view`, `payment-failed-popup`, every `platform-*` page root, and `campaign-public-page.component.html:31`.
- `dir="ltr"` appears in 46 templates, and `direction: ltr` in about 20 CSS rules, for emails, phones, URLs/slugs, colour values, card fields and range inputs. **These are correct data islands and must stay.**

**Logic (TypeScript) that assumes RTL**

| Location | Assumption |
|---|---|
| `campaign-preview.component.ts:1155-1162` (`resolveDropTarget`) | "RTL: index 0 of a row-direction container renders RIGHTMOST", so `before = clientX > midX` |
| `campaign-builder-studio-page.component.ts:550-554` (`onResizeMove`) | "RTL: the tree grows when the pointer moves left", so the delta sign is flipped per panel |
| `campaign-builder-studio-page.component.ts:348-352` (floating toolbar) | Positioned with `bar.style.right = frame.right - rect.right` |
| `campaign-builder-studio-page.component.ts:656-658, 737` (context menus) | Anchored at `rect.left` / `clientX`, with no edge-flip logic for LTR |
| Chart.js configs | `position: 'right'` for the value axis |
| Directional icons | `ArrowRight` ×18, `ArrowLeft` ×6, `ChevronLeft` ×16, `ChevronRight` ×7 used as "back"/"next"; meaning flips in LTR |
| Hebrew collation | `localeCompare(..., 'he')` and `Intl.Collator('he-IL')`, 6 places |

### 1.4 CSS using physical properties [C]

Measured by `scripts/css-audit` (§1.9): 175 stylesheet files, **108 contain physical declarations**.

| Kind | Count |
|---|---|
| `left:` / `right:` (inset) | 136 |
| `text-align: left/right` | 144 (of which `right` ≈ 114) |
| `margin-left/right`, `padding-left/right` | 84 |
| `border-left/right*` | 28 |
| `translateX(...)` (drawers, slides, centring) | 36 |
| `background-position … left/right` | 4 |
| `float: left/right` | 1 |
| 4-value `margin` / `padding` shorthands (asymmetric ones are direction-sensitive) | 353, to review |
| **Already logical** (`*-inline-*`, `inset-inline`, `text-align: start/end`) | 105 |

Highest concentration: `campaign-ambassadors-step` (17), `checkout-modal` (16), `campaign-preview.hero.css` (14), `campaign-preview.page-end.css` (14), `campaign-basic-step` (13), `campaigns-page` (12), `checkout-v2` (12), `donors-page` (11).

Shell layout:

- `sidebar.component.css:7` `border-left`; `:97-108` mobile drawer `right: 0; transform: translateX(100%)`.
- `app-layout.component.css:24-27, 73-77` fixed layers.
- `topbar.component.css`: `.topbar-right` / `.topbar-left` class names, `padding-right`, `text-align: right`, a fixed mobile menu with `left/right: 8px`.

Inline style bindings with physical sides: 7 files (`[style.left]` / `[style.right]` / `style.right`), in Studio, campaign-preview, campaign-public-page, color-picker, platform-users and platform-organizations.

There are 77 `position: fixed` rules (toasts, drawers, modals, FABs), each anchored to a physical corner.

### 1.5 Angular Material, overlays, dialogs and drag-and-drop [C]

- **No Material/CDK.** There is no `Directionality` service to lean on; every overlay computes its own position.
- Dialogs: 7 templates use `<dialog>` or `role="dialog"`. Others are custom fixed overlays (`checkout-modal`, `checkout-v2`, `payment-failed-popup`, `idle-warning-modal`, `partner-link-modal`, donor drawer in `platform-dashboard-page`).
- Drag-and-drop is **custom, native HTML5 + pointer events**, in 4 files: `campaign-builder-studio-page` (.ts/.html), `campaign-preview` (.ts/.html) and `campaign-page-builder-step.component.html`. Hit-testing uses `document.elementFromPoint` plus `getBoundingClientRect` (`campaign-preview.component.ts:1100-1300`).
- Hero part dragging (logo/title/subtitle to right/center/left, above/on/below) stores **physical** positions in the campaign model (§1.7).
- Measuring overlays and menus with `getBoundingClientRect`: Studio page, campaign-preview, rewards page, platform dashboard/organizations/users, and color-picker.

### 1.6 Backend-generated user-facing text [C]

`C:\DEV\HamonymStudio\hamonym-backend\src`: 787 non-comment Hebrew lines in 85 files.

| Kind | Where | Treatment |
|---|---|---|
| API error responses | **106** `res.status(n).json({ error: … })` sites, with a mix of Hebrew text, English text and codes. Only ≈ 27 responses carry a stable `code`. 32 sites have Hebrew text directly in the JSON | Add stable codes; the UI translates (§2.8) |
| The frontend shows server text verbatim | ≈ **115** reads of `err.error?.error` / `err?.error?.error`, 9 of `.message`, 7 of `.code` | A central `ApiErrorService` (§2.8) |
| Transactional and admin emails | 17 templates in `modules/email/templates/`; `_layout.js:2` is `<html dir="rtl" lang="he">`; amounts formatted `₪` + `toLocaleString('he-IL')` | Language-aware templates, chosen per recipient (Phase 9) |
| Social/SEO meta page | `modules/social-meta/social-meta.service.js:99` `<html lang="he" dir="rtl">` | Follows the campaign **content** language (§4) |
| CardCom hosted page language | `Language: 'he'` hard-coded: `donations.service.js:542`, `billing/cardcom.routes.js:103-104`, `billing/cardcom.service.js:35` | Pass the checkout language (Phase 7) |
| AI agent prompts | `agents/*` (campaign-creation, advisor, partner-import, approval) | They produce **content**, out of interface scope (§4) |
| Entity categories | Backend `modules/campaigns/entity-categories.js` duplicates the frontend list | IDs are stable; labels move to the frontend's translations |

Database values are **already language-independent [C]**: statuses are English enums (`pending/paid/failed`, `draft/published`, job names, finding types); grep found no Hebrew status values in code paths. Financial identifiers (receipt numbers, CardCom references, `ISOCoinId`) are numeric or ASCII.

There is **no** `users.preferred_language` and **no** `campaigns.content_language` column **[C]** (grep over `migrations/`).

### 1.7 Content model facts that constrain the design [C]

`modules/campaigns/services/campaign-studio-state.service.ts` stores layout with **physical** values:

- `align?: 'right' | 'center' | 'left'` (line 285);
- `minimalHeaderLogoAlign / TitleAlign / SubtitleAlign: 'right'|'center'|'left'` (lines 622-624);
- `logoStripAlign` (828) and `heroLogoPosition: 'left'|'center'|'right'|'above'` (833);
- `ContainerBlockData.direction: 'row' | …` with the index-0-is-rightmost rendering rule.

These are **content** properties of a campaign, persisted in the database and rendered by the public page. They must keep their stored values and their current visual meaning.

### 1.8 Existing localization infrastructure

**None [C].** Partial building blocks that exist:

- `formatMoney` / `currencySymbol` in `modules/campaigns/utils/donation-currency.ts`. This is part of the uncommitted multi-currency work, and its labels are Hebrew.
- DD/MM/YYYY date formatting is hand-written in many places (the project rule in CLAUDE.md).
- `localStorage` key convention `hm.<area>.<name>` (`hm.studio.layout`).

### 1.9 Reproducible audit commands

The audit scripts used for this document are recreated in Phase 0 as committed tools:

| Tool (Phase 0) | Measures |
|---|---|
| `scripts/i18n-audit-strings.cjs` | Hebrew occurrences/unique per area and file; comments and specs excluded |
| `scripts/i18n-audit-css.cjs` | Physical vs logical CSS declarations per file |
| Quick greps | `grep -rcE "direction: *rtl" src/app --include=*.css` · `grep -rnoE "err[a-zA-Z]*\??\.error\??\.(error|message|code)" src/app --include=*.ts` · `grep -rnE "Language: *'he'|Language:\s*$" ../hamonym-backend/src` |

---

## 2. Target Architecture

The architecture below was **approved on 2026-11-07** with the adjustments recorded in §13 (D-01 … D-14).

### 2.1 Library: Transloco (runtime) — APPROVED (D-01)

| Option | Instant switch without reload | Lazy per-feature files | Tooling (missing/unused keys) | Verdict |
|---|---|---|---|---|
| Angular built-in i18n (`$localize`) | **No.** One build per locale, a full reload and a URL per locale | n/a | Good (extract) | Rejected: violates the "no reload" requirement and doubles the Render deploy |
| ngx-translate v16 | Yes | Manual | Third-party | Fallback only if Transloco fails the Phase 1 compatibility check |
| **Transloco (`@jsverse/transloco`)** | **Yes** | **Yes** (scopes) | `@jsverse/transloco-keys-manager` (find/extract) | **Approved** |
| Hand-written signal service | Yes | Manual | None | Rejected |

- **[A]** Transloco 7.x supports Angular 18 standalone APIs (`provideTransloco`, `TranslocoPipe`, `TranslocoDirective`, `translateSignal`). Verify the peer ranges in Phase 1 before installing. If they don't match, stop and record it in §13; don't switch libraries silently.
- **[A]** `@jsverse/transloco-messageformat` gives ICU plural and select, needed for English ("1 donor" / "2 donors") and Hebrew forms. Verify it in Phase 1.

### 2.2 Translation files: bundled JSON by feature — APPROVED (D-02)

```
src/app/i18n/
  he/  common.json  shell.json  auth.json  onboarding.json  registration.json
       dashboard.json  donations.json  donors.json  reports.json  ambassadors.json
       settings.json  campaigns.json  studio.json  public.json  checkout.json
       validation.json  platform.json  errors.json  status.json  categories.json
  en/  (identical file set and identical key sets)
  GLOSSARY.md   (approved English terminology, see D-07)
```

- The loader uses `import(\`./i18n/${lang}/${scope}.json\`)`, so esbuild bundles and hashes the files. **No runtime HTTP fetch** and no stale-cache mismatch after a Render deploy. This needs `resolveJsonModule: true` (Phase 1).
- Hebrew `common`, `shell`, `errors`, `status` and `validation` are imported **statically** (eager), so Hebrew paints with no flash of keys and tests stay synchronous. Other scopes load lazily with their routes. English loads on demand.
- Key style is `scope.area.meaning`, for example `donations.table.amount` or `status.donation.paid`. Keys describe meaning, never Hebrew wording or position.
- Interpolation is named, never positional concatenation; ICU for plurals.

### 2.3 Central language and direction state — APPROVED (D-03)

`src/app/core/i18n/ui-language.service.ts` (new):

```ts
export type UiLang = 'he' | 'en';
lang = signal<UiLang>(resolveInitial());
dir  = computed(() => this.lang() === 'he' ? 'rtl' : 'ltr');
// one effect(): documentElement.lang/dir, Transloco.setActiveLang, persistence
```

- **Hebrew is the default.** There is **no browser-language detection**.
- Resolution order:
  1. on public pages only, an explicit `?lang=he|en` query parameter (it is then persisted);
  2. stored preference `localStorage['hm.ui.lang']` (read and written inside `try/catch`; when storage is blocked, Hebrew);
  3. for a logged-in user, the profile language (`users.preferred_language`, Phase 9);
  4. `'he'`.
- One `effect` owns all side effects. Nothing else may write `documentElement.dir` or `lang`.
- `APP_INITIALIZER` waits for the eager Hebrew files before bootstrap finishes.

### 2.4 Interface language vs content language: direction domains

There are **two separate language concepts** (D-11):

- **Interface language** (`UiLanguageService.lang`): the viewer's choice. It covers every system-generated string, including on public pages.
- **Content language** (`contentLang`): the language the campaign author wrote in. It is **Hebrew for every campaign today**, because no field stores it yet ([C] §1.6). It is never inferred from the interface language, and campaign-authored content is **never machine-translated**.

| Domain | Language / direction from | Elements |
|---|---|---|
| **Interface chrome** | Interface language | Topbar, sidebar, dashboards, Studio panels/toolbars/menus, admin, auth, onboarding |
| **System widgets on public pages** | Interface language, as a **direction island** (`[attr.lang]` + `[attr.dir]` on the widget root) | Donation form and amount selector, checkout overlay, validation messages, stats labels ("supporters", "of goal", "days left"), progress texts, success/failure screens, comments/updates/ambassador-join forms, footer system links, cookie/legal system text, the public language selector |
| **Campaign-authored content** | Content language (`dir="rtl" lang="he"` today) | Hero texts, story, rich text, block texts, reward titles/descriptions, custom registration field labels, CTA labels the author wrote, sponsor names, update posts, FAQ, and **the page layout itself** (block order, hero part positions, row direction) |
| **Data islands** | Always `dir="ltr"` (unchanged) | Email, phone, URL/slug, IBAN, card fields, colour hex, numeric inputs |

**Rule for author-editable text with a system default [A, audit in Phase 7]:** if the author saved a value, it's content and is shown as written. If the field is empty and the page falls back to a built-in default (for example a default donate-button label), that default is an **interface string** and is translated. Phase 7 lists every such fallback.

On a public page viewed in English, the layout and authored texts stay Hebrew and RTL, while the system widgets render English and LTR inside it. Geometry code must therefore ask the **relevant container** for its direction, never the document:

```ts
// shared/utils/direction.ts (new)
export const dirOf = (el: Element): 'rtl' | 'ltr' =>
  getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
```

### 2.5 Language selectors (HE/EN)

`src/app/shared/ui/language-switcher/` (new standalone `hm-language-switcher`):

- A compact two-option control: **inline SVG flag + code** (Israeli flag + `HE`, US flag + `EN`). Flag emoji are not usable: Windows does not render regional-indicator flags, and `scripts/test-no-ui-emoji.cjs` forbids them **[C]**.
- Accessibility: `role="radiogroup"`; each option is `role="radio"` with `aria-checked` and its own `lang`. The accessible name is in the option's own language ("עברית", "English"), and flags are `aria-hidden`.
- **Placement:**
  - the authenticated topbar;
  - the Super Admin platform top strip;
  - auth pages (login, register, reset, accept-invite, admin login);
  - onboarding and registration headers;
  - **public campaign pages, the minimal donation page, donation success, receipt view and my-donations** (D-04), placed in the page's system header/footer area and **inside the checkout overlay**, so a donor can switch mid-checkout without losing what they entered.
- Switching is instant: no reload, no route change, no loss of form state, Studio state, undo history or an open checkout.
- **Kill switches:**
  - `environment.i18n.englishEnabled` (default `false` until Phase 10) hides every selector and forces `he`. This is the global rollback lever;
  - `environment.i18n.publicEnglishEnabled` (default `false`) gates public pages separately;
  - `environment.i18n.englishProviderPagesEnabled` (default `false`) gates the CardCom `Language` change (§2.10).

### 2.6 Persistence

1. `localStorage['hm.ui.lang']`: per device, shared by the app and public pages (same origin).
2. A `?lang=` query parameter on public pages, for shareable English links. It is applied and persisted, and removed from the visible URL (`replaceUrl`) only if that doesn't break analytics attribution parameters **[A]**.
3. `users.preferred_language` (Phase 9): written when a logged-in user switches, and read at login. Used for that user's emails.
4. Returning from CardCom: the success and failure pages read the stored language. When storage is unavailable, they fall back to Hebrew. The CardCom redirect URLs are **not** changed to carry the language unless Phase 7 shows it is needed, because those URLs are payment-sensitive.

### 2.7 Locale formatting (one place) — dates APPROVED (D-05)

`src/app/core/i18n/format.service.ts` (new) wraps `Intl` with the active interface language:

- **Dates:** `DD/MM/YYYY` in **both** languages for now, 24h, `Asia/Jerusalem`. Month names, where shown in words, are in the interface language. A future US-style format would be a new decision.
- **Money:** `formatMoney(amount, currency)` becomes language-aware for labels only. Amounts, currencies and rounding are never affected by language.
- **Numbers:** `Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-IL')`. Replaces the 71 `toLocaleString('he-IL')` calls and the `| number` pipe (`en-US` today) **module by module**, with the Hebrew output proven identical.
- **Collation:** `Intl.Collator(lang)`.

### 2.8 API errors

- **Backend (additive, contract-safe):** each error response keeps its existing `error` text and adds `code` (`SCREAMING_SNAKE`). The API never translates.
- **Frontend:** `core/i18n/api-error.service.ts` resolves `errors.<code>`. Otherwise it uses the server `error` text (today's Hebrew behaviour), and otherwise `errors.generic`.

### 2.9 Direction-aware CSS conventions

| Physical | Logical replacement |
|---|---|
| `margin-left/right`, `padding-left/right` | `margin-inline-start/end`, `padding-inline-start/end` |
| `left:` / `right:` | `inset-inline-start` / `inset-inline-end` |
| `text-align: right` (meaning "start" in RTL) | `text-align: start` |
| `border-left/right` | `border-inline-start/end` |
| `border-top-left-radius` … | `border-start-start-radius` … |
| `translateX(100%)` off-screen drawer | `translateX(calc(var(--hm-dir-sign) * 100%))`, with `--hm-dir-sign` set per `[dir]` |
| `background-position: left 14px center` | Keep, plus a `[dir=ltr]` override |
| Directional icon (back/next) | `hm-icon` `[flipInLtr]` |
| `direction: rtl` in a component | **Delete**; inherit from the domain root (§2.4) |

Physical usages are allowed for:

- centring (`left: 50%; translateX(-50%)`);
- data islands;
- campaign-content positions stored physically (§1.7).

### 2.10 Payment provider language (CardCom): provider-sensitive (D-12)

- Our own checkout UI (amounts, frequency, donor fields, validation, summary, currency notices) is an interface string and is translated in Phase 7a. **Nothing about the payment request changes.**
- The CardCom-hosted pages are a separate, provider-sensitive surface: the LowProfile redirect page that donors see, 3DS, and **OpenFields** card fields in organisation registration.
  - `Language: 'he'` stays hard-coded until Phase 7b passes on a **test terminal**.
  - Phase 7b must verify:
    - the accepted `Language` values (**[D]** a `Language` field exists on LowProfile in CardCom's v11 docs; the values are not exercised);
    - LowProfile page rendering;
    - 3DS challenge rendering;
    - **OpenFields behaviour and layout in English and in an LTR host page** (**[A] unknown**; OpenFields previously had provider-side layout issues, see the 2026-09-26 CardCom OpenFields record);
    - that the redirect, webhook and verification gate are unaffected.
  - Until then, an English checkout shows a short English notice that the secure card page is displayed in Hebrew.
- Hebrew requests must remain **byte-identical**, including `Language: 'he'`.

---

## 3. Scope

| Area | Routes / modules | Strings (≈ occ.) | Phase |
|---|---|---|---|
| App shell | `core/layout/*`, `core/services` messages | 93 | 3 |
| Shared UI | `shared/ui/*`, `shared/components/*` | 268 | 3 (Studio editors in 6) |
| Authentication | `modules/auth/pages`, `platform/admin-login-page` | 62 + | 4 |
| Onboarding and registration | `modules/onboarding`, `modules/organization-registration` | 268 | 4 (OpenFields language in 7b) |
| Organization dashboard and management | `dashboard`, `donations`, `donors`, `reports`, `ambassadors`, `registrations`, `settings`, `billing`, campaigns list, campaign workspace (`campaigns/:id/*`) | ≈ 1,000 | 5 |
| Campaign Studio (chrome) | `campaigns/studio/*`, `campaigns/builder/*`, block catalog, editors | ≈ 1,300 | 6 |
| **Public campaign pages: system UI** | `campaign-public-page`, system labels in `campaign-preview`, `minimal-donation-page`, `donation-success`, `receipt-view`, `my-donations`, `payment-failed-popup`, `donation-toast`, with an **independent HE/EN selector** | ≈ 450 | 7a |
| **Donation forms, validation, checkout UI** | `checkout-v2` (+ config), `checkout-modal`, donation widget, public forms | ≈ 110 + | 7a |
| CardCom-hosted pages and OpenFields language | Backend `Language` param (3 sites) | n/a | 7b (provider-gated) |
| Super Admin | `modules/platform/*` | ≈ 1,457 | 8 |
| Backend errors, preferences, emails | `hamonym-backend/src` | n/a | 9 (codes may be pulled forward) |
| Notifications, errors, validation | Toasts, bell, `confirm()`, form validation, API errors | n/a | 3–9 |
| Mobile layouts | 375 / 768 px in every phase | n/a | All |
| `modules/dev` | dev-only routes | 46 | Allow-listed (may stay Hebrew) |
| **Campaign-authored content in English** (translation, English templates, LTR canvas, `content_language`) | n/a | n/a | **Out of scope.** Track B (§4.3) |

---

## 4. Important Separation

### 4.1 Interface language ≠ campaign content language (D-11)

- The interface language is a **viewer preference**. It is never stored on a campaign or organisation, and never sent in a campaign save.
- **Campaign-authored content is never automatically translated**, by any phase, on any page. There is no machine translation of authored content.
- In the Studio, switching language changes panels, labels, tooltips and menus only. The canvas keeps `dir="rtl" lang="he"` and renders identical HTML. `CampaignStudioStateService` must not read `UiLanguageService`, and save payloads are identical before and after a switch.
- On public pages, switching language changes system widgets only (§2.4). Authored texts, the layout and the block order are unchanged.
- Template **names and descriptions** in the picker are interface strings. The **content** a template inserts is campaign content and is not translated.
- Physical layout values stored in campaigns (§1.7) keep their meaning. Studio controls show physical icons with literal labels ("Right", "Center", "Left").

### 4.2 Language-independent data and contracts

- DB status values, enums, job names, finding types, analytics event names, route paths, query parameters, receipt numbers, CardCom fields, amounts and currencies are never localised. Labels are produced only at render time (`status.<domain>.<value>`).
- APIs only gain additive `code` fields.
- Financial values never pass through a translation template that embeds a number. They are rendered from data.
- **Existing accounting CSV exports keep their Hebrew headers in both interface languages** (D-06). This applies to the donations page export, including the multi-currency columns, and to any export used by bookkeeping. New non-accounting exports may follow the interface language; decide per export and record it in §13.

### 4.3 Track B (not in this roadmap)

Supporting English **content** campaigns would need:

- `campaigns.content_language`;
- an LTR canvas and LTR public layout from it;
- English templates and seed text;
- AI agents producing English;
- the semantics of physical positions reviewed;
- receipts and emails per content language;
- SEO `lang`/`hreflang`.

This roadmap prepares for it: content roots take a `contentLang` input fixed to `'he'`, and geometry reads container direction.

---

## 5. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation | Rollback |
|---|---|---|---|---|---|
| R1 | **Hebrew regression during extraction** (typos, lost punctuation/nbsp, broken interpolation) | High | High | Mechanical extraction writes `he` values verbatim; Playwright Hebrew text and screenshot baseline (§8.4); no rewording during extraction | Revert the phase commit |
| R2 | **Studio drag-and-drop breaks** with LTR chrome | High | High | `dirOf(container)`; canvas stays RTL; Playwright DnD tests asserting saved JSON | Kill switch; revert sub-phase 6c |
| R3 | **Overlays/menus clip or open off-screen** (77 fixed rules) | Medium | Medium | Shared `placeMenu`; viewport assertions at 375 px | Per-component revert |
| R4 | **`direction: rtl` leftovers** (211) | High | Medium | Removed in Phase 2 under the Hebrew screenshot gate; ratchet blocks new ones | Revert Phase 2 |
| R5 | **Donation flow regression** (amount, currency, presets, payload, redirect, webhook) | Low with controls | **Critical** | Label-only changes in 7a; payload equality tests in both languages; Hebrew CardCom request byte-identical; no real charges; provider changes only in 7b on a test terminal | `englishEnabled`/`publicEnglishEnabled` off; `englishProviderPagesEnabled` off |
| R6 | **OpenFields / CardCom page in English or inside an LTR host behaves differently** | Medium | High | Phase 7b test-terminal verification before enabling; registration payment step keeps `Language: 'he'` until verified | `englishProviderPagesEnabled` off |
| R7 | **Strings frozen at module load** (label maps, `setTitle`, chart labels) | High | Low | Keys translated at render; re-run on language change; unit tests | Fix forward |
| R8 | **Bundle size / budgets** | Medium | Low | Lazy scopes; check budgets each phase | Move scopes to lazy |
| R9 | **Specs asserting Hebrew** (66 files) | High | Low | `provideTestI18n()` with real Hebrew files | n/a |
| R10 | **Overlap with multi-currency work** in campaign and checkout files | Medium | Medium | Not a blocker for Phases 0–5 (D-13); coordinate at the start of 5 (donations page), 6 and 7 only; never mix both efforts in one commit | Revert the i18n commit alone |
| R11 | **Mobile overflow** (English ≈ 20–35 % longer) | High | Medium | Overflow assertions at 375 px in both languages | Fix forward |
| R12 | **Wrong-language email** | Medium | Medium | Recipient rule (Phase 9); default `he` | Force `he` in the email layer |
| R13 | **Mixed-direction public page looks broken** (English widgets inside an RTL layout) | Medium | Medium | Widgets are isolated direction islands with their own `lang`/`dir`; Playwright screenshots of every public widget in EN on the RTL page; UX review of D-04 before rollout | `publicEnglishEnabled` off |
| R14 | **Authored text mistaken for system text, or the reverse** (an authored CTA gets translated, or a system default stays Hebrew) | Medium | Medium | Phase 7a fallback audit (§2.4 rule); `data-i18n-content` marker on every authored-text element; scanner checks | Fix forward |
| R15 | **Visual baselines differ between Windows and a Linux CI runner** (font rendering) | High | Low | Baselines per platform, or the visual suite runs in the official Playwright Docker image in CI (§8.6) | Visual job advisory until stable |

**Highest-risk components [C]:**

- `campaign-preview.component.ts/html`, shared by the Studio and the public page;
- `campaign-builder-studio-page`;
- `campaign-page-builder-step`;
- `checkout-v2` and `checkout-modal`;
- `organization-registration/step-payment` and `step-billing-method`, plus `billing/components/openfields-form`;
- `platform-billing-ops-page` and `platform-collection-ops-page`;
- `sidebar` and `app-layout`.

---

## 6. Phased Implementation Plan

### 6.0 Rules for every phase

1. **Preserve the existing Hebrew experience (D-14):** layout, text, business behaviour and payment processing. Proven by the Hebrew baseline comparison (§8.4) and the payment regression suite (§8.5).
2. Additive API changes only. No change to financial logic, FIN-11, Collection Ops or payment requests (except Phase 7b, gated). DB changes only where a phase says so, tested on an isolated DB, never production.
3. No commit, push or deploy without an explicit instruction. Publish only through the clean-worktree procedure.
4. English stays behind the kill switches until Phase 10.
5. Each phase lists:
   - **Entry criteria**;
   - **Deliverables**;
   - **Acceptance criteria**;
   - **Regression tests**;
   - **Rollback**.
   
   A phase is complete only when every acceptance item is checked and recorded in §14.
6. End of every phase: update §12, §13 and §14.

### 6.1 Common regression pack (referred to as **RP**)

Every phase runs:

- **RP-1** `ng build` (production configuration) passes within budgets.
- **RP-2** The full Karma suite has the same pass/fail list as the recorded baseline. Known pre-existing failures are listed in §14 and may not grow.
- **RP-3** The Playwright Hebrew baseline (§8.4) matches: exact text, and screenshots within threshold, at 1440 / 768 / 375 px, for every route in the suite.
- **RP-4** The static scanners pass, with ratchets not exceeded (§7.3, §7.4), and so does the existing `scripts/test-no-ui-emoji.cjs`.
- **RP-5** From Phase 1: translation parity (§7.2).
- **RP-6** Only when the phase touches donation, checkout, registration-payment or backend payment code: the payment regression suite (§8.5).

---

### Phase 0: Baseline and guard-rails (no application change)

**Entry**
- Architecture approved (done 2026-11-07).
- A clean, committed working tree for the files the tooling reads. The multi-currency work does not need to be committed (D-13).

**Deliverables**
- `scripts/i18n-audit-strings.cjs` and `scripts/i18n-audit-css.cjs` (§1.9).
- `scripts/test-no-hardcoded-ui-strings.cjs`: Hebrew characters and literal Latin template text, ratchet per file against `scripts/i18n-baseline.json`, and an `ALLOWED` list with reasons.
- `scripts/test-logical-css.cjs`: the same ratchet for physical CSS properties and `direction: rtl`.
- **Playwright** (D-09):
  - `@playwright/test` dev dependency with Chromium;
  - `playwright.config.ts` with projects `he-desktop`, `he-tablet` and `he-mobile`;
  - `e2e/i18n/` containing a route list `e2e/i18n/routes.ts`;
  - a Hebrew baseline spec that records visible text per landmark plus `toHaveScreenshot` at 1440 / 768 / 375.
  
  Routes:
  - auth, dashboard, donations, donors, reports, settings;
  - a workspace page and the Studio;
  - a public campaign, the minimal donation page, the checkout open, and success;
  - the admin pages.
  
  Data: local dev backend with local/isolated data only, **never production**. Authentication uses a local test user. Dynamic regions (dates, counters, toasts) are masked.
- A record of the current Karma pass/fail list in §14.

**Acceptance**
- [ ] The scanners pass with baselines equal to today's counts.
- [ ] The Playwright Hebrew suite runs twice in a row with zero diffs (deterministic).
- [ ] No file under `src/` changed.

**Regression:** RP-1, RP-2 (unchanged).

**Rollback:** delete the added scripts, config and dev dependency. No runtime effect.

**Effort:** S–M

---

### Phase 1: i18n core (infrastructure only, zero visible change)

**Entry:** Phase 0 complete; Hebrew baseline recorded.

**Deliverables**
- Transloco and messageformat compatibility verified against Angular 18, and installed. `@jsverse/transloco-keys-manager` installed as a dev dependency.
- `resolveJsonModule: true` in `tsconfig.json`.
- In `src/app/core/i18n/`: `ui-language.service.ts`, `transloco-loader.ts`, `i18n.providers.ts` (`provideHmI18n()`), `format.service.ts` and `api-error.service.ts` (not yet wired).
- `src/app/i18n/{he,en}/common.json` with parity.
- `src/testing/i18n-testing.ts` (`provideTestI18n()`).
- `scripts/test-i18n-parity.cjs`.
- `app.config.ts` gets `provideHmI18n()`.
- The `i18n` flags in `environment.prod.ts` (all `false`). `environment.ts` is never committed.

**Acceptance**
- [ ] `<html lang="he" dir="rtl">` remains in effect with the flags off.
- [ ] A unit test confirms that switching to `en` sets `dir="ltr" lang="en"` and that switching back restores it; that persistence failure falls back to Hebrew; and that no browser-language detection happens (the test sets `navigator.language='en-US'` and expects Hebrew).
- [ ] Parity check passes.

**Regression:** RP-1 … RP-5. The Hebrew baseline must be identical.

**Rollback:** revert the single commit. Remove the providers and the dependencies.

**Effort:** S

---

### Phase 2: Direction foundation (CSS)

**Entry:** Phase 1 complete.

**Deliverables**
- `styles.scss`: root direction from the `dir` attribute, `--hm-dir-sign`, the `select` chevron override.
- Remove the 211 `direction: rtl` declarations and the hard-coded `dir="rtl"` on chrome roots.
- Content roots get `[attr.dir]="contentDir"` / `[attr.lang]="contentLang"` (fixed `'he'`): the `campaign-preview` page root, `campaign-public-page:31`, the minimal donation page. `dir="ltr"` data islands stay.
- Logical CSS for the shell (`app-layout`, `sidebar`, `topbar`, `platform-top-strip`, `notification-bell`, toasts, `idle-warning-modal`) and for `shared/ui` and `shared/components`. Modules are converted later, with their strings.
- `hm-icon` `flipInLtr` support. Mark directional back/next icons. Physical-meaning arrows (content ordering) are not flipped.
- `shared/utils/direction.ts` and `shared/utils/place-menu.ts`.
- A dev-only `?hm-dir=ltr` override for eyeballing.
- A Playwright project `ltr-shell` (forced LTR, Hebrew text) for the shell routes.

**Acceptance**
- [ ] The Hebrew baseline is **pixel-identical** within threshold on every route and viewport.
- [ ] In forced LTR:
  - the sidebar is on the left and the mobile drawer slides from the left;
  - there's no horizontal overflow at 375 px;
  - menus and dialogs are in the viewport.
- [ ] `test-logical-css` baseline lowered to the new counts.

**Regression:** RP-1 … RP-5.

**Rollback:** revert. The change is CSS and template attributes only.

**Effort:** M

---

### Phase 3: Selector, shell, shared strings, errors

**Entry:**
- Phase 2 complete;
- the English glossary started (`src/app/i18n/GLOSSARY.md`, D-07).

**Deliverables**
- `hm-language-switcher` with SVG flags (§2.5), placed in the topbar, the platform top strip and the auth layouts. Hidden unless `englishEnabled`.
- Persistence to `localStorage['hm.ui.lang']`.
- Strings moved to `shell`, `common`, `status`, `errors`, `validation` and `categories`. Sources:
  - `core/layout/*` and the `core/services` user messages;
  - `shared/ui/*` (except the Studio editors);
  - `shared/components/*`, including the date-range presets;
  - `entity-categories.ts` as `categories.<id>` (IDs unchanged).
- `ApiErrorService` wired into the shell and auth call sites. Additive `code` on the backend errors they receive.
- `confirm()` / `alert()` texts in the shell translated. They stay native dialogs, so behaviour doesn't change.
- English drafted by Claude per the glossary. Important terms are listed for product-owner review in §13.

**Acceptance**
- [ ] Hebrew baseline identical.
- [ ] With the flags on, in a dev build:
  - the switch is instant on every authenticated route;
  - route, scroll and form state are kept;
  - `<html dir/lang>` is correct;
  - the persisted choice survives a reload.
- [ ] A Playwright `en-*` project shows no Hebrew characters in shell landmarks and no raw keys.
- [ ] Switcher keyboard operation (Tab, arrows, Space/Enter) and the screen-reader names are verified.
- [ ] Important terminology reviewed and recorded.

**Regression:** RP-1 … RP-5, plus the Playwright EN shell suite.

**Rollback:** set `englishEnabled=false`, which hides the selector and forces Hebrew, or revert the phase commit.

**Effort:** M

---

### Phase 4: Authentication, onboarding, organization registration

**Entry:** Phase 3 complete.

**Deliverables**
- Strings and logical CSS for `modules/auth/pages/*`, `platform/admin-login-page`, `modules/onboarding/*` and `modules/organization-registration/**` (6 steps, `config/entity-config.ts`, constants). Validation goes to `validation.*`.
- The registration draft stores data only, never labels.
- The OpenFields iframe stays a data island, and `Language` stays `'he'` (its English behaviour is Phase 7b).

**Acceptance**
- [ ] Hebrew baseline identical, including every registration step.
- [ ] The full EN registration path works at 375 / 1440 up to the card step, with no Hebrew system text and no overflow.
- [ ] Draft save and resume work across a language switch mid-wizard.
- [ ] The CardCom request made by the registration card step is byte-identical to before in both interface languages.

**Regression:** RP-1 … RP-5, plus RP-6 for the registration billing card step (stub-based only).

**Rollback:** revert the phase commit, or set the kill switch off.

**Effort:** M

---

### Phase 5: Organization dashboard and management pages

**Entry**
- Phase 3 complete.
- **Coordination check (D-13):** `donations-page` has uncommitted multi-currency changes. At phase start, either that work is committed, or `donations-page` is done last in this phase, in a commit separate from the multi-currency change.

**Deliverables**
- Strings, logical CSS and `FormatService` for:
  - `dashboard`, `donations`, `donors`, `reports` (+ `report-chart`), `ambassadors`, `registrations`, `settings`, `billing`;
  - `campaigns-page` and the campaign workspace children (`app.routes.ts:64-153`).
- Chart.js: axis side, labels and legends follow the interface language, and charts rebuild on switch.
- Accounting CSV exports keep their **Hebrew headers** (D-06). File names are unchanged.

**Acceptance**
- [ ] Hebrew baseline identical.
- [ ] Every route in EN shows no Hebrew system text. Data and authored names are exempt and marked `data-i18n-content`.
- [ ] Totals, amounts and dates are numerically identical in both languages (a test parses the rendered values).
- [ ] The CSV export is byte-identical in HE and in EN.
- [ ] No overflow at 375 px.

**Regression:** RP-1 … RP-5.

**Rollback:** revert per module commit (one commit per module is required in this phase).

**Effort:** L

---

### Phase 6: Campaign Studio chrome

**Entry**
- Phase 3 complete.
- **Coordination check (D-13):** the multi-currency changes in `campaign-preview`, `campaign-donation-step` and `campaign-studio-state.service` are committed, or explicitly sequenced before this phase.

**Sub-phases:**
- 6a: Studio shell and panels;
- 6b: builder steps, block catalog, template picker labels and style/preset names;
- 6c: geometry and drag-and-drop;
- 6d: `shared/ui` editors (text-style, text-role, style-role, rich-text toolbar, logo-appearance, color-picker, category-picker).

**Deliverables**
- The Studio root follows the interface direction, with panels mirrored in LTR.
- The canvas root keeps the content direction (`rtl`) and `lang="he"`.
- Geometry:
  - `resolveDropTarget` (`campaign-preview.component.ts:1155-1162`) uses `dirOf(row)`;
  - `onResizeMove` (`campaign-builder-studio-page.component.ts:550-554`) takes its sign from the Studio direction;
  - the floating toolbar (`:348-352`) anchors in the canvas direction;
  - menus use `placeMenu`.
- The 9 strings that name a side are rewritten to be direction-neutral in both languages. Any Hebrew wording change is listed in §14 as an intended baseline change and approved.
- Hero part controls keep their physical values and icons. TipTap alignment keeps physical semantics.

**Acceptance**
- [ ] Hebrew baseline identical, except the approved direction-neutral copy.
- [ ] Hebrew Playwright DnD tests produce the same saved draft JSON as before the phase. The tests cover:
  - row insert before/after;
  - hero part zones;
  - sidebar-to-canvas drop;
  - the drag reported 2026-11 (donation box under the stats bar);
  - panel resize.
- [ ] In EN, the same gestures produce the **same** draft JSON as in HE.
- [ ] Canvas HTML is unchanged by a language switch.
- [ ] Unsaved changes and undo history survive a switch.
- [ ] Studio checked at 1280 and 768 px.

**Regression:** RP-1 … RP-5, plus the Studio DnD suite.

**Rollback:** revert per sub-phase, or set the kill switch off.

**Effort:** XL

---

### Phase 7a: Public pages, donation forms, validation, checkout UI (interface only)

**Entry**
- Phase 6 complete, because `campaign-preview` is shared;
- the multi-currency overlap is resolved for `checkout-v2`, `donation-success` and `donation-toast` (D-13).

**Deliverables**
- The independent **HE/EN selector on public pages** (D-04): system header/footer area and inside the checkout overlay, gated by `publicEnglishEnabled`, with `?lang=` support (§2.6).
- **Fallback audit:** a list in §13 of every author-editable field and its system default, classified per the §2.4 rule.
- `data-i18n-content` on every authored-text element of `campaign-preview` and the minimal donation page.
- Translation of the system widgets as direction islands:
  - the donation widget and amount selector;
  - stats labels and progress texts;
  - the comments, updates-signup and ambassador-join forms with their validation;
  - success, failure, receipt view and my-donations;
  - `Title`/`Meta` strings that are system text. A campaign title remains content.
- Translation of `checkout-v2` and `checkout-modal` labels, validation and summaries, plus the currency notices from the multi-currency work.
- In EN mode, the "secure card page in Hebrew" notice (§2.10). `Language` stays `'he'`.

**Acceptance**
- [ ] Hebrew public page, checkout, success and receipt are text- and pixel-identical to baseline.
- [ ] In EN:
  - authored content is unchanged character for character, keeping its RTL layout (a DOM comparison of `data-i18n-content` nodes between HE and EN);
  - every system widget is English and LTR, and there is no Hebrew system text;
  - no overflow at 375 px.
- [ ] The donation payload (amount, currency, frequency, items, attribution, donor fields) is **identical** for the same inputs in HE and EN (unit and Playwright tests against the mock provider).
- [ ] Switching language mid-checkout keeps the amount, frequency and donor fields.
- [ ] The CardCom request is byte-identical to before in both languages.

**Regression:** RP-1 … RP-6, plus the existing `multi-currency.spec.ts` in both languages.

**Rollback:** `publicEnglishEnabled=false` (public pages back to Hebrew-only), or revert.

**Effort:** L

---

### Phase 7b: CardCom provider pages in English (provider-sensitive, D-12)

**Entry**
- Phase 7a complete;
- explicit approval to use a **CardCom test terminal**;
- no production credentials changed;
- no real card charged.

**Deliverables**
- A research record per the "one topic at a time, Verified / Documented-only / Unknown" rule, covering:
  - the accepted `Language` values;
  - the LowProfile page and 3DS in English;
  - **OpenFields** in English and inside an LTR host (field widths, placeholders, error texts, the 3DS script);
  - that the redirect URLs, webhook and verification gate are unchanged.
- Implementation: `Language` derived from the checkout's interface language **only when** `englishProviderPagesEnabled` is on, at the 3 backend sites (`donations.service.js:542`, `billing/cardcom.routes.js:103`, `billing/cardcom.service.js:35`). A test proves the Hebrew request is unchanged.

**Acceptance**
- [ ] Every item verified on the test terminal, with evidence recorded in §14.
- [ ] Stub-based backend tests: Hebrew request byte-identical; English differs only in `Language`.
- [ ] Product-owner sign-off before the flag is enabled anywhere but local.

**Regression:** RP-6 in full, plus the stub CardCom tests.

**Rollback:** `englishProviderPagesEnabled=false`, which restores `Language: 'he'` everywhere.

**Effort:** M (mostly verification)

---

### Phase 8: Super Admin

**Entry:** Phase 3 complete. It can run in parallel with 6/7.

**Deliverables**
- Strings and logical CSS for `modules/platform/pages/*` (14 pages), `modules/platform/components/*`, `ops-labels.ts` (to `status.job.*` / `status.finding.*`), `platform-top-strip` and `impersonation-banner`.

**Acceptance**
- [ ] Hebrew baseline identical.
- [ ] EN has no Hebrew system text.
- [ ] Each action button calls the same service method with the same arguments in both languages (unit tests).
- [ ] The phase diff contains no change outside templates, label maps, CSS and i18n files: FIN-11 and Collection Ops logic untouched (review checklist).

**Regression:** RP-1 … RP-5.

**Rollback:** revert per page commit.

**Effort:** L

---

### Phase 9: Backend language awareness

**Entry:** Phase 3 complete. The error-code work may be pulled forward module by module alongside 4–8.

**Deliverables**
- `code` on all remaining error responses (additive).
- A migration (next free number, 088+) for `users.preferred_language` (`'he'|'en'`, default `'he'`), and `PATCH /api/users/me/preferences`.
- Emails:
  - `_layout.js` takes `lang`/`dir`;
  - templates get `he` and `en` text;
  - organisation/admin recipients use `preferred_language`;
  - donor emails use the D-10 rule;
  - section 46 / official receipt documents stay Hebrew unless a tax adviser decides otherwise.

**Acceptance**
- [ ] Every existing email renders byte-identically for `he`.
- [ ] The migration and its rollback are tested on an isolated DB clone (port 5433), never production.
- [ ] The API contract test shows only additive changes.
- [ ] No `.env`-loading test is run.

**Regression:** RP-1, RP-2, the backend stub tests, and RP-6 if donation emails are touched.

**Rollback:** the migration rollback script, a revert, and an email-layer force to `he`.

**Effort:** M–L

---

### Phase 10: Enforcement, CLAUDE.md rules, release

**Entry:** Phases 0–9 complete, or explicitly descoped in §13.

**Deliverables**
- Ratchets at zero (allow-list only).
- Parity, plus unused-key detection (`transloco-keys-manager find`).
- **CI made mandatory** (D-08 final stage, §7.5).
- **Bilingual development rules added to both CLAUDE.md files** (§7.6), referencing the automated parity and RTL/LTR checks.
- Kill switches turned on with product-owner approval.

**Acceptance**
- [ ] Definition of Done (§10) met.
- [ ] CI blocks merges on any failure of the build, tests, scanners, parity or the Playwright HE/EN suites.
- [ ] CLAUDE.md rules present in both files.

**Regression:** RP-1 … RP-6 on the release candidate.

**Rollback:** the kill switches (English off, Hebrew unaffected).

**Effort:** S

---

## 7. Future Development Enforcement

### 7.1 Mandatory bilingual support

From Phase 1, every new or modified interface string must be a key with `he` and `en` values. The Phase 0 ratchet scanners already prevent new hard-coded strings and new physical CSS before the CLAUDE.md rules are formally added. Campaign-authored content and user data are exempt, and are rendered inside `data-i18n-content`.

### 7.2 Key parity

`scripts/test-i18n-parity.cjs` (Phase 1, extended in Phase 10) fails on:
- missing keys;
- empty values;
- mismatched placeholders or ICU arguments;
- invalid ICU;
- orphan files;
- unused keys (Phase 10).

### 7.3 Detection of hard-coded UI strings

`scripts/test-no-hardcoded-ui-strings.cjs` (Phase 0) flags:
- Hebrew characters anywhere in `src/app` outside comments, specs, `i18n/*.json` and the allow-list;
- Latin template text outside interpolation;
- `placeholder`/`title`/`aria-label`/`alt` attributes with literal text.

The ratchet only goes down.

### 7.4 RTL/LTR regression

- `scripts/test-logical-css.cjs`: a ratchet on physical properties and `direction: rtl` outside content roots.
- The Playwright `he-*` / `en-*` projects (§8.2), plus the forced-LTR shell project.

### 7.5 CI enforcement: progressive, eventually mandatory (D-08)

None exists today **[C]**. Stages:

| Stage | When | What runs | Blocking? |
|---|---|---|---|
| 0 | Phases 0–2 | Locally, by every session before declaring a task done: RP-1…RP-5 | Session rule |
| 1 | From Phase 3 | `.github/workflows/frontend.yml` on push/PR: build, Karma headless, static scanners, parity | **Advisory** (reported, not blocking) |
| 2 | From Phase 6 | Stage 1 plus the Playwright HE suite (in the Playwright Docker image, with Linux baselines) | Scanners and parity **blocking**; visual advisory |
| 3 | Phase 10 | Everything, including the Playwright EN suites | **Mandatory**: failures block merge. Whether CI also gates the Render deploy is decided then |

### 7.6 CLAUDE.md rules: added in Phase 10 (enforcement phase), to both CLAUDE.md files

Draft text, to be finalised in Phase 10:

```markdown
## Bilingual UI (Hebrew/English) — mandatory
- Every user-visible interface string is a Transloco key with `he` and `en` values
  (`src/app/i18n/<lang>/<scope>.json`). Never hard-code Hebrew or English UI text.
- Campaign-authored content is never translated automatically and is rendered inside
  `data-i18n-content`. Interface language and campaign content language are separate.
- No `direction: rtl`, `dir="rtl"`, physical left/right or `text-align: left/right` for
  chrome; use logical properties. Content roots take `dir` from the content language;
  data islands (email/phone/URL/card) stay `dir="ltr"`.
- Geometry code (drag-and-drop, menus, resize) uses `dirOf(container)`; never assume RTL.
- Interface language never changes campaign content, saved payloads, DB values, API
  fields, CSV accounting headers (Hebrew), payment requests or financial values.
- CardCom `Language` changes only behind `englishProviderPagesEnabled`, after test-terminal verification.
- Backend errors carry a stable `code`; the UI maps codes via `ApiErrorService`.
- Before finishing any UI task: translation parity, hard-coded-string and logical-CSS
  scanners, and the Playwright HE/EN suites for affected routes must pass.
- Dates DD/MM/YYYY in both languages; money/numbers via `FormatService`.
- Progress and decisions: `docs/BILINGUAL-I18N-ROADMAP.md`.
```

---

## 8. Testing Strategy

### 8.1 Unit and integration (Karma)

- `provideTestI18n()` loads the real Hebrew files synchronously, so existing specs run unchanged.
- New specs:
  - language switch re-renders pipes, label maps, titles and charts;
  - `UiLanguageService` (resolution order, no browser detection, storage failure);
  - `FormatService` (identical numbers);
  - `ApiErrorService`;
  - switcher accessibility;
  - payload equality HE vs EN for every donation and registration form.

### 8.2 Browser RTL/LTR: Playwright (D-09)

- Projects: `he-desktop` (1440), `he-tablet` (768), `he-mobile` (375), `en-desktop`, `en-tablet`, `en-mobile`, and from Phase 2 `ltr-shell` (forced LTR).
- Per route:
  - `html[dir]` / `[lang]` correct;
  - no horizontal overflow;
  - no Hebrew in interface landmarks in EN (outside `data-i18n-content`);
  - no raw keys (`/^[a-z]+(\.[a-zA-Z0-9]+)+$/`) in visible text in either language;
  - every menu and dialog in the route's action list opens fully inside the viewport.
- **Studio drag-and-drop:** real pointer and `DragEvent` gestures, asserting the resulting draft JSON (the approach used previously, see `docs/DECISIONS.md`).
- **Public pages:** a DOM equality test of `data-i18n-content` nodes between HE and EN.
- **Checkout:** the flow runs to the mock provider only; network requests to real CardCom endpoints are blocked by the test (`page.route`).

### 8.3 Desktop and mobile viewports

1440, 768 and 375 px in every phase. The Studio is also tested at 1280 **[A]**; confirm the Studio's minimum supported width in Phase 6.

### 8.4 Hebrew preservation (visual and text regression)

- The Phase 0 baseline consists of `toHaveScreenshot` snapshots and text snapshots per landmark, for every route and viewport.
- Each phase compares against it. Any difference is a defect unless it is recorded in §14 as an approved, intended change, and the baseline is updated in the same commit.
- Dynamic regions are masked; time is frozen (`page.clock`) where pages show relative dates.

### 8.5 Payment and financial regression protection

- **Frontend:** payload equality HE vs EN (amount, currency, frequency, items, attribution, donor fields), and `multi-currency.spec.ts` in both languages.
- **Backend (stub-based only):** the CardCom request is byte-identical for Hebrew, and `Language` is the only field that differs in English (from 7b).
- **Never:**
  - run `.env`-loading scripts, which connect to production;
  - charge a real card;
  - change production credentials;
  - run production migrations.
- **FIN-11, billing and Collection Ops:** the i18n diffs touch templates, label maps, CSS and i18n files only (review checklist per phase).
- The CSV accounting export is byte-identical in HE and EN.

### 8.6 Visual baseline platform

Screenshot baselines depend on the operating system's font rendering. Local baselines are Windows. CI uses the official Playwright Docker image with its own Linux baselines, generated once and reviewed. Text snapshots are platform-independent and are the primary gate.

---

## 9. Estimated Effort and Dependencies

Relative sizing (S ≈ 1 focused session, M ≈ 2–3, L ≈ 4–6, XL ≈ 7+).

| Phase | Size | Depends on | Coordination with multi-currency (D-13) |
|---|---|---|---|
| 0 Baseline and guard-rails (incl. Playwright) | S–M | Approval | None |
| 1 i18n core | S | 0 | None |
| 2 Direction foundation | M | 1 | None (shell and shared CSS only) |
| 3 Selector, shell, shared, errors | M | 2 | None |
| 4 Auth, onboarding, registration | M | 3 | None |
| 5 Organization management | L | 3 | `donations-page` only, at phase start |
| 6 Studio chrome (6a–6d) | XL | 3 | `campaign-preview`, `campaign-donation-step`, studio state service |
| 7a Public and checkout UI | L | 6 | `checkout-v2`, `donation-success`, `donation-toast` |
| 7b CardCom provider pages | M | 7a, test terminal approval | Payment code: review jointly |
| 8 Super Admin | L | 3 | None (parallel with 6/7 possible) |
| 9 Backend | M–L | 3 (codes earlier) | Donation emails, if touched |
| 10 Enforcement and release | S | All | none |

**Recommended order:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7a → 7b → 9 → 8 → 10.

- Phases 0–5 can proceed regardless of the multi-currency status.
- Phase 8 may run in parallel with 6/7.
- Phase 9's error codes may be pulled forward alongside 4–8.

---

## 10. Definition of Done

HAMONYM is fully bilingual when **all** hold.

**Strings and parity**

1. **No untranslated system UI:** `test-no-hardcoded-ui-strings` reports 0 outside the allow-list (each entry with a reason), and the Playwright EN suites find no Hebrew interface text and no raw keys on any route.
2. **Parity:** identical `he`/`en` key sets, no empty values, matching placeholders, no unused keys.

**Layout and behaviour**

3. **No broken layouts in either direction:** `test-logical-css` reports 0 physical chrome declarations, and the Playwright HE and EN suites pass on every route at 375 / 768 / 1440 px. That means no overflow, menus and dialogs in the viewport, and the Studio drag-and-drop JSON identical across languages.
4. **Instant switching** with no reload or state loss, on authenticated **and public** pages. The choice persists per device, and per account for logged-in users.

**Separation and preservation**

5. **Separation holds:** campaign-authored content is identical in HE and EN views (DOM test), the canvas HTML doesn't change on a switch, and saved payloads are identical.
6. **Hebrew preserved:** the Hebrew baseline matches, except approved changes recorded in §14. Business behaviour is unchanged, and so is payment processing: Hebrew CardCom requests are byte-identical, and accounting CSVs are byte-identical.
7. **Provider:** CardCom English pages and OpenFields are verified on a test terminal and enabled by an explicit decision, or they remain Hebrew, recorded in §13.

**Backend**

8. All API errors carry a `code`. All emails exist in `he` and `en`, with tested recipient rules.

**Enforcement**

9. **All new development follows the bilingual requirements automatically:** CI is mandatory (stage 3), and the CLAUDE.md rules are in both files.

---

## 11. Executive Summary

**Today [C]:**

- Hebrew-only and RTL-only;
- no i18n infrastructure, no Material/CDK, no CI;
- ≈ 3,400 unique Hebrew strings;
- 211 `direction: rtl` declarations and ≈ 430 physical CSS declarations;
- RTL assumptions inside the Studio's drag-and-drop, resize and toolbar code;
- untyped Hebrew API errors;
- Hebrew-only emails;
- a hard-coded CardCom `Language: 'he'`.

Statuses, contracts and financial values are already language-independent.

**Approved approach:**

- Transloco with bundled feature files;
- Hebrew default, no browser detection;
- one service owning `lang`/`dir`;
- interface language strictly separate from campaign content language. Authored content is never auto-translated, and public pages get their own HE/EN selector that translates only system UI, forms, validation and checkout;
- logical CSS;
- error codes;
- DD/MM/YYYY in both languages;
- Hebrew accounting CSV headers;
- Claude-drafted English with terminology review;
- Playwright HE/EN visual regression;
- progressive CI that becomes mandatory;
- CardCom provider pages in English only after test-terminal verification of OpenFields and LowProfile.

**Safety:**

- ratchet scanners from Phase 0;
- a Hebrew text-and-pixel baseline gating every phase;
- payload and CardCom byte-equality tests;
- three kill switches: global English, public English and provider language;
- multi-currency overlap handled only where files actually overlap (Phases 5–7).

**Sequence:**

| Order | Phase |
|---|---|
| 1 | 0 Baseline |
| 2 | 1 Core |
| 3 | 2 Direction |
| 4 | 3 Selector and shell |
| 5 | 4 Auth and registration |
| 6 | 5 Management |
| 7 | 6 Studio |
| 8 | 7a Public and checkout UI |
| 9 | 7b CardCom provider pages |
| 10 | 9 Backend |
| 11 | 8 Super Admin |
| 12 | 10 Enforcement and CLAUDE.md |

---

## 12. Status

| Phase | Status | Date | Notes |
|---|---|---|---|
| Architecture review | **Approved with adjustments** | 2026-11-07 | D-01 … D-14 |
| 0 Baseline and guard-rails | Not started (ready) | | |
| 1 i18n core | Not started | | |
| 2 Direction foundation | Not started | | |
| 3 Selector, shell, shared, errors | Not started | | |
| 4 Auth, onboarding, registration | Not started | | |
| 5 Organization management | Not started | | Coordinate `donations-page` (D-13) |
| 6 Studio chrome | Not started | | Coordinate campaign files (D-13) |
| 7a Public and checkout UI | Not started | | Coordinate checkout files (D-13) |
| 7b CardCom provider pages | Not started | | Needs test-terminal approval |
| 8 Super Admin | Not started | | |
| 9 Backend | Not started | | D-10 open |
| 10 Enforcement and release | Not started | | |

## 13. Decision Log

| ID | Decision | Outcome | Date |
|---|---|---|---|
| D-01 | i18n library | **Approved:** Transloco runtime translations (+ messageformat, keys-manager), subject to the Phase 1 compatibility check | 2026-11-07 |
| D-02 | Translation file structure | **Approved:** feature-based JSON files under `src/app/i18n/<lang>/`, bundled; Hebrew core eager | 2026-11-07 |
| D-03 | Default language | **Approved:** Hebrew is the default; **no automatic browser-language detection** | 2026-11-07 |
| D-04 | Public pages language | **Approved (adjusted):** public campaign pages have an **independent HE/EN interface selector**. System UI, donation forms, validation and checkout are translated independently of campaign-authored content. Gated by `publicEnglishEnabled` | 2026-11-07 |
| D-05 | Date format | **Approved:** DD/MM/YYYY initially in both languages | 2026-11-07 |
| D-06 | CSV headers | **Approved:** existing accounting CSV headers remain Hebrew in both languages | 2026-11-07 |
| D-07 | English copy | **Approved:** Claude drafts English; important user-facing terminology is reviewed by the product owner; glossary at `src/app/i18n/GLOSSARY.md` | 2026-11-07 |
| D-08 | CI | **Approved:** progressive enforcement, eventually mandatory (stages in §7.5). Render deploy gating decided in Phase 10 | 2026-11-07 |
| D-09 | Visual regression | **Approved:** Playwright-based RTL/LTR visual regression tests (§8.2, §8.6) | 2026-11-07 |
| D-10 | Donor email / receipt-email language | **Open:** proposal is to store the donor's interface language on the donation (additive column) and use it for the thank-you/receipt email, while legal receipt documents stay Hebrew. Decide before Phase 9 | — |
| D-11 | Content vs interface language | **Approved:** campaign-authored content is never automatically translated; content language and interface language are separate concepts (§2.4, §4.1) | 2026-11-07 |
| D-12 | CardCom language | **Approved:** provider-sensitive. `Language` stays `'he'` until OpenFields, LowProfile and 3DS are verified on a test terminal (Phase 7b, flag `englishProviderPagesEnabled`) | 2026-11-07 |
| D-13 | Multi-currency dependency | **Approved:** Phases 0–5 are not blocked by the multi-currency work. Overlapping campaign and checkout files are coordinated only when Phases 5 (`donations-page`), 6 and 7 begin; the two efforts are never mixed in one commit | 2026-11-07 |
| D-14 | Hebrew preservation | **Approved:** the existing Hebrew experience is preserved, including layout, business behaviour and payment processing; enforced by RP-3 and RP-6 in every phase | 2026-11-07 |
| D-15 | CLAUDE.md rules timing | **Approved:** bilingual rules are added to both CLAUDE.md files in Phase 10 (enforcement), together with the automated parity and RTL/LTR checks; ratchet scanners guard new code from Phase 0 | 2026-11-07 |
| D-16 | Per-phase acceptance | **Approved:** every phase defines entry, acceptance, regression (RP pack) and rollback (§6) | 2026-11-07 |
| — | Flags as SVG, not emoji | Recorded: Windows doesn't render flag emoji; `test-no-ui-emoji.cjs` forbids them [C] | 2026-11-07 |
| — | Campaign content in English (Track B) | Recorded: out of scope; prepared for, not built (§4.3) | 2026-11-07 |

Glossary terms requiring review (to be filled in Phase 3 onward): תשורות, שגרירים, עמותה/ארגון, קמפיין, תרומה חודשית/הוראת קבע, דף תרומה מהיר, סטודיו, יעד, תומכים, קבלה/אישור תרומה, סעיף 46.

## 14. Progress Log

| Date | Session / phase | What changed | Hebrew baseline diff | Notes |
|---|---|---|---|---|
| 2026-11-07 | Planning | Created this document from a code audit. No application code changed | n/a | |
| 2026-11-07 | Architecture review | Recorded approvals and adjustments: D-01 … D-16. Added the public HE/EN selector, the content/interface separation rules, Phase 7 split (7a UI / 7b CardCom), per-phase entry/acceptance/regression/rollback, Playwright testing, progressive CI and the multi-currency coordination rule. Documentation only | n/a | Phase 0 is ready to start on instruction |
