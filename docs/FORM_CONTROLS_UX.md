# Form control UX standardization

## Inventory and causes

The audit covered 159 CSS/SCSS files and 138 Angular templates, including 80
templates containing native input/textarea/select controls. 68 stylesheets had
focus rules. No Angular Material form fields are currently used.

Conflicts included a universal important focus reset plus a second important
purple outline; local teal/blue/green focus borders and shadows; green donor
valid-state borders; double borders on composite URL fields; broad onboarding
input rules affecting radio/file/color/range controls; inaccessible display:none
switch inputs; and component-specific mobile sizes/font sizes.

## Implementation

- `styles/_form-controls.scss` defines neutral, focus, error, disabled, readonly,
  height, radius and typography tokens. `styles.scss` loads it and removes the
  universal reset and competing outline rule.
- Standard controls have one neutral border, one purple focus border and one red
  invalid border (also on focus). Angular invalid state is shown only after
  touch, dirty interaction or form submission. Existing explicit custom/server
  validation classes and aria-invalid remain authoritative. No validators,
  required fields or validation timing in component code have been changed.
- Error/help text remains in the existing templates; this change does not
  generate new errors or invent business validation messages.
- A narrow important border-color/outline/box-shadow guarantee protects native
  controls from lazy component stylesheet order. This replaces the previous
  universal important reset; it does not target provider fields. Forced-colors
  mode intentionally restores a system focus outline.
- Local field focus/error declarations now use the shared tokens instead of
  adding independent rings. Common field size/radius/font declarations use the
  same tokens. Checkout green valid decoration is removed, while existing
  validation feedback, icons, values and submit events are preserved.
- URL composite wrappers own the border; the internal input has no second one.
- Choice controls stay compact. Hidden editor/offering switches remain visually
  hidden but keyboard focusable, with visible focus on their existing slider.
- Onboarding no longer sizes checkbox/radio/range/color/file/hidden/button inputs
  as ordinary text fields. Mobile standard controls use 16px text. Textareas stay
  multiline/resizable; disabled and readonly remain distinct and legible.

Covered areas: onboarding and organization settings, authentication/account
settings, Super Admin forms and modals, campaign builder/settings/registration,
donor-detail checkout, donations/donors/ambassadors/partners, report filters and
shared text/style editing controls. Existing navigation/data behavior is reused.

## Deliberate exceptions

- CardCom `app-openfields-form` and its native expiry controls are excluded from
  the new shared overrides. The secure iframe and provider styles are untouched.
- Color/range controls, rich-text content/toolbars, compact color pickers,
  custom donation amount chips and large checkout amount fields retain their
  specialized geometry. Shared editor shell focus uses one purple border.
- Existing business/server error messages still determine when an explicit
  `.invalid` or `aria-invalid=true` state is appropriate.
- Chrome tests use desktop and narrow viewports; physical iOS/Safari/Android and
  a live external-provider payment are not performed as part of this UI task.

## Verification

`tsconfig.form-controls.spec.json` includes computed-style tests against real
component styles plus organization lifecycle, switcher, settings, money-input,
checkbox and navigation regressions. `scripts/karma-form-controls.cjs` supplies
desktop and narrow Chrome launchers. Pass matching `--include` patterns from the
tsconfig when invoking Angular CLI with this focused config.

Tests cover pristine/focus/valid/invalid/invalid+focus, dynamic validation/reset,
submit/error text, readonly/disabled, composite borders, keyboard-focusable
switches, provider exclusions, multiline/RTL/layout and numeric model behavior.
Production verification: `npm run build -- --configuration production`.

Final Chrome regression run: 139 tests per viewport, 278 successful executions.
The existing lifecycle test harness also logs Router injector-teardown messages
and an intentionally mocked permission-denied response; these are not failing
assertions. Chrome launcher cleanup warnings can occur on this Windows setup.
`node scripts/test-form-controls-keyboard.cjs` additionally exercises real native
Tab and Space events via local Chrome DevTools Protocol at 1440px and 390px:
focus border, invalid focus, text entry, disabled skipping, readonly access,
custom switch keyboard activation and RTL containment all pass. It serves only
fixture markup/styles and never connects to the application backend.

Final production build: PASS. The existing campaign-preview CSS budget warning
(93.56 kB versus 92.16 kB) remains; that specialized stylesheet was not changed.

No backend, database, payment integration, approval or financial logic changes.
