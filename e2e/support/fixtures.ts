import { test as base, expect, type Page } from '@playwright/test';
import { MockApi, installNetwork } from './mock-api';
import { buildBackend, type Persona } from './backend';

export type HmLang = 'he' | 'en';
export interface HmOptions { hmLang: HmLang }

// Frozen clock: every page sees the same "now", so relative dates and greetings are stable.
export const FIXED_NOW = new Date('2026-11-05T10:30:00+02:00');

export const test = base.extend<HmOptions & { api: MockApi; persona: Persona; openAs: (persona: Persona, path: string, setup?: (api: MockApi) => void) => Promise<void> }>({
  hmLang: ['he', { option: true }],
  persona: ['anonymous', { option: true }],
  api: async ({ page, baseURL }, use) => {
    const api = new MockApi();
    await installNetwork(page, api, baseURL!);
    await use(api);
  },
  openAs: async ({ page, api, hmLang }, use) => {
    // setup: extra fixtures for one suite, defined after (so winning over) the shared backend.
    await use(async (persona: Persona, path: string, setup?: (api: MockApi) => void) => {
      buildBackend(api, persona);
      setup?.(api);
      await prepare(page, persona, hmLang);
      await page.goto(path);
      await settle(page, api);
    });
  },
});

export { expect };
export type { Page } from '@playwright/test';

// Waits until no new API call has been made for `quietMs` (the app polls some
// endpoints, so 'networkidle' never arrives), then fonts and images.
export async function settle(page: Page, api: MockApi, quietMs = 700, maxMs = 15_000): Promise<void> {
  await page.waitForLoadState('load');
  // A quiet network before Angular's lazy initial route activates is not readiness.
  await page.locator('app-root > router-outlet + *').waitFor({ state: 'attached', timeout: 30_000 });
  const start = Date.now();
  let seen = -1;
  let stableSince = Date.now();
  while (Date.now() - start < maxMs) {
    if (api.calls.length !== seen) { seen = api.calls.length; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= quietMs) break;
    await page.waitForTimeout(100);
  }
  // The global loader keeps a 600ms minimum on screen; never capture underneath it.
  await page.locator('.app-loader-overlay').waitFor({ state: 'detached', timeout: 30_000 });
  // Pages also show their own short "Loading..." state; never capture it.
  await page.waitForFunction(() => !/טוען\.\.\.|Loading\.\.\./.test(document.body.innerText), undefined, { timeout: 30_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))));
  });
  await page.waitForTimeout(150);
}

async function prepare(page: Page, persona: Persona, lang: HmLang): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  const storage = storageFor(persona);
  await page.addInitScript(({ storage, lang }) => {
    // Runs before every navigation; only seed once per test so in-app changes survive reloads.
    if (sessionStorage.getItem('hm.e2e.seeded')) return;
    sessionStorage.setItem('hm.e2e.seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    if (lang === 'en') localStorage.setItem('hm.ui.lang', 'en');
  }, { storage, lang });
}

const ENTITY = { id: 'e2e-entity-1', display_name: 'עמותת הבדיקות', legal_name: 'עמותת הבדיקות (ע"ר)', entity_type: 'association', status: 'active' };
const USER = { id: 9001, email: 'manager@e2e.test', full_name: 'דנה בדיקה', role_id: 2 };
const ADMIN = { id: 9002, email: 'admin@e2e.test', full_name: 'אדמין בדיקה', role_id: 1 };

function storageFor(persona: Persona): Record<string, string> {
  if (persona === 'anonymous') return {};
  const entityGroup = {
    role: 'entity-manager', label: 'הגופים שלי', icon: 'building',
    contexts: [{ id: ENTITY.id, name: ENTITY.display_name, entityType: ENTITY.entity_type }],
  };
  const common = {
    token: 'e2e-token-not-a-real-jwt',
    userRoles_v1: JSON.stringify([entityGroup]),
    currentContext_v1: JSON.stringify({ role: 'entity-manager', roleLabel: 'מנהל עמותה', roleIcon: 'building', context: entityGroup.contexts[0] }),
    currentEntity: JSON.stringify(ENTITY),
    currentRole: 'admin',
    hasEntities: 'true',
  };
  if (persona === 'manager') return { ...common, user: JSON.stringify(USER) };
  return {
    ...common,
    user: JSON.stringify(ADMIN),
    isSuperAdmin: 'true',
    adminMode: 'true',
    platformPermissions: JSON.stringify(['organizations', 'campaigns', 'users', 'donations', 'finance', 'settings']),
  };
}

export const E2E = { ENTITY, USER, ADMIN };
