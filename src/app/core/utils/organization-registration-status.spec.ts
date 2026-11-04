import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { isRegistrationDraft, registeredOrganizations, registrationDrafts } from './organization-registration-status';
import { CurrentContextService } from '../services/current-context.service';
import { EntitiesService } from '../services/entities.service';
import { MyOrganizationsPageComponent } from '../../modules/settings/pages/my-organizations-page/my-organizations-page.component';

const org = (id: string, status: string) => ({ id, display_name: id, status, entity_type: 'association' });

describe('Incomplete organization registrations', () => {
  it('only status "draft" is an incomplete registration', () => {
    expect(isRegistrationDraft(org('a', 'draft'))).toBeTrue();
    for (const s of ['pending_review', 'changes_requested', 'active', 'rejected', 'suspended']) {
      expect(isRegistrationDraft(org('a', s))).withContext(s).toBeFalse();
    }
    const all = [org('a', 'draft'), org('b', 'pending_review'), org('c', 'active')];
    expect(registeredOrganizations(all).map((e) => e.id)).toEqual(['b', 'c']);
    expect(registrationDrafts(all).map((e) => e.id)).toEqual(['a']);
  });

  describe('context selector', () => {
    beforeEach(() => spyOn(localStorage, 'setItem'));

    it('never offers a draft as an organization context', () => {
      const ctx = TestBed.inject(CurrentContextService);
      ctx.initFromLogin({ entities: [org('a', 'draft'), org('b', 'pending_review')] });
      expect(ctx.roles()[0].contexts.map((c) => c.id)).toEqual(['b']);
      ctx.addEntityContext(org('c', 'draft'));
      expect(ctx.roles()[0].contexts.map((c) => c.id)).toEqual(['b']);
      ctx.switchContext('entity-manager', 'a');
      expect(ctx.active()?.context?.id).not.toBe('a');
    });

    it('a submitted registration becomes selectable', () => {
      const ctx = TestBed.inject(CurrentContextService);
      ctx.initFromLogin({ entities: [org('a', 'draft')] });
      expect(ctx.roles().some((g) => g.role === 'entity-manager')).toBeFalse();
      ctx.addEntityContext(org('a', 'pending_review'));
      expect(ctx.roles()[0].contexts.map((c) => c.id)).toEqual(['a']);
    });
  });

  it('"הארגונים שלי" lists drafts only in the compact incomplete-registrations section', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: EntitiesService, useValue: { getMyEntities: () => of({ entities: [org('Real org', 'active'), { ...org('d', 'draft'), legal_name: 'Draft org' }] }) } }] });
    const fixture = TestBed.createComponent(MyOrganizationsPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('.entity-card .entity-name')).map((n) => n.textContent!.trim())).toEqual(['Real org']);
    const section = el.querySelector('app-incomplete-registrations')!;
    expect(section.querySelectorAll('.ir-row').length).toBe(1);
    expect(section.textContent).toContain('Draft org');
    expect(section.querySelector('a')!.getAttribute('href')).toBe('/organization-registration?draft=d');
    fixture.destroy();
  });
});
