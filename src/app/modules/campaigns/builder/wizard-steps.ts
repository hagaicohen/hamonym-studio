import type { CampaignDraft } from '../services/campaign-studio-state.service';

// Which wizard steps a campaign may edit, shared by the classic editor and the
// Campaign Builder Studio so both apply the same rules (moved unchanged from
// campaign-editor.component.ts, 2026-11-05):
// - ongoing campaigns have no registration step;
// - the minimal donation page has no steps 4–9;
// - a published campaign edits steps 3–8 in its Workspace pages instead.
export const TOTAL_STEPS = 10;
export const REGISTRATION_STEP = 5;
export const PUBLISHED_GATED_STEPS = [3, 4, 5, 6, 7, 8];
export const MINIMAL_FORMAT_GATED_STEPS = [4, 5, 6, 7, 8, 9];

export type WizardStepDraft = Pick<CampaignDraft, 'campaignLifecycle' | 'status' | 'layout'>;

export function disabledWizardSteps(draft: WizardStepDraft): number[] {
  const gated = new Set<number>();
  if (draft.campaignLifecycle === 'ongoing') gated.add(REGISTRATION_STEP);
  if (draft.layout.pageFormat === 'minimal') MINIMAL_FORMAT_GATED_STEPS.forEach(s => gated.add(s));
  if (draft.status !== 'draft') PUBLISHED_GATED_STEPS.forEach(s => gated.add(s));
  return [...gated];
}

// Why a step is not editable in place: a published campaign's steps 3–8 move to
// the Workspace (still editable there); other reasons hide the step entirely.
export function wizardStepAccess(draft: WizardStepDraft, step: number): 'edit' | 'workspace' | 'hidden' {
  if (!disabledWizardSteps(draft).includes(step)) return 'edit';
  const hiddenForOtherReason =
    (draft.campaignLifecycle === 'ongoing' && step === REGISTRATION_STEP) ||
    (draft.layout.pageFormat === 'minimal' && MINIMAL_FORMAT_GATED_STEPS.includes(step));
  return !hiddenForOtherReason && draft.status !== 'draft' && PUBLISHED_GATED_STEPS.includes(step) ? 'workspace' : 'hidden';
}
