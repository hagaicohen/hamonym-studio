// DraftBuilder — deterministic Brief → Draft mapping. No LLM here at all;
// this is the sprint that tests whether the *existing* frontend data model
// (CampaignDraft, OrganizationRegistrationState — both Angular/TS, this
// backend never imports them directly) can actually represent what the AI
// proposes. Field names below are hand-verified against the real
// interfaces, not guessed:
//   - CampaignDraft: hamonym-app/src/app/modules/campaigns/services/campaign-studio-state.service.ts
//     (createInitialDraft() for defaults), CtaConfig/TextStyle: .../shared/models/text-style.model.ts
//   - OrganizationRegistrationState: hamonym-app/src/app/modules/organization-registration/services/organization-registration-state.service.ts
// If those interfaces change, this file's field names need re-verifying —
// there is no compiler across the repo boundary to catch drift.
//
// Two separate mapping functions, not one, because Brief mixes entity-level
// and campaign-level facts by design (ADR decision 10) — the split back into
// two target shapes is exactly what "internally still produces separate
// OrganizationDraft + CampaignDraft objects" (decision 10) means in practice.

// campaign-creation.types.js's Brief fields with NO corresponding field
// anywhere in CampaignDraft or OrganizationRegistrationState today — found by
// trying to map them, not decided upfront. Returned as `unmapped` rather
// than silently dropped or forced into a field that doesn't fit (e.g.
// stuffing suggestedHero into heroCustomHtml, which is raw HTML for
// power-users, not a plain sentence). See AI_CAMPAIGN_CREATION_VISION.md —
// this is a real product decision (does CampaignDraft need a "mood/tone"
// concept?) that belongs to whoever builds the Brief-review UI, not to a
// deterministic mapper guessing on their behalf.
const UNMAPPED_FIELDS = ['suggestedTone', 'suggestedHero'];

// @param {import('../campaign-creation.types').Brief} brief
// @returns {{ patch: object, unmapped: object }} patch uses real CampaignDraft
//   field names — a partial object meant to be merged over createInitialDraft()'s
//   result, the same way a human-started draft begins with those defaults
//   and only some fields get filled in.
exports.toCampaignDraftPatch = (brief) => {
  const patch = {
    title: brief.title ?? '',
    shortDescription: brief.shortDescription ?? '',
    category: brief.category.value ?? '',
    // CampaignDraft.targetAmount is a required number (createInitialDraft
    // defaults it to 0) — Brief's null (honest "no basis to suggest one")
    // has to collapse into the same 0 a human-started draft begins with.
    // Real gap this exposes: the UI cannot currently tell "AI looked and
    // found nothing" apart from "human hasn't filled this in yet" — both
    // render as 0. Not fixed here (that's a UI-layer concern), just surfaced.
    targetAmount: brief.suggestedTargetAmount.value ?? 0,
  };

  // heroCtaConfig is a whole config object (visible/label/color/align/icon —
  // see CtaConfig), not a bare string — Brief only ever proposes the label.
  // createInitialDraft() defaults `visible: false`, so naively merging just
  // `{ label }` over the default would produce an invisible CTA with a
  // suggested label nobody sees. Found by mapping, not anticipated:
  // suggesting a label implies "yes, show it."
  if (brief.suggestedCtaLabel.value) {
    patch.heroCtaConfig = { visible: true, label: brief.suggestedCtaLabel.value, color: '#06b6d4', align: 'center', icon: '' };
  }

  return { patch, unmapped: pickUnmapped(brief) };
};

// @param {import('../campaign-creation.types').Brief} brief
// @returns {{ patch: object, unmapped: object }} patch uses real OrganizationRegistrationState field names.
exports.toOrganizationDraftPatch = (brief) => {
  const patch = {
    // OrganizationRegistrationState has two distinct name fields —
    // organizationName (STEP 1, maps to entities.legal_name) and
    // displayName (STEP 2, public-facing name). Free text can't reliably
    // tell which one it's giving you (people don't distinguish "legal name"
    // from "display name" when describing themselves) — mapped to both, and
    // flagged here rather than silently guessing one is right. A human
    // reviewing the registration draft still sees both fields and can split
    // them if they actually differ.
    organizationName: brief.organizationName ?? '',
    displayName: brief.organizationName ?? '',
    organizationNumber: brief.organizationNumber ?? '',
    organizationDescription: brief.organizationDescription ?? '',
    entityType: brief.entityType ?? '',
    primaryCategory: brief.category.value ?? '',
    selectedCategories: brief.category.value ? [brief.category.value] : [],
  };

  // monthlyGoal/yearlyGoal (STEP 3, entity-level ongoing fundraising goals)
  // deliberately NOT populated from suggestedTargetAmount — that's a
  // single campaign's target, a different concept from the organization's
  // recurring monthly/yearly goal. Mapping one into the other would be a
  // real semantic error, not a shape mismatch.

  return { patch, unmapped: pickUnmapped(brief) };
};

function pickUnmapped(brief) {
  const out = {};
  for (const key of UNMAPPED_FIELDS) out[key] = brief[key];
  return out;
}
