import type { Page } from '@playwright/test';
import type { MockApi } from './mock-api';

// A draft campaign with a known block tree for the Studio suite (bilingual
// roadmap Phase 6). Hebrew values are campaign *content*. Saves are answered
// here and recorded, so a test can compare the draft the Studio would save.
export const STUDIO_ID = '5d6e7f80-0000-4000-8000-000000000006';

const container = (childBlockIds: string[]) => ({
  childBlockIds, backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 16, gap: 16, direction: 'row', splitPercent: 50,
});

export const STUDIO_BLOCKS = [
  { id: 'b-story', type: 'rich-text', order: 0, visible: true, label: 'הסיפור שלנו', spacingTop: 0, spacingBottom: 0, data: { content: '<p>טקסט הסיפור של קמפיין הבדיקות.</p>' } },
  { id: 'b-donate', type: 'donation-widget', order: 1, visible: true, label: 'תיבת תרומה', spacingTop: 0, spacingBottom: 0,
    data: { title: 'תמכו עכשיו', subtitle: 'כל תרומה מקרבת אותנו ליעד', ctaLabel: 'תרמו עכשיו', ctaColor: '', ctaIcon: '', showSecurityBadge: true, showPaymentLogos: true, paymentLogos: ['visa', 'mastercard'] } },
  { id: 'b-frame', type: 'container', order: 2, visible: true, label: 'מסגרת שתי עמודות', spacingTop: 0, spacingBottom: 0, data: container(['b-left', 'b-right']) },
  { id: 'b-left', type: 'rich-text', order: 0, visible: true, label: 'עמודה ראשונה', spacingTop: 0, spacingBottom: 0, data: { content: '<p>עמודה ראשונה</p>' } },
  { id: 'b-right', type: 'rich-text', order: 1, visible: true, label: 'עמודה שנייה', spacingTop: 0, spacingBottom: 0, data: { content: '<p>עמודה שנייה</p>' } },
  { id: 'b-closing', type: 'rich-text', order: 3, visible: true, label: 'סיום', spacingTop: 0, spacingBottom: 0, data: { content: '<p>תודה רבה לכל התורמים.</p>' } },
];

export const STUDIO_ROW = {
  id: STUDIO_ID,
  slug: 'e2e-studio',
  title: 'קמפיין הסטודיו',
  short_description: 'דף לבדיקת עורך הסטודיו.',
  entity_id: 'e2e-entity-1',
  entity_name: 'עמותת הבדיקות',
  entity_logo: null,
  status: 'draft',
  campaign_lifecycle: 'one-time',
  funding_type: 'flexible',
  target_amount: 50000,
  current_amount: 0,
  supporters_count: 0,
  cover_image_url: null,
  campaign_logo_url: null,
  start_date: '2026-11-01',
  end_date: '2026-12-31',
  created_at: '2026-11-01T09:00:00.000Z',
  updated_at: '2026-11-01T09:00:00.000Z',
  suggested_amounts: [50, 100, 180],
  monthly_amounts: [],
  allow_custom_amount: true,
  allow_monthly_donation: false,
  enable_suggested_amounts: true,
  rewards: [],
  sponsors: [],
  updates: [],
  ambassadors: [],
  registration_options: [],
  blocks: STUDIO_BLOCKS,
  category: 'education',
  manager_name: 'דנה בדיקה',
  show_logo: true,
};

export interface StudioSaves { bodies: Record<string, any>[] }

export function installStudio(api: MockApi, row: Record<string, any> = STUDIO_ROW): StudioSaves {
  const saves: StudioSaves = { bodies: [] };
  let stored: Record<string, any> = JSON.parse(JSON.stringify(row));
  api.get('/api/campaigns/:id', (req) => (req.params.id === STUDIO_ID ? JSON.parse(JSON.stringify(stored)) : { __status: 404, body: { error: 'not found' } }));
  api.patch('/api/campaigns/:id', (req) => {
    saves.bodies.push(req.body as Record<string, any>);
    stored = { ...stored, ...(req.body as object) };
    return JSON.parse(JSON.stringify(stored));
  });
  api.get('/api/campaigns/check-slug/:slug', { available: true });
  return saves;
}

export async function openStudioTree(page: Page): Promise<void> {
  const props = page.locator('.props-panel.panel--overlay .panel-toggle');
  if (await props.count()) await props.click();
  const toggle = page.locator('.tree-panel .panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

export async function closeStudioOverlays(page: Page): Promise<void> {
  for (const panel of ['props', 'tree']) {
    const overlay = page.locator(`.${panel}-panel.panel--overlay .panel-toggle`);
    if (await overlay.count()) await overlay.click();
  }
}

export async function studioContentLanguage(page: Page, lang: 'he' | 'en'): Promise<void> {
  const propsWasOpen = await page.locator('.props-panel.panel--overlay').count() > 0;
  await closeStudioOverlays(page);
  await page.locator(`.clb-opt[data-lang="${lang}"]`).click();
  if (propsWasOpen) await page.locator('.props-panel .panel-toggle').click();
}

export async function openStudioProperties(page: Page): Promise<void> {
  const tree = page.locator('.tree-panel.panel--overlay .panel-toggle');
  if (await tree.count()) await tree.click();
  const toggle = page.locator('.props-panel .panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
