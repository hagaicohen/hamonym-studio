import { PresetId } from '../../services/campaign-studio-state.service';

export interface RegistrationFieldSuggestion {
  icon: string;
  label: string;
}

// A Preset is a lookup table only — labels/defaults/copy. It never changes
// the data model or locks a capability (§ CAMPAIGN_PRESETS_VISION.md §0/§4).
// 'general' is the safety net: exactly today's behavior, unchanged.
export interface CampaignPreset {
  id: PresetId;
  icon: string;
  name: string;
  // Always visible on the picker card. Answers "when should I pick this?" in
  // product language — never describe implementation/config similarity
  // between presets (e.g. "same as X today"); that's true only until it
  // isn't, and it's not how an entity manager thinks about the choice anyway.
  description: string;
  // Registration Options step (Builder) copy — always available regardless
  // of preset (Preset ≠ Builder), these just tune the wording/suggestions.
  registrationStepTitle: string;
  registrationStepSubtitle: string;
  registrationAddButtonLabel: string;
  // Suggestions for CampaignDraft.registrationFieldLabel — the entity manager
  // names the concept themselves (route/tier/ticket/...), these are just
  // clickable examples. See DECISIONS.md (2026-07-16).
  registrationFieldLabelSuggestions: RegistrationFieldSuggestion[];
}

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    id: 'donation',
    icon: '🩵',
    name: 'קמפיין תרומות',
    description: 'מתאים לרוב קמפייני גיוס הכספים. כולל תהליך תרומה רגיל עם אפשרות להוסיף תשורות.',
    registrationStepTitle: 'הרשמה',
    registrationStepSubtitle: 'אם בקמפיין שלכם יש גם הרשמה (למשל לאירוע), אפשר להגדיר כאן את אפשרויות ההרשמה',
    registrationAddButtonLabel: '+ הוסף אפשרות הרשמה',
    registrationFieldLabelSuggestions: [
      { icon: '👤', label: 'סוג משתתף' },
      { icon: '🎫', label: 'כרטיס' },
    ],
  },
  {
    id: 'race',
    icon: '🏃',
    name: 'מירוץ',
    description: 'מתאים למירוצים ואירועי ספורט שבהם המשתתפים נרשמים למסלולים ומשלמים דמי הרשמה.',
    registrationStepTitle: 'רישום משתתפים למירוץ',
    registrationStepSubtitle: 'הוסיפו את אפשרויות ההרשמה שמשתתפים יוכלו לבחור מהן (למשל מסלולים שונים)',
    registrationAddButtonLabel: '+ הוסף אפשרות הרשמה',
    registrationFieldLabelSuggestions: [
      { icon: '🏃', label: 'מסלול' },
      { icon: '🎫', label: 'כרטיס' },
      { icon: '👤', label: 'סוג משתתף' },
    ],
  },
  {
    id: 'general',
    icon: '📄',
    name: 'קמפיין כללי',
    description: 'התחילו מקמפיין בסיסי ובנו אותו כרצונכם. מתאים למקרים שאינם נכנסים לתבניות המוכנות.',
    registrationStepTitle: 'הרשמה',
    registrationStepSubtitle: 'אם בקמפיין שלכם יש גם הרשמה, אפשר להגדיר כאן את אפשרויות ההרשמה',
    registrationAddButtonLabel: '+ הוסף אפשרות הרשמה',
    registrationFieldLabelSuggestions: [
      { icon: '👤', label: 'סוג משתתף' },
      { icon: '🎫', label: 'כרטיס' },
      { icon: '🏷', label: 'קטגוריה' },
    ],
  },
];

const BY_ID: Record<PresetId, CampaignPreset> = Object.fromEntries(
  CAMPAIGN_PRESETS.map(p => [p.id, p])
) as Record<PresetId, CampaignPreset>;

export function getPreset(id: PresetId | undefined): CampaignPreset {
  return BY_ID[id ?? 'general'];
}
