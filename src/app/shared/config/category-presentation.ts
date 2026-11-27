import { solidIcon } from '../../modules/campaigns/simple-studio/vendor-v462/core/category-catalog';
import { CAMPAIGN_CATEGORY_CATALOG } from './campaign-categories';
import { ENTITY_CATEGORIES, EntityCategory } from './entity-categories';
export { ENTITY_CATEGORIES } from './entity-categories';
export { CAMPAIGN_CATEGORY_CATALOG } from './campaign-categories';

export interface CategoryOption extends EntityCategory { icon?: string; emoji?: string; sub?: string[]; }

// Presentation metadata only: no IDs, business classifications or saved values are changed.
const EMOJI: Record<string, string> = {
  music: '🎵', 'songwriting-composition': '🎼', 'music-production': '🎛️', 'recording-studios': '🎙️',
  'live-performances': '🎤', 'artists-bands': '🎸', 'music-education': '🎓', 'instrument-vocal-lessons': '🎹',
  'music-album-sales': '💿', 'musical-instruments-equipment': '🎸', 'audio-sound-services': '🎧', 'music-content-subscriptions': '🎵',
  'aid-support': '🤝', animals: '🐾', art: '🎨', 'content-creators': '🎬', culture: '🎭', education: '🎓',
  environment: '🌱', entrepreneurship: '💡', 'foreign-security': '🛡️', health: '🩺', history: '🏛️',
  'holocaust-memory': '🕯️', 'human-rights': '⚖️', 'independent-creators': '🎨', 'independent-journalism': '📰',
  judaism: '🕎', 'law-justice': '⚖️', lifestyle: '🌿', 'literature-books': '📚', 'mental-health': '🧠',
  'military-security': '🛡️', nature: '🌳', 'politics-government': '🏛️', 'political-system': '🏛️',
  'public-policy': '📋', 'quality-of-life': '🌿', religion: '🙏', 'rescue-memory': '🕯️', 'science-technology': '🔬',
  'social-change': '🤝', sports: '⚽', settlement: '🏡', agriculture: '🌾', 'youth-movements': '🧒',
  'security-rescue': '🚑', 'soldiers-reservists': '🛡️', 'bereaved-families': '🕯️', 'heritage-commemoration': '🏛️',
  communities: '🏘️', 'employment-training': '💼', 'immigrant-absorption': '🌍', 'disabilities-accessibility': '♿',
  'food-security': '🥣', housing: '🏠', 'research-development': '🔬', other: '🏷️',
};
const ICON_EMOJI: Record<string, string> = {
  'hand-holding-heart': '🤝', 'bowl-food': '🥣', 'heart-pulse': '🩺', brain: '🧠', wheelchair: '♿',
  'graduation-cap': '🎓', children: '🧒', 'people-roof': '👪', house: '🏠', 'people-group': '🏘️',
  'hands-praying': '🙏', 'truck-medical': '🚑', 'shield-halved': '🛡️', monument: '🏛️',
  'scale-balanced': '⚖️', bullhorn: '📣', paw: '🐾', leaf: '🌱', 'masks-theater': '🎭',
  flask: '🔬', futbol: '⚽', briefcase: '💼', 'earth-asia': '🌍', 'hands-holding-circle': '🤝',
  palette: '🎨', 'book-open': '📚', seedling: '🌾', music: '🎵',
};
export function categoryLabel(category: CategoryOption): string {
  return ENTITY_CATEGORIES.find(item => item.id === category.id)?.label || category.label;
}
export function categoryEmoji(category: CategoryOption): string {
  return EMOJI[category.id] || category.emoji || ICON_EMOJI[category.icon || ''] || '🏷️';
}

export function categorySolidIcon(option: CategoryOption) {
  const label = option.label.trim().toLocaleLowerCase();
  const purpose = CAMPAIGN_CATEGORY_CATALOG.find(category => category.id === option.id)
    ?? CAMPAIGN_CATEGORY_CATALOG.find(category => [category.label, ...category.sub].some(name => name.trim().toLocaleLowerCase() === label));
  return solidIcon(option.icon || purpose?.icon || 'ellipsis');
}
