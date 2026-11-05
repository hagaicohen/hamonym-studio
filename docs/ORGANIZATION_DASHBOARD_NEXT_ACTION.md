# Organization Dashboard next action

Local frontend change; no backend rules, data, or permissions changed.

## Existing sources of truth

- Refresh the selected entity and its dashboard together before deciding navigation.
- Automatic first-campaign navigation requires `status === 'active'`,
  `is_profile_complete === true`, no `requires_completion`, and the dashboard's
  all-time `kpi.activeCampaigns.total === 0`. This count is entity-scoped and
  independent of the selected analytics dates.
- Missing profile labels match onboarding's existing `isProfileComplete` fields;
  additional stored `missing_fields` are shown when `requires_completion` is set.
- The informational Super Admin health score is not an approval gate. It includes
  campaign existence and optional documents, so using it here would be circular.
- Logo, incorporation certificate, Section 46 and an entity-owned CardCom terminal
  are not new creation blockers. The existing donation backend supports platform
  CardCom fallback. This UI does not certify payment configuration or bypass any
  campaign publication/payment checks.

## Entry and navigation

Successful login without an explicit return URL, switching to another organization,
and interactive Welcome navigation arm a one-use in-memory entry intent. Initial
page loading, refresh, history navigation, returning from the builder, and clicking
Dashboard do not arm it. A ready organization with zero campaigns consumes this
intent and navigates to the existing `/campaigns/create` using `replaceUrl`.
Nothing creates a campaign record automatically. Dashboard remains accessible.

Existing return URLs and organization selection remain authoritative. Pending,
draft, rejected, suspended and corrections-requested organizations never receive
an automatic campaign redirect. API failure leaves an error, not an inferred
ready state. Stale responses from a previously selected organization are ignored.

## Dashboard presentation

The dedicated `סטטוס העמותות` section below the KPI summary groups organization
status/actions and replaces duplicate organization warnings. Actual
administrator feedback comes from the existing approval-status API. Editing and
resubmission proceed through organization settings. Optional recommendations are
separate from required completion. Empty organizations get first-campaign guidance
inside that section. Regular KPIs, activity tables, alerts and charts remain visible
even with zero campaigns; organization status supplements the regular dashboard.

An additional compact section lists the user's other organizations, each with its
own fresh completion status, missing requirements, optional recommendations, and
settings link. Activity statistics and automatic navigation still use only the
selected organization. Failed detail requests are reported as unverified, never
as ready. Switching organization cancels stale summary requests.

Existing rejection rule is unchanged: `rejected` preserves data, but owner
resubmission is allowed only after the administrator changes the status to
`changes_requested`. The dashboard explains this instead of enabling an invalid
request. Creating a draft before approval remains possible under existing rules.

## Verification

Focused configuration: `tsconfig.dashboard-next-action.spec.json`.
Coverage includes statuses, required/optional completion, selected organization,
all-time campaign count, one-use entry consumption, Dashboard return, unavailable
data, stale organization responses, and existing login/header/Welcome routing.
