// Simple Studio is the default. Explicit 'studio' and 'classic' choices
// retain the previous editors as explicit rollback options. Ordinary create/edit
// routes mount Simple Studio; classic has its own explicit URLs.
//
// Partner pages (/partners/...) have their own editor and are not affected.
export type CampaignEditor = 'simple-studio' | 'studio' | 'classic';
export const DEFAULT_CAMPAIGN_EDITOR: CampaignEditor = 'simple-studio';

// The classic Wizard's step 10 ("סיכום ופרסום"); the Studio opens its
// publish dialog for it.
export const PUBLISH_STEP = 10;

export function campaignCreatePath(editor: CampaignEditor = DEFAULT_CAMPAIGN_EDITOR): string[] {
  return editor === 'simple-studio' ? ['/campaigns/create'] : ['/campaigns/create', editor];
}

export function campaignEditPath(id: string, editor: CampaignEditor = DEFAULT_CAMPAIGN_EDITOR): string[] {
  return ['/campaigns', id, editor === 'simple-studio' ? 'edit' : editor];
}

// Deep link to a wizard step. Both editors read ?returnStep=<step>: the
// Wizard opens that step, the Studio selects that area (or opens publishing).
export function campaignStepLink(id: string, step: number, editor: CampaignEditor = DEFAULT_CAMPAIGN_EDITOR): { commands: string[]; queryParams: { returnStep: number } } {
  return { commands: campaignEditPath(id, editor), queryParams: { returnStep: step } };
}
