import type { MockApi } from './mock-api';
import { STUDIO_ROW } from './studio';

// A published campaign with a complete, published English version (bilingual
// roadmap D-38 … D-45). Hebrew stays in the regular fields; English is the overlay.
export const BI_SLUG = 'e2e-bilingual';
export const BI_EN_TITLE = 'The Studio campaign';

export const COMPLETE_EN: Record<string, string> = {
  title: BI_EN_TITLE,
  shortDescription: 'A page for testing the Studio editor.',
  managerName: 'Dana Test',
  'blocks#b-story.label': 'Our story',
  'blocks#b-story.data.content': '<p>The story text of the test campaign.</p>',
  'blocks#b-donate.data.title': 'Support now',
  'blocks#b-donate.data.subtitle': 'Every donation brings us closer to the goal',
  'blocks#b-donate.data.ctaLabel': 'Donate now',
  'blocks#b-left.label': 'First column',
  'blocks#b-left.data.content': '<p>First column</p>',
  'blocks#b-right.label': 'Second column',
  'blocks#b-right.data.content': '<p>Second column</p>',
  'blocks#b-closing.label': 'Closing',
  'blocks#b-closing.data.content': '<p>Thank you to all donors.</p>',
};

export const bilingualRow = (published = true, values = COMPLETE_EN) => ({
  ...JSON.parse(JSON.stringify(STUDIO_ROW)),
  slug: BI_SLUG,
  status: 'published',
  published_at: '2026-11-01T09:00:00.000Z',
  current_amount: 1200,
  supporters_count: 7,
  // What the server returns publicly: an unpublished English version never leaves it.
  content_i18n: published ? { v: 1, en: { published: true, values } } : null,
});

export interface DonationCalls { bodies: Record<string, any>[] }

export function installBilingualPublic(api: MockApi, published = true, values = COMPLETE_EN): DonationCalls {
  const calls: DonationCalls = { bodies: [] };
  api.get('/api/campaigns/public/:slug', (req) => (req.params.slug === BI_SLUG ? bilingualRow(published, values) : { __status: 404, body: { error: 'not found' } }));
  api.get('/api/campaigns/:slug/ambassadors/public', { ambassadors: [] });
  api.get('/api/donations/campaign/:slug/live', { donations: [] });
  api.get('/api/donations/campaign/:slug/donors', { donors: [], total: 0 });
  api.get('/api/donations/campaign/:slug/reward-counts', { counts: {} });
  api.get('/api/campaigns/:slug/comments', { comments: [] });
  // A mock provider only: nothing is charged, the hosted page is blank.
  api.post('/api/donations', (req) => { calls.bodies.push(req.body as Record<string, any>); return { donationId: 'e2e-bi-donation', url: 'about:blank', lowProfileId: 'e2e-lp' }; });
  return calls;
}
