# Personal menu actions

## Findings and correction

The three creation/join rows were non-focusable divs inside a control that closes
on focusout. A pointer moving focus away from the trigger could close/remove
the dropdown before the row's click handler fired. The donor identity row and
role-management row had the same issue.

The supported creation/join actions, donor row and role-management row are now
native buttons. They retain RTL appearance, keyboard behavior and mobile touch
targets. Navigation closes the menu after successful completion; cancellation
or load failure leaves an actionable error instead of silently dismissing it.
Navigation also cancels any outstanding organization-selection request.

| Action | Destination | Existing behavior / authorization |
| --- | --- | --- |
| New organization | `/organization-registration?mode=new` | Existing authGuard; login return URL preserved. New scoped wizard state, no active-organization prefill and no resume prompt. No entity row until explicit save/submission. |
| Join as ambassador | `/campaigns/discover?mode=ambassador` | Existing public discovery. Organization-manager context is retained. Campaign selection opens `/campaigns/:slug/view?join=ambassador`, which invokes the existing join modal. |
| Personal area | `/my-donations` | Existing authenticated donor area and permissions. |
| Role management | `/settings` | Existing settings route and context guard. |
| Logout | Existing AuthService.logout('/') | Existing token/state cleanup and public-root navigation. |

Wizard state is provided at the existing wizard component, shared by all child
steps but isolated from preceding wizard instances/root-service state. Ordinary
wizard entry without `mode=new` still offers the existing explicit draft-resume
prompt. No new creation API or business workflow was introduced.

## Company registration: decision required, deliberately unchanged

`/company-registration` has no route, page or dedicated company-registration
implementation. It reaches the existing wildcard redirect to `/login`.
The menu action/destination was not remapped, hidden or replaced.

Related existing concepts are not equivalent:

- Organization onboarding supports association, public-benefit company
  (`chalatz`), political parties and sole traders (`sole_exempt`,
  `sole_registered`). There is no generic commercial-company onboarding type.
- `/partners` is the existing Partner back office. Explicit creation creates an
  entity, assigns the `partner` role and opens its existing profile builder.
  Partner profiles can subsequently be linked to campaigns/rewards; this is not
  an independent generic company-registration wizard.
- `company` in the identity model is a role placeholder, not a working
  registration destination. Current login initialization does not populate it.

The product decision is whether the company menu item should represent Partner
creation, an existing supported organization type, or be removed. No such
decision was made by this change.

## Verification scope

Header tests exercise actual button handlers/focus containment, successful,
cancelled and rejected navigation, and mobile touch targets. Wizard tests prove
fresh scoped state/child-state sharing, no creation before save, explicit draft
resume, authentication return URLs and preserved current organization. Existing
ambassador-discovery navigation is tested without enrolling anyone. HTTP writes
in tests are intercepted fixtures only; no shared database or provider calls.

Results: 121 focused tests passed in each desktop/narrow Chrome viewport (242
successful executions). Angular production build passed with the existing
campaign-preview CSS budget warning. Company registration remains intentionally
unresolved pending the product decision above. No commit, push or deployment.
