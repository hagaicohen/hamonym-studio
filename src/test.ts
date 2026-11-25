// Karma entry point: the Angular default test environment, plus real
// translations for every TestBed (src/testing/i18n-testing.ts).
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { HmI18nTestingModule } from './testing/i18n-testing';
import { NgModule } from '@angular/core';
import { STUDIO_NARROW_VIEWPORT } from './app/modules/campaigns/studio/services/studio-viewport';

// Karma's browser frame is phone-narrow; the Studio specs exercise the desktop
// layout (the narrow layout is covered by the Playwright mobile projects).
@NgModule({ providers: [{ provide: STUDIO_NARROW_VIEWPORT, useValue: () => false }] })
class HmTestViewportModule {}

getTestBed().initTestEnvironment(
  [BrowserDynamicTestingModule, HmI18nTestingModule, HmTestViewportModule],
  platformBrowserDynamicTesting(),
  { teardown: { destroyAfterEach: true } },
);
