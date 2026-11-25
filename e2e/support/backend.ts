import type { MockApi } from './mock-api';
import { reply } from './mock-api';

export type Persona = 'anonymous' | 'manager' | 'admin';

// Fixture backend: deterministic, synthetic data only (no real organizations,
// donors or payments). Shapes follow the frontend services that consume them.
// Hebrew values are campaign/organization *data*, not interface text.
const ENTITY_ID = 'e2e-entity-1';
const CAMPAIGN_ID = '7c1e3b2a-5d4f-4a6b-9c8d-0e1f2a3b4c5d';
const CAMPAIGN_SLUG = 'e2e-campaign';

const iso = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:15:00.000Z`;

export const ENTITY = {
  id: ENTITY_ID,
  entity_type: 'association',
  legal_name: 'עמותת הבדיקות (ע"ר)',
  display_name: 'עמותת הבדיקות',
  registration_number: '580000000',
  email: 'office@e2e.test',
  phone: '03-0000000',
  website: 'https://e2e.test',
  description: 'עמותה לדוגמה לבדיקות אוטומטיות.',
  logo_url: null,
  status: 'active',
  is_profile_complete: true,
  primary_category: 'education',
  secondary_categories: ['culture'],
  campaign_types: ['one_time'],
  monthly_goal: 50000,
  yearly_goal: 600000,
  billing_provider: 'cardcom',
  cardcom_terminal_number: '1000',
  cardcom_api_username: 'e2e-user',
  cardcom_connection_status: 'verified',
  billing_method: 'card',
  billing_holder_name: 'דנה בדיקה',
  billing_card_last4: '4242',
  billing_card_expiry: '12/28',
  billing_status: 'active',
  contact_full_name: 'דנה בדיקה',
  contact_phone: '050-0000000',
  contact_email: 'manager@e2e.test',
  association_certificate_url: null,
  association_certificate_name: 'certificate.pdf',
  tax_document_url: null,
  tax_document_name: 'tax-46.pdf',
  created_at: '2026-06-01T09:00:00.000Z',
  approved_at: '2026-06-03T09:00:00.000Z',
  ai_access_enabled: false,
  is_visible: true,
};

const CAMPAIGN_ROW = {
  id: CAMPAIGN_ID,
  slug: CAMPAIGN_SLUG,
  title: 'קמפיין הבדיקות',
  short_description: 'גיוס לדוגמה לצורכי בדיקה.',
  entity_id: ENTITY_ID,
  entity_name: ENTITY.display_name,
  entity_logo: null,
  status: 'published',
  campaign_lifecycle: 'active',
  funding_type: 'keep_it_all',
  target_amount: 100000,
  current_amount: 42350,
  supporters_count: 128,
  cover_image_url: null,
  campaign_logo_url: null,
  start_date: '2026-10-01',
  end_date: '2026-12-31',
  created_at: '2026-09-20T09:00:00.000Z',
  updated_at: '2026-10-30T09:00:00.000Z',
  published_at: '2026-10-01T09:00:00.000Z',
  publish_requested_at: null,
  is_hidden: false,
  suggested_amounts: [50, 100, 180, 360],
  monthly_amounts: [36, 54, 100],
  allow_custom_amount: true,
  allow_monthly_donation: true,
  enable_suggested_amounts: true,
  rewards: [],
  rewards_enabled: false,
  sponsors: [],
  updates: [],
  ambassadors: [],
  blocks: [],
  registration_options: [],
  donor_fields: null,
  category: 'education',
  manager_name: 'דנה בדיקה',
  show_entity_name: true,
  show_logo: true,
  show_hero_title: true,
  show_hero_subtitle: true,
};

const DRAFT_ROW = { ...CAMPAIGN_ROW, id: '1b2c3d4e-0000-4000-8000-000000000002', slug: 'e2e-draft', title: 'טיוטת קמפיין', status: 'draft', campaign_lifecycle: 'draft', current_amount: 0, supporters_count: 0, published_at: null };

const DONATIONS = [
  { id: 'd-1', amount: 180, donor_name: 'נועה לוי', donor_email: 'noa@e2e.test', donor_phone: '050-1111111', status: 'paid', completed_at: iso(28), created_at: iso(28), is_anonymous: false, failure_reason: null, is_mock: false, campaign_title: CAMPAIGN_ROW.title, campaign_slug: CAMPAIGN_SLUG },
  { id: 'd-2', amount: 360, donor_name: 'אנונימי', donor_email: 'anon@e2e.test', donor_phone: '', status: 'paid', completed_at: iso(27), created_at: iso(27), is_anonymous: true, failure_reason: null, is_mock: false, campaign_title: CAMPAIGN_ROW.title, campaign_slug: CAMPAIGN_SLUG },
  { id: 'd-3', amount: 100, donor_name: 'יוסי כהן', donor_email: 'yossi@e2e.test', donor_phone: '052-2222222', status: 'failed', completed_at: null, created_at: iso(26), is_anonymous: false, failure_reason: 'הכרטיס נדחה', is_mock: false, campaign_title: CAMPAIGN_ROW.title, campaign_slug: CAMPAIGN_SLUG },
  { id: 'd-4', amount: 54, donor_name: 'Sarah Miller', donor_email: 'sarah@e2e.test', donor_phone: '', status: 'pending', completed_at: null, created_at: iso(25), is_anonymous: false, failure_reason: null, is_mock: false, campaign_title: CAMPAIGN_ROW.title, campaign_slug: CAMPAIGN_SLUG },
];

const DONORS = [
  { donor_key: 'k1', email: 'noa@e2e.test', phone: '050-1111111', display_name: 'נועה לוי', has_anonymous: false, total_donated: 540, donation_count: 3, first_donation_at: iso(2), last_donation_at: iso(28), campaigns_count: 1 },
  { donor_key: 'k2', email: 'sarah@e2e.test', phone: null, display_name: 'Sarah Miller', has_anonymous: false, total_donated: 54, donation_count: 1, first_donation_at: iso(25), last_donation_at: iso(25), campaigns_count: 1 },
];

const AMBASSADORS = [
  { id: 'a-1', campaign_id: CAMPAIGN_ID, full_name: 'רוני שגריר', phone: '050-3333333', email: 'roni@e2e.test', goal_amount: 5000, status: 'active', personal_message: '', personal_title: '', slug: 'roni', raised_online: 2100, raised_manual: 300, raised_total: 2400, donor_count: 14, created_at: iso(5), deactivated_at: null, campaign_title: CAMPAIGN_ROW.title, campaign_slug: CAMPAIGN_SLUG },
];

const PARTICIPANTS = [
  { id: 'p-1', name: 'אורי משתתף', option_key: '5k', option_title: '5 ק"מ', shirt_size: 'M', created_at: iso(20), payment_status: 'paid', payer_name: 'אורי משתתף', payer_email: 'uri@e2e.test', payer_phone: '050-4444444', campaign_id: CAMPAIGN_ID, campaign_title: CAMPAIGN_ROW.title },
];

const CAMPAIGN_PERF = [
  { id: CAMPAIGN_ID, title: CAMPAIGN_ROW.title, slug: CAMPAIGN_SLUG, status: 'published', cover_image_url: null, target_amount: 100000, current_amount: 42350, raised_in_range: 12400, donors_in_range: 37, supporters_count: 128, pct: 42.35, avg: 335, daily_pace: 413, days_remaining: 56, projected_total: 65478, created_at: '2026-09-20T09:00:00.000Z' },
];

const chartData = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, total: (i * 137) % 900 }));

export function buildBackend(api: MockApi, persona: Persona): void {
  api.get('/api/donations/currencies', { currencies: ['ILS'], recurringCurrencies: ['ILS'] });
  // ── organization / account ──
  api.get('/api/entities/my-partners', { partners: [{ id: 'e2e-partner-1', display_name: 'קפה הבדיקות', slug: 'e2e-partner', status: 'active', created_at: '2026-09-01T09:00:00.000Z' }] });
  api.get('/api/entities/my', { entities: persona === 'anonymous' ? [] : [ENTITY] });
  api.get('/api/entities/:id', () => ENTITY);
  api.get('/api/entities/:id/notifications', { notifications: [] });
  api.get('/api/entities/:id/approval-status', { status: 'active', updatedAt: '2026-06-03T09:00:00.000Z', comment: null, reasonTags: [], actionBy: 'צוות המונים' });
  api.get('/api/entities/:id/dashboard', {
    kpi: {
      fundraisingThisMonth: { total: 12400, pctChange: 18 },
      donationsThisMonth: { count: 37, pctChange: -4 },
      activeCampaigns: { active: 1, total: 2 },
      failedPayments: { count: 1, totalLost: 100 },
    },
    recentDonations: DONATIONS.filter((d) => d.status === 'paid').map((d) => ({ id: d.id, amount: d.amount, donor_name: d.donor_name, completed_at: d.completed_at, campaign_title: d.campaign_title })),
    failedPayments: [{ id: 'd-3', amount: 100, donor_name: 'יוסי כהן', updated_at: iso(26), campaign_title: CAMPAIGN_ROW.title }],
    topAmbassadors: [{ id: 'a-1', full_name: 'רוני שגריר', campaign_title: CAMPAIGN_ROW.title, raised_total: 2400, goal_amount: 5000 }],
    chartData,
    alerts: [],
    campaigns: [{ id: CAMPAIGN_ID, title: CAMPAIGN_ROW.title, status: 'published', slug: CAMPAIGN_SLUG, cover_image_url: null, current_amount: 42350, target_amount: 100000, supporters_count: 128, created_at: CAMPAIGN_ROW.created_at, end_date: '2026-12-31', funding_type: 'keep_it_all' }],
  });
  api.get('/api/entities/:id/ambassadors', { ambassadors: AMBASSADORS, kpi: { totalAmbassadors: 1, activeAmbassadors: 1, totalRaised: 2400, totalDonors: 14 }, campaigns: [{ id: CAMPAIGN_ID, title: CAMPAIGN_ROW.title }], total: 1 });

  // ── donations / donors / registrations / reports ──
  api.get('/api/donations/entity/:id', (req) => {
    // The paid-donation toast polls with status=paid&since=...; it must stay silent.
    if (req.query.get('since')) return { donations: [] };
    return { donations: DONATIONS, kpi: { totalRaised: 540, paidCount: 2, failedCount: 1, pendingCount: 1, avgAmount: 270, total: 4 }, campaigns: [{ id: CAMPAIGN_ID, title: CAMPAIGN_ROW.title }], total: DONATIONS.length };
  });
  api.get('/api/donations/entity/:id/donors', { donors: DONORS, kpi: { donorCount: 2, totalRaised: 594, avgPerDonor: 297 }, total: DONORS.length });
  api.get('/api/registrations/entity/:id', { participants: PARTICIPANTS, total: PARTICIPANTS.length });
  api.get('/api/reports/entity/:id/campaigns', { campaigns: CAMPAIGN_PERF, kpi: { totalCampaigns: 2, activeCampaigns: 1, totalRaised: 42350, totalRaisedInRange: 12400, totalDonorsInRange: 37, avgProgressPct: 42.35 } });

  // ── campaigns ──
  api.get('/api/campaigns/my', { campaigns: [CAMPAIGN_ROW, DRAFT_ROW] });
  api.get('/api/campaigns/my-ambassador-campaigns', []);
  api.get('/api/campaigns/:id', (req) => (req.params.id === DRAFT_ROW.id ? DRAFT_ROW : CAMPAIGN_ROW));
  api.get('/api/campaigns/public/:slug', (req) => (req.params.slug === CAMPAIGN_SLUG ? CAMPAIGN_ROW : reply(404, { error: 'not found' })));
  api.get('/api/donations/campaign/:slug/donors', {
    donors: [
      { id: 'pd-1', donor_name: 'נועה לוי', amount: 180, is_anonymous: false, completed_at: iso(28), message: null },
      { id: 'pd-2', donor_name: null, amount: 360, is_anonymous: true, completed_at: iso(27), message: null },
    ],
    topDonors: [],
  });
  api.get('/api/donations/campaign/:slug/reward-counts', { counts: {} });
  api.get('/api/campaigns/:slug/ambassadors/public', { ambassadors: [] });
  api.get('/api/comments/campaign/:slug', { comments: [] });
  api.get('/api/campaign-partners/public/:slug', { partners: [] });
  api.get('/api/donations/public/:ref', { id: 'e2e-donation-1', status: 'paid', amount: 180, donor_name: 'נועה לוי', campaign_title: CAMPAIGN_ROW.title, campaign_slug: CAMPAIGN_SLUG, completed_at: iso(28) });

  // ── invites ──
  api.get('/api/invites/:token', { email: 'invitee@e2e.test', entity_name: ENTITY.display_name, role: 'admin', status: 'pending' });

  // ── platform (super admin) ──
  api.get('/api/platform/notifications-count', { pendingReviewCount: 1, incompleteDraftsCount: 0, flaggedForReviewCount: 0 });
  api.get('/api/platform/dashboard/overview', {
    version: 1, generatedAt: '2026-11-05T08:30:00.000Z', period: { start: '2026-11-01', end: '2026-11-30' },
    kpis: { activeEntities: 3, activeCampaigns: 4, donationsMonth: 18450, newDonorsThisMonth: 21, feesOutstanding: 0, attentionCount: 1 },
    newDonors: [], trend: null, attention: [], activity: [],
  });
  api.get('/api/platform/organizations', {
    organizations: [{ id: ENTITY_ID, display_name: ENTITY.display_name, legal_name: ENTITY.legal_name, entity_type: 'association', status: 'active', registration_number: ENTITY.registration_number, created_at: ENTITY.created_at, campaigns_count: 2, total_raised: 42350, contact_email: ENTITY.contact_email }],
    total: 1, unfilteredTotal: 1,
  });
  // Remaining bilingual read-side screens: successful empty responses, not 404 placeholders.
  api.get('/api/donations/my', { donations: [] });
  api.get('/api/recurring/my', { instructions: [] });
  api.get('/api/campaigns/:id/ambassadors', { ambassadors: [] });
  api.get('/api/campaign-partners/campaign/:id', { partners: [] });
  api.get('/api/campaigns/discover', { campaigns: [], total: 0, page: 0, limit: 12 });
  api.get('/api/platform/campaigns', { campaigns: [CAMPAIGN_ROW], total: 1 });
  api.get('/api/platform/partners', { partners: [], total: 0 });
  api.get('/api/platform/users', { users: [], total: 0 });
  api.get('/api/platform/roles', { roles: [] });
  api.get('/api/platform/category-suggestions', { suggestions: [], counts: { pending: 0, approved: 0, rejected: 0 } });
  api.get('/api/platform/cardcom-ops/health', { jobs: [], alerts: [], webhooks: [], knownJobs: [], schedulerHeartbeat: { healthy: true } });
  api.get('/api/platform/cardcom-ops/findings', { findings: [] });
  api.get('/api/platform/cardcom-ops/donations', { donations: [], total: 0, page: 0, limit: 25 });
  api.get('/api/platform/billing-ops/periods', { periods: [] });
  api.get('/api/platform/billing-ops/runs', { runs: [] });
  api.get('/api/platform/billing-ops/statements', { statements: [] });
  api.get('/api/platform/billing-accounts/readiness', { entities: [] });
  api.get('/api/platform/billing-accounts/unprovisioned', { entities: [] });
  api.get('/api/platform/billing-settings', { setting: { vat_rate: '0.18', updated_at: '2026-11-01T09:00:00Z', updated_by: null } });
  api.get('/api/platform/simulation-clock', { simulationEnabled: false, overrideActive: false, collectionAuthorized: false, businessNow: '2026-11-05T08:30:00Z', realNow: '2026-11-05T08:30:00Z' });
  api.get('/api/platform/finance-ops/exceptions', { exceptions: [] });
  api.get('/api/platform/finance-ops/masav-proposals', { proposals: [] });
  api.get('/api/platform/collection-ops/needs-attention', { categories: [], totalCount: 0 });
  api.get('/api/platform/collection-ops/system-activity', { automatic: [], fin11Planned: [] });
  api.get('/api/platform/collection-ops/history', { statements: [] });
  api.get('/api/platform/collection-ops/report-preview', { rows: [] });
  api.get('/api/platform/collection-ops/overview', { overview: {
    period: { id: null, periodStart: '2026-11-01T00:00:00Z', periodEnd: '2026-11-28T18:00:00Z' },
    hasStatements: false, statementCount: null, totalBilled: null, paidConfirmed: null, inProcess: null, openBalance: null,
    carriedOverFromPriorPeriods: { statementCount: 0, outstandingTotal: 0 },
    accrued: { donationCount: 0, entitiesWithActivity: 0, grossRaised: 0, accruedFee: 0, accruedVat: 0, accruedTotal: 0, entitiesMissingAccount: [] },
    periodDonations: { donationCount: 0, grossRaised: 0 }, cutoffPassed: false, collectionAttempted: false,
    cardCollectionFailed: false, cardCollected: 0, masavCollected: 0, cardOutstanding: 0, masavOutstanding: 0,
  } });

}
