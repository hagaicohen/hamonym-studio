import { defineConfig, devices } from '@playwright/test';
import type { HmOptions } from './e2e/support/fixtures';

// Bilingual (he/en) regression suite — docs/BILINGUAL-I18N-ROADMAP.md §8.
// The app runs from `ng serve` (development configuration). Every backend call is
// answered by e2e/support/mock-api.ts fixtures; the production API host and every
// other external host are blocked, so no test can reach production data.
// A dedicated port; another local project already uses 4300.
const PORT = Number(process.env.HM_E2E_PORT || 4317);

const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

const project = (lang: 'he' | 'en', size: keyof typeof viewports) => ({
  name: `${lang}-${size}`,
  use: {
    ...devices['Desktop Chrome'],
    viewport: viewports[size],
    isMobile: false,
    hasTouch: size === 'mobile',
    deviceScaleFactor: 1,
    hmLang: lang,
  },
});

export default defineConfig<HmOptions>({
  testDir: './e2e',
  // Developer tools (API discovery) run only on request: HM_E2E_TOOLS=1.
  testIgnore: process.env.HM_E2E_TOOLS ? [] : ['**/tools/**'],
  outputDir: './test-results/playwright',
  // Text snapshots are platform-independent; screenshots depend on font rendering, so they are per platform.
  snapshotPathTemplate: '{testDir}/__baselines__/text/{projectName}/{arg}{ext}',
  fullyParallel: true,
  // ng serve stalls when several browsers load its unoptimized chunks at once; one worker is reliable.
  workers: Number(process.env.HM_E2E_WORKERS || 1),
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide', scale: 'css',
      pathTemplate: '{testDir}/__baselines__/screens/{platform}/{projectName}/{arg}{ext}',
    },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: './test-results/playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    project('he', 'desktop'),
    project('he', 'tablet'),
    project('he', 'mobile'),
    project('en', 'desktop'),
    project('en', 'tablet'),
    project('en', 'mobile'),
  ],
  webServer: {
    command: `npx ng serve --configuration development --port ${PORT} --no-hmr --no-live-reload`,
    url: `http://localhost:${PORT}`,
    // Reuse only when explicitly asked (HM_E2E_REUSE=1 with this app already served on PORT),
    // so the suite never silently tests a different app that happens to hold the port.
    reuseExistingServer: process.env.HM_E2E_REUSE === '1',
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
