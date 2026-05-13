// src/app/modules/organization-registration/constants/campaign-types.ts

export interface CampaignTypeDefinition {
  id: string;

  title: string;

  description: string;
}

export const CAMPAIGN_TYPES: CampaignTypeDefinition[] = [
  {
    id: 'one-time',

    title: 'תרומות חד פעמיות',

    description: 'דף קמפיין לתרומות חד פעמיות',
  },

  {
    id: 'recurring',

    title: 'תרומות קבועות',

    description: 'דף עמותה לתורמים קבועים',
  },
];
