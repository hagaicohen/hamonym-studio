// Which editor the app opens for campaigns (2026-11-05: the Campaign Builder
// Studio replaces the classic Wizard as the default).
//
// ROLLBACK: set DEFAULT_CAMPAIGN_EDITOR to 'classic'. Every entry point goes
// back to the Wizard; nothing else changes. The Wizard and its routes
// (/campaigns/create, /campaigns/:id/edit) stay in place either way, and the
// Studio stays reachable at /campaigns/create/studio and /campaigns/:id/studio.
// See docs/CAMPAIGN_STUDIO_DEFAULT_EDITOR.md.
//
// Partner pages (/partners/...) have their own editor and are not affected.
export type CampaignEditor = 'studio' | 'classic';
export const DEFAULT_CAMPAIGN_EDITOR: CampaignEditor = 'studio';

// The classic Wizard's step 10 ("סיכום ופרסום"); the Studio opens its
// publish dialog for it.
export const PUBLISH_STEP = 10;

export function campaignCreatePath(editor: CampaignEditor = DEFAULT_CAMPAIGN_EDITOR): string[] {
  return editor === 'studio' ? ['/campaigns/create/studio'] : ['/campaigns/create'];
}

export function campaignEditPath(id: string, editor: CampaignEditor = DEFAULT_CAMPAIGN_EDITOR): string[] {
  return ['/campaigns', id, editor === 'studio' ? 'studio' : 'edit'];
}

// Deep link to a wizard step. Both editors read ?returnStep=<step>: the
// Wizard opens that step, the Studio selects that area (or opens publishing).
export function campaignStepLink(id: string, step: number, editor: CampaignEditor = DEFAULT_CAMPAIGN_EDITOR): { commands: string[]; queryParams: { returnStep: number } } {
  return { commands: campaignEditPath(id, editor), queryParams: { returnStep: step } };
}
