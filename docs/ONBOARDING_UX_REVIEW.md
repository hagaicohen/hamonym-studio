# Organization onboarding UX review

Local frontend changes only. No database, provider, approval or fee policy changes.

## Implemented

- One shared completion checklist component for onboarding review and Super Admin.
  The existing admin health indicators, association-only tax-document rule and
  score calculation were extracted unchanged into `organization-health.ts`.
  Campaign existence is omitted from registration review because a campaign is
  not a prerequisite to registering an organization. Logo, existing profile
  completeness and billing setup are shown as informational completion items.
  No new submit/continue guards were added.
- Completion marks and management-reason checkboxes are compact (16px).
- Onboarding highlights CardCom-only support, deferrable incorporation documents,
  Section 46 upload/verification requirements and nonbinding fundraising targets.
  The unsupported Tranzila option is disabled; provider implementation is untouched.
- Review no longer reports a saved credit card without the existing CardCom deal
  confirmation in registration state. MASAV remains completed later in settings.
- Password and Google login no longer wait for the full donation-history query.
  Organization and ambassador context initialization still precedes navigation.
  The existing donor role is enriched asynchronously, without changing the
  selected organization, duplicating the role, or accepting results for another
  session. Existing return URLs remain higher priority than default navigation.

## Read-only findings; no semantic changes

### Rejection

`platform.service.js` routes `reject` to `setStatus(..., 'rejected', 'reject', ...)`.
It updates the entity status/timestamp and writes an audit event in a transaction.
It does not delete the organization, user links, campaigns, documents or financial
records. Decision email is queued after commit; email failure does not reverse
the decision. Public donation/campaign endpoints require an active organization,
so rejected organizations are excluded from those public paths. Backend ownership
checks continue to protect the retained management data.

`entities.service.js#requestReview` accepts only `changes_requested`, not
`rejected`. The current admin UI permits requesting changes for a rejected
organization. Thus the existing resubmission path is: admin requests changes,
owner completes the details and requests review. No change to this policy was made.

### Section 46

The current completion indicator checks for a tax-document filename, not an
independent verified Section 46 state. No dedicated per-document verification
state was found in the inspected entity/donation implementation. The new wording
distinguishes uploading from verification; it does not implement or claim a new
tax-benefit enforcement mechanism. A request for a separate verified-state gate
would require an explicit product/business decision.

### Hiding fundraising goals

The Page Builder has visibility controls for blocks/stat items, but the current
renderer always renders the target/progress in some fixed summary areas. An
independent goal-visibility switch honored by every layout was not found. Copy
therefore describes editing/hiding fundraising components subject to the chosen
layout, rather than promising a universal target-only switch. Universal hiding
needs a separate scoped product decision; no campaign rendering was changed.

### Login timing

The confirmed frontend dependency was `auth response -> forkJoin(entities,
ambassador campaigns, full donation history) -> navigation`. Controlled tests
keep donation history unresolved and verify that successful login now navigates
and ends loading anyway, then adds the donor role on response. No authenticated
Render timing trace was collected; backend password hashing, database latency
and server startup performance were not changed or attributed a measured delay.

## Verification

Focused Angular tests cover completion predicates, optional document behavior,
Section 46 applicability, actual card-confirmation display, MASAV deferred setup,
accessible compact markers, slow/failed donation history, session changes,
authentication rejection, return URLs and existing routing/header behavior.
Use `tsconfig.onboarding-ux.spec.json` with matching `ng test --include` patterns.
Production build uses the existing trusted-root bundle locally when needed;
TLS verification remains enabled. No commit, push or deployment performed.

## Follow-up: Admin decision clarity and checkbox audit

- Moved the decision area immediately after the completion checklist and before
  operational history. Existing status-based action availability is unchanged.
- Kept the existing accessible confirmation drawer. It now names the organization,
  describes the selected action, shows current/target status, and uses an explicit
  action-specific submit label instead of a generic confirmation. Required notes
  remain required; reason tags remain optional. Rejection explicitly explains
  that data is retained and describes the existing path to resubmission.
- Success is announced only after API success. API errors retain the form and
  notes; processing blocks duplicate submission and closure. The page refreshes
  using its existing API after success. No backend or authorization changes.
- Source audit found 45 checkbox input declarations across 29 HTML templates.
  The shared onboarding stylesheet previously applied its 100%-wide, 48px-high
  text-input styling to every input, including checkboxes. Checkbox inputs are
  now excluded from that rule. A low-specificity 16px native checkbox default
  preserves local compact styles and custom switches with hidden inputs.
  Existing explicit checkbox sizes were reviewed; broad container widths were
  distinguished from actual input dimensions. This is a source/CSS audit,
  not a claim that every application screen was manually visited.
- Focused tests exercise approval, rejection, mandatory notes, reason selection,
  errors/retry, cancel/focus restoration, status-based actions, duplicate request
  prevention, actual computed checkbox dimensions and hidden switch inputs.
  Alongside onboarding, login, header and routing tests: 53 tests passed.

## Scope clarification: decision messages

The user subsequently limited this work to local warning/confirmation UX and
deferred any rejection-policy or notification-persistence changes. No migration,
user-level notification store, backend code or rejection semantics were changed.
The existing rejection confirmation and existing owner-facing messages now
explicitly distinguish the current rejected status from the separate permanent
deletion action. Existing correction messages explain saving changes and using
the existing request-review button. No new resubmission permission was added.

Current notifications are entity-scoped unread approval audit entries; they do
not provide a user-owned deletion message after permanent removal of the entity.
That limitation remains unresolved and is not disguised as a completed feature.
