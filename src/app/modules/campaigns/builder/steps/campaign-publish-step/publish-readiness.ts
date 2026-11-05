import type { CampaignDraft } from '../../../services/campaign-studio-state.service';

// Step 10's publish checks, moved unchanged from campaign-publish-step so the
// Studio's readiness indicator reads the same rules (no second copy). The
// server re-checks the same conditions (getPublishBlockers) on publish.

export function publishHasHero(draft: CampaignDraft): boolean {
  return draft.heroType === 'image' ? !!draft.coverImageUrl : !!draft.videoUrl;
}

export function publishMissingFields(draft: CampaignDraft): string[] {
  const d = draft;
  const isMinimalFormat = d.layout.pageFormat === 'minimal';
  const isOngoing = d.campaignLifecycle === 'ongoing';
  const missing: string[] = [];
  if (!d.title?.trim())            missing.push('שם הקמפיין');
  if (!d.slug?.trim())             missing.push('כתובת הקמפיין');
  if (!publishHasHero(d) && !isMinimalFormat) missing.push('תמונה / וידאו ראשי');
  if (!d.targetAmount) missing.push('יעד גיוס');
  if (!isOngoing && d.startDate && d.endDate && new Date(d.endDate) < new Date(d.startDate)) {
    missing.push('טווח תאריכים תקין');
  }
  return missing;
}

// Publishing also needs an approved organization (status 'active').
export function publishEntityApproved(entity: { status?: string } | null | undefined): boolean {
  return entity?.status === 'active';
}
