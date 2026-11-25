/** Contracts between the wizard and the (still legacy) campaign core. */

export type CampaignKind = 'donation' | 'race' | 'simple';
export type Device = 'desktop' | 'mobile';

export interface StoryNode {
  id?: string;
  type: string;
  value?: string;
  layout?: string;
  mobileLayout?: string;
  storyWizardLeadV0170?: boolean;
  children?: StoryNode[];
  [key: string]: unknown;
}

export interface Reward {
  name?: string; amount?: number; description?: string; image?: string;
  recommended?: boolean; stockEnabled?: boolean; quantity?: number;
  [key: string]: unknown;
}

export interface DonationAmount { id?: string; amount: number; kind?: string; months?: number; label?: string; }

export interface Category { id: string; label: string; icon: string; sub: string[]; }

export interface EntryWizardState {
  step: number;
  status: 'draft' | 'complete';
  version?: number;
  noEndDate?: boolean;
  categoryId?: string;
  completedAt?: string;
  editExistingDemo?: boolean;
  demoCompleteAt?: string;
  mobileCoreNavMigrationV0193?: boolean;
}

/** The parts of the campaign state the wizard reads and writes. */
export interface WizardCampaign {
  template: string;
  visible: Record<string, boolean>;
  content: {
    hero: {
      title: string; subtitle: string; image?: string; video?: string; mediaType?: string;
      showText?: boolean; showTextMobile?: boolean; orgLogo?: string; showOrgLogo?: boolean; slides?: string[];
    };
    title: { title: string; subtitle: string; description: string; showSubtitleMobile?: boolean };
    campaignInfo: {
      manager: string; role?: string; location?: string; category?: string; subcategory?: string; photo?: string;
      endAt?: string; showLocation?: boolean; showManager?: boolean; showCategory?: boolean; showCountdown?: boolean;
    };
    stats: { raised: number; donors: number; goal: number; showDays?: boolean };
    share: { url?: string };
    donate: { boxAmounts: DonationAmount[]; boxAllowOther?: boolean };
    rewards: { items?: Reward[] };
    story: { blocks?: StoryNode[] };
  };
  management: {
    campaignKind?: CampaignKind;
    entryWizard?: EntryWizardState;
    organizerName?: string;
    organizer?: { logoUrl?: string };
    organization?: { logoUrl?: string };
    organizerLogo?: string;
    fullCampaignTemplate?: string;
    heroStatsCard?: { enabled?: boolean; shape?: string };
    managerSource?: string;
    simpleDonation?: { identityMode?: string; showHeroImage?: boolean; showFrequency?: boolean };
    donations?: { monthlyEnabled?: boolean; monthlyPeriod?: string; monthlyCount?: number };
    funding?: { duration?: string; [key: string]: unknown };
    modules?: Record<string, { items?: unknown[]; enabled?: boolean; visible?: boolean } | undefined>;
    demoFixtureSeedV0190?: boolean;
    storyLeadMigrationV0170?: boolean;
    [key: string]: unknown;
  };
}

export interface SimpleVisualSettings { identityMode?: string; showHeroImage?: boolean | null; }

/** Bridge object published by the core engine (window.hamAngularWizardContext). */
export interface WizardContext {
  readState(): WizardCampaign;
  defaults(): WizardCampaign;
  templates: Record<string, unknown>;
  img: string;
  persist(): void;
  render(): void;
  renderPreview(): void;
  toast(message: string): void;
  device(): Device;
  setDevice(device: Device): void;
  sbNew(type: string): StoryNode;
  sbOpen(): void;
  sbMigrateLegacyWizardLead?(): void;
  categoryByLabel(label: string): Category | undefined;
  campaignCategoryCatalog: Category[];
  solidCategoryIcon(icon: string, px: number): string;
  chooseCampaignCategory(id: string, sub?: string): Category | undefined;
  hamSimpleVisualSettings(): SimpleVisualSettings;
  hamSimpleFlowState: { frequency?: string };
  resetHeroSlideKey(): void;
  confirmField(path: string, source: string): void;
  huFormatAmount(value: unknown): string;
  huReadAmount(value: unknown): number;
}

export interface WizardCheck { label: string; ok: boolean; step: number; }

export interface WizardStoryImage { src: string; path: string; alt: string; }

export interface WizardReward {
  name: string; amount: number; description: string; image: string; imageSrc: string;
  recommended: boolean; stockEnabled: boolean; quantity: number; expanded: boolean;
}

export type UploadTarget = 'hero' | 'logo' | 'slide' | 'story' | 'manager' | { reward: number };

export const STEP_PARTS = [
  { title: 'פרטי הקמפיין', sub: 'מתחילים בשם ובכמה מילים על המטרה' },
  { title: 'תמונת פתיחה או וידאו', sub: 'כך ייראה החלק הראשון בדף' },
  { title: 'סיפור הפרויקט', sub: 'כאן מספרים את הסיפור שלכם, בשפה שלכם' },
  { title: 'תרומות ותשורות', sub: 'מגדירים יעד וסכומים מוצעים, וניתן להוסיף תשורות' },
  { title: 'מנהל הקמפיין', sub: 'פרטי האדם שמוביל את הקמפיין' },
  { title: 'הקמפיין הראשוני מוכן', sub: 'בודקים שהפרטים החיוניים הושלמו' }
];
