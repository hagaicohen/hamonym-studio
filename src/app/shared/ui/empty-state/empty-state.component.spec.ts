import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Routes } from '@angular/router';
import { of } from 'rxjs';
import { Handshake, LucideIconConfig } from 'lucide-angular';
import { EmptyStateComponent } from './empty-state.component';
import { HM_LUCIDE_GLOBAL_DEFAULTS, provideHmIconDefaults } from '../design-system/icons';
import { routes } from '../../../app.routes';
import { devOnlyGuard } from '../../../core/guards/dev-only.guard';
import { PartnersListPageComponent } from '../../../modules/campaigns/pages/partners-list-page/partners-list-page.component';
import { EntitiesService } from '../../../core/services/entities.service';

@Component({
  standalone: true, imports: [EmptyStateComponent],
  template: `
  <section dir="rtl" style="width:360px">
    <hm-empty-state id="full" [icon]="Handshake" title="אין שותפים עדיין" description="הסבר קצר" [headingLevel]="3">
      <button type="button">שותף חדש</button>
    </hm-empty-state>
    <hm-empty-state id="bare" size="compact" [icon]="Handshake" title="לא נמצאו תרומות"></hm-empty-state>
  </section>`,
})
class Host { readonly Handshake = Handshake; }

describe('Design system Phase 1A', () => {
  describe('hm-empty-state', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
    const q = (s: string) => fixture.nativeElement.querySelector(s) as HTMLElement;
    beforeEach(() => { fixture = TestBed.createComponent(Host); fixture.detectChanges(); });
    afterEach(() => fixture.destroy());

    it('renders an accessible heading, a decorative line icon and projected actions', () => {
      const title = q('#full .hm-es-title');
      expect(title.textContent!.trim()).toBe('אין שותפים עדיין');
      expect(title.getAttribute('role')).toBe('heading');
      expect(title.getAttribute('aria-level')).toBe('3');
      expect(q('#full .hm-es-icon').getAttribute('aria-hidden')).toBe('true');
      const svg = q('#full .hm-es-icon svg');
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('stroke-width')).toBe('1.75');
      expect(q('#full .hm-es-text').textContent!.trim()).toBe('הסבר קצר');
      expect(q('#full .hm-es-actions button')).toBeTruthy();
    });

    it('compact variant: smaller icon, default heading level, no empty description or action row', () => {
      expect(q('#bare .hm-es-title').getAttribute('aria-level')).toBe('2');
      expect(q('#bare .hm-es-icon svg').getAttribute('width')).toBe('20');
      expect(q('#bare .hm-es-text')).toBeNull();
      expect(getComputedStyle(q('#bare .hm-es-actions')).display).toBe('none');
    });

    it('uses the brand tokens, centers in RTL and fits a phone width', () => {
      const icon = getComputedStyle(q('#full .hm-es-icon'));
      expect(icon.color).toBe('rgb(88, 60, 214)');
      expect(icon.width).toBe('56px');
      expect(getComputedStyle(q('#full .hm-es')).direction).toBe('rtl');
      expect(q('#full .hm-es').getBoundingClientRect().width).toBeLessThanOrEqual(360);
    });
  });

  it('defines the design tokens without changing the form-control tokens', () => {
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--hm-color-primary').trim()).toBe('#583cd6');
    expect(root.getPropertyValue('--hm-brand-secondary').trim()).toBe('#7c3aed');
    expect(root.getPropertyValue('--hm-space-4').trim()).toBe('16px');
    expect(root.getPropertyValue('--hm-control-focus').trim()).toBe('#6d28d9');
    expect(root.getPropertyValue('--hm-control-height').trim()).toBe('48px');
    expect(root.getPropertyValue('--hm-control-radius').trim()).toBe('10px');
  });

  it('keeps the global Lucide defaults equal to the library defaults, so unmigrated icons are unchanged', () => {
    TestBed.configureTestingModule({ providers: [provideHmIconDefaults()] });
    const config = TestBed.inject(LucideIconConfig);
    expect(config.size).toBe(HM_LUCIDE_GLOBAL_DEFAULTS.size);
    expect(config.strokeWidth).toBe(2);
    expect(config.size).toBe(24);
    expect(config.color).toBe('currentColor');
  });

  it('registers the showcase only outside production and behind the localhost guard', () => {
    const route = routes.find(r => r.path === 'dev/design-system');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toEqual([devOnlyGuard]);
  });

  it('Partners: the empty state uses the shared component and keeps the create action', async () => {
    TestBed.configureTestingModule({
      imports: [PartnersListPageComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([] as Routes),
        { provide: EntitiesService, useValue: { getMyPartners: () => of({ partners: [] }) } },
      ],
    });
    const fixture = TestBed.createComponent(PartnersListPageComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('hm-empty-state .hm-es-title')!.textContent!.trim()).toBe('אין שותפים עדיין');
    expect(el.textContent).not.toContain('🤝');
    (el.querySelector('hm-empty-state .pl-new-btn') as HTMLButtonElement).click();
    expect(fixture.componentInstance.createMode).toBe('choose');
    fixture.destroy();
  });
});
