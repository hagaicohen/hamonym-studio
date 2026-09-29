import { CampaignDraft } from '../services/campaign-studio-state.service';

// Single source of truth for "which logo represents THIS campaign" —
// campaign's own override first (draft.campaignLogoUrl), then the entity
// that actually OWNS this specific campaign (draft.entityLogo, resolved
// server-side off c.entity_id by both getCampaignById and
// getCampaignBySlug(Public) since 2026-09-24). Never the entity that
// happens to be globally "current" for the logged-in manager — that has no
// relationship to which campaign is being viewed, and using it let one
// campaign's Checkout show a different campaign's/entity's logo whenever
// the manager had a different entity selected in their topbar switcher
// (2026-09-28, found via CampaignPreviewComponent, which had its own
// separate, wrong resolution; MinimalDonationPageComponent already used
// this exact precedence, which is why it was unaffected).
export function resolveCampaignLogo(draft: CampaignDraft): string | null {
  return draft.campaignLogoUrl || draft.entityLogo || null;
}
