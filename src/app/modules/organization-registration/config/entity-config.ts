export type EntityType =
  | 'association'
  | 'chalatz'
  | 'political_party_new'
  | 'political_party_registered'
  | 'sole_exempt'
  | 'sole_registered';

export interface EntityConfig {
  type: EntityType;

  labels: {
    entity: string;

    entityName: string;

    registrationNumber: string;

    registrationDocument: string;

    onboardingTitle: string;
  };

  showSection46: boolean;
}

export const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
  association: {
    type: 'association',

    labels: {
      entity: 'עמותה',

      entityName: 'שם העמותה',

      registrationNumber: 'מספר עמותה',

      registrationDocument: 'תעודת התאגדות',

      onboardingTitle: 'הצטרפות כעמותה',
    },

    showSection46: true,
  },

  chalatz: {
    type: 'chalatz',

    labels: {
      entity: 'חל״צ',

      entityName: 'שם החל״צ',

      registrationNumber: 'מספר חל״צ',

      registrationDocument: 'תעודת התאגדות',

      onboardingTitle: 'הצטרפות כחל״צ',
    },

    showSection46: false,
  },

  political_party_new: {
    type: 'political_party_new',

    labels: {
      entity: 'מפלגה פוליטית חדשה',

      entityName: 'שם המפלגה',

      registrationNumber: '',

      registrationDocument: 'מסמכי הקמה',

      onboardingTitle: 'הקמת מפלגה פוליטית',
    },

    showSection46: false,
  },

  political_party_registered: {
    type: 'political_party_registered',

    labels: {
      entity: 'מפלגה פוליטית רשומה',

      entityName: 'שם המפלגה',

      registrationNumber: '',

      registrationDocument: 'תעודת רישום מפלגה',

      onboardingTitle: 'הצטרפות כמפלגה פוליטית',
    },

    showSection46: false,
  },

  sole_exempt: {
    type: 'sole_exempt',

    labels: {
      entity: 'עוסק פטור',

      entityName: 'שם העסק',

      registrationNumber: 'מספר עוסק',

      registrationDocument: 'תעודת עוסק',

      onboardingTitle: 'הצטרפות כעוסק פטור',
    },

    showSection46: false,
  },

  sole_registered: {
    type: 'sole_registered',

    labels: {
      entity: 'עוסק מורשה',

      entityName: 'שם העסק',

      registrationNumber: 'מספר עוסק',

      registrationDocument: 'תעודת עוסק',

      onboardingTitle: 'הצטרפות כעוסק מורשה',
    },

    showSection46: false,
  },
};
