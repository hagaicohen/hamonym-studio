import { of } from 'rxjs';
import { welcomeGuard } from './core/guards/welcome.guard';
import { EntitiesService } from './core/services/entities.service';
import { CurrentEntityService } from './core/services/current-entity.service';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authGuard } from './core/guards/auth.guard';
import { contextGuard } from './core/guards/context.guard';
import { WelcomeComponent } from './modules/onboarding/pages/welcome/welcome.component';

@Component({ standalone: true, template: '' })
class RouteStub {}

const routes: Routes = [
  { path: '', pathMatch: 'full', component: WelcomeComponent, canActivate: [welcomeGuard] },
  { path: 'welcome', component: WelcomeComponent, canActivate: [welcomeGuard] },
  { path: 'login', component: RouteStub },
  { path: 'campaigns/discover', component: RouteStub },
  { path: 'campaigns/:slug/view', component: RouteStub },
  { path: 'campaigns/:slug', component: RouteStub },
  { path: 'organization-registration', component: RouteStub, canActivate: [authGuard] },
  { path: 'my-donations', component: RouteStub, canActivate: [authGuard] },
  { path: 'platform/collection-ops', component: RouteStub, canActivate: [contextGuard] },
];
describe('Public landing routing', () => {
  let storage: Record<string, string>;
  beforeEach(() => {
    storage = {};
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(),
      { provide: EntitiesService, useValue: { getMyEntities: () => of({ entities: [] }) } },
      { provide: CurrentEntityService, useValue: { setEntity: () => {}, setRole: () => {} } }] });
  });

  for (const authenticated of [false, true]) {
    it(`keeps ${authenticated ? 'authenticated' : 'anonymous'} visitors at root`, async () => {
      if (authenticated) storage['token'] = 'test';
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/');
      expect(TestBed.inject(Router).url).toBe('/');
    });
  }

  for (const url of ['/welcome', '/campaigns/discover', '/campaigns/public-campaign', '/campaigns/public-campaign/view']) {
    it(`allows anonymous access to ${url}`, async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe(url);
    });
  }

  for (const url of ['/organization-registration', '/my-donations', '/platform/collection-ops?tab=masav']) {
    it(`protects ${url} and preserves its return URL`, async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      const router = TestBed.inject(Router);
      expect(router.url.split('?')[0]).toBe('/login');
      expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(url);
    });
  }

  it('reuses the original three-option welcome page at root', async () => {
    const component = TestBed.createComponent(WelcomeComponent);
    component.detectChanges();
    expect(component.nativeElement.querySelectorAll('.welcome-card').length).toBe(3);
    component.destroy();
  });
});



