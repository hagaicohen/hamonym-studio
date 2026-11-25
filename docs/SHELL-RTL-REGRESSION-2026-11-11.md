# Main shell RTL/language regression — 2026-11-11

Root cause verified against pre-integration backups and the source worktree:

1. The Visual Builder integration changed `html, body { direction: rtl }` to `direction: inherit`. An author CSS direction on `html` overrides its `dir` presentation hint; inheriting at the document root resolves to the initial LTR direction. The DOM could say `dir="rtl"` while the actual flex layout remained LTR. Removed the overriding declaration, preserving the authoritative `UiLanguageService`/HTML direction.
2. Main's header remained its old version, without the existing `LanguageSwitcherComponent` that the source header contains. The selector was omitted during integration, not hidden by an authentication condition. Reused that component beside the notification bell.
3. The integration route-language whitelist forced Dashboard, Campaigns and other Main pages to Hebrew. Restored the existing default bilingual route policy, retaining explicit `bilingual:false` opt-outs and the existing `hm.ui.lang` persistence.

Changed application files:
- `src/styles.scss`
- `src/app/core/i18n/route-language.ts`
- `src/app/core/layout/topbar/topbar.component.{ts,html,css}`
- `src/app/core/layout/sidebar/sidebar.component.{ts,html,css}`

The header inherits direction; sidebar mobile placement, closed-state translation, border and dropdown alignment use logical language-aware positioning. Existing navigation permissions, role/context switching, authentication and payment logic are unchanged. Navigation/header labels reuse existing Transloco dictionaries. No second language state was added.

Regression files:
- `src/app/core/i18n/route-language.spec.ts`
- `tsconfig.shell-regression.spec.json`
- `e2e/i18n/shell-direction-regression.spec.ts`

Verification:
- Angular development/template rebuild: PASS.
- Focused Karma unit tests: 3/3 PASS (normal routes, explicit opt-out, active child).
- Playwright authenticated-shell journeys: 4/4 PASS; final result recorded in `test-results/shell-regression-verified.log`; four projects cover Hebrew/English at 1440px and 375px, actual computed direction and sidebar geometry, translated navigation, visible language switcher, switching both ways without logout, token preservation, Dashboard/Campaigns navigation, reload persistence, horizontal overflow and Studio canvas direction after content-language selection.
- Actual desktop/mobile Hebrew/English screenshots inspected; artifacts under `test-results/shell-regression-final` and `test-results/shell-regression-verified`.
- Browser rendering uses the real local Main application with existing mocked authenticated-user/API fixtures. No real Google sign-in or production operations were performed.

Scope limit: hardcoded Hebrew copy inside older page bodies is not comprehensively translated by this shell fix. The shell/navigation/header strings connected to existing dictionaries change language; campaign/business data is preserved. No new Studio features implemented.

Before-change backups: `test-results/shell-regression-1794380447886/backup`.
Local application remains on `http://localhost:4200/campaigns` (Main process 23076). No commit, push, deployment, migration or payment changes.
