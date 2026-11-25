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
    name: 'builder.presets.donation.name',
    description: 'builder.presets.donation.description',
    registrationStepTitle: 'builder.presets.donation.registrationStepTitle',
    registrationStepSubtitle: 'builder.presets.donation.registrationStepSubtitle',
    registrationAddButtonLabel: 'builder.presets.donation.registrationAddButtonLabel',
    registrationFieldLabelSuggestions: [
      { icon: '👤', label: 'סוג משתתף' },
      { icon: '🎫', label: 'כרטיס' },
    ],
  },
  {
    id: 'race',
    icon: '🏃',
    name: 'builder.presets.race.name',
    description: 'builder.presets.race.description',
    registrationStepTitle: 'builder.presets.race.registrationStepTitle',
    registrationStepSubtitle: 'builder.presets.race.registrationStepSubtitle',
    registrationAddButtonLabel: 'builder.presets.race.registrationAddButtonLabel',
    registrationFieldLabelSuggestions: [
      { icon: '🏃', label: 'מסלול' },
      { icon: '🎫', label: 'כרטיס' },
      { icon: '👤', label: 'סוג משתתף' },
    ],
  },
  {
    id: 'general',
    icon: '📄',
    name: 'builder.presets.general.name',
    description: 'builder.presets.general.description',
    registrationStepTitle: 'builder.presets.general.registrationStepTitle',
    registrationStepSubtitle: 'builder.presets.general.registrationStepSubtitle',
    registrationAddButtonLabel: 'builder.presets.general.registrationAddButtonLabel',
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
