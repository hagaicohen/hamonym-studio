import type { CampaignDraft } from '../../../services/campaign-studio-state.service';
import { canonicalDraft } from '../../../utils/content-i18n';

// Step 10's publish checks, moved unchanged from campaign-publish-step so the
// Studio's readiness indicator reads the same rules (no second copy). The
// server re-checks the same conditions (getPublishBlockers) on publish.

export function publishHasHero(draft: CampaignDraft): boolean {
  return draft.heroType === 'image' ? !!draft.coverImageUrl : !!draft.videoUrl;
}

// Returns translation keys (studio.missing.*). Checks the Hebrew version, also
// while the Studio has the English one open (D-42).
export function publishMissingFields(draft: CampaignDraft): string[] {
  const d = draft.contentView ? canonicalDraft(draft) : draft;
  const isMinimalFormat = d.layout.pageFormat === 'minimal';
  const isOngoing = d.campaignLifecycle === 'ongoing';
  const missing: string[] = [];
  if (!d.title?.trim())            missing.push('studio.missing.title');
  if (!d.slug?.trim())             missing.push('studio.missing.slug');
  if (!publishHasHero(d) && !isMinimalFormat) missing.push('studio.missing.hero');
  if (!(d.targetAmount > 0)) missing.push('studio.missing.target');
  if (!isOngoing && d.startDate && d.endDate && new Date(d.endDate) < new Date(d.startDate)) {
    missing.push('studio.missing.dates');
  }
  return missing;
}

// Publishing also needs an approved organization (status 'active').
export function publishEntityApproved(entity: { status?: string } | null | undefined): boolean {
  return entity?.status === 'active';
}
