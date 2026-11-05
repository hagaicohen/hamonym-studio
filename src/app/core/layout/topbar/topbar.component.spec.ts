import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TopbarComponent } from './topbar.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { CurrentEntityService } from '../../services/current-entity.service';
import { of } from 'rxjs';

@Component({ selector: 'app-notification-bell', standalone: true, template: '' })
class NotificationStub {}

describe('Shared header in public and management pages', () => {
  beforeEach(() => {
    spyOn(localStorage, 'getItem').and.callFake(key => key === 'token' ? 'test-token' : key === 'user' ? JSON.stringify({ full_name: 'Test User', picture: '/test-avatar.png' }) : null);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([]),
      { provide: CurrentEntityService, useValue: { selectEntity: () => of({}) } },
    ] });
    TestBed.overrideComponent(TopbarComponent, { remove: { imports: [NotificationBellComponent] }, add: { imports: [NotificationStub] } });
  });
  for (const publicPage of [true, false]) {
    it(`uses the common logo, avatar and actions in ${publicPage ? 'public' : 'management'} mode`, () => {
      const fixture = TestBed.createComponent(TopbarComponent);
      fixture.componentInstance.publicPage = publicPage;
      fixture.detectChanges();
      const el = fixture.nativeElement;
      expect(el.querySelector('header').getAttribute('dir')).toBe('rtl');
      expect(el.querySelector('.brand-logo').getAttribute('src')).toBe('/logo.png');
      expect(el.querySelector('.avatar-photo').getAttribute('src')).toBe('/test-avatar.png');
      expect(!!el.querySelector('.mobile-menu-btn')).toBe(!publicPage);
      el.querySelector('.ctx-btn').click(); fixture.detectChanges();
      expect(el.querySelector('.ctx-dropdown').textContent).toContain('האזור האישי');
      expect(el.querySelector('.ctx-dropdown').textContent).toContain('התנתקות');
      expect(!!el.querySelector('.ctx-dropdown-title')).toBe(!publicPage);
      fixture.destroy();
    });
  }
  it('keeps role switching and donor navigation delegated to the existing context service', () => {
    const fixture = TestBed.createComponent(TopbarComponent);
    const header = fixture.componentInstance;
    const switchContext = spyOn(header.ctx, 'switchContext');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    header.switchContext('donor', null, new MouseEvent('click'));
    expect(switchContext).toHaveBeenCalledWith('donor', null);
    expect(navigate).toHaveBeenCalledWith(['/my-donations']);
    fixture.destroy();
  });
  it('keeps admin mode free of role switching while providing the shared user actions', () => {
    const fixture = TestBed.createComponent(TopbarComponent);
    fixture.componentInstance.ctx.adminMode.set(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.ctx-btn').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ctx-dropdown-title')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.ctx-dropdown button').length).toBe(2);
    fixture.destroy();
  });
  for (const [label, path, mode] of [
    ['הקמת עמותה חדשה', '/organization-registration', 'new'],
    ['הצטרפות כשגריר', '/campaigns/discover', 'ambassador'],
  ]) {
    it(`opens ${label} using a focusable action and closes only after successful navigation`, async () => {
      const fixture = TestBed.createComponent(TopbarComponent);
      const header = fixture.componentInstance;
      header.ctx.initFromLogin({ entities: [{ id: 'existing', display_name: 'Existing' }] });
      header.dropdownOpen = true; fixture.detectChanges();
      let finish!: (value: boolean) => void;
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.returnValue(new Promise(resolve => finish = resolve));
      const button = Array.from(fixture.nativeElement.querySelectorAll('button.ctx-action-item'))
        .find((element: any) => element.textContent.includes(label)) as HTMLButtonElement;
      expect(button).toBeDefined(); expect(button.type).toBe('button');
      if (window.innerWidth <= 768) expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      header.closeOnFocusOut({ currentTarget: fixture.nativeElement.querySelector('.ctx-wrapper'), relatedTarget: button } as any);
      expect(header.dropdownOpen).toBeTrue();
      button.click();
      expect(navigate).toHaveBeenCalledWith([path], { queryParams: { mode } });
      expect(header.dropdownOpen).toBeTrue();
      finish(true); await fixture.whenStable();
      expect(header.dropdownOpen).toBeFalse();
      expect(header.ctx.active()?.context?.id).toBe('existing');
      fixture.destroy();
    });
  }
  it('keeps navigation failures visible instead of silently closing the menu', async () => {
    const fixture = TestBed.createComponent(TopbarComponent); const header = fixture.componentInstance;
    header.dropdownOpen = true;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
    await header.navigateTo('/settings', new MouseEvent('click'));
    expect(header.dropdownOpen).toBeTrue(); expect(header.switchError).not.toBe('');
    navigate.and.rejectWith(new Error('load failed'));
    await header.navigateTo('/settings', new MouseEvent('click'));
    expect(header.dropdownOpen).toBeTrue(); expect(header.switchError).not.toBe('');
    fixture.destroy();
  });
  it('keeps personal area and role management as functional buttons with their existing destinations', async () => {
    const fixture = TestBed.createComponent(TopbarComponent); fixture.componentInstance.dropdownOpen = true; fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const button = Array.from(fixture.nativeElement.querySelectorAll('button.ctx-manage-row'))
      .find((element: any) => element.textContent.includes('ניהול תפקידים')) as HTMLButtonElement;
    expect(button).toBeDefined(); button.click(); await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/settings']);
    expect(fixture.componentInstance.dropdownOpen).toBeFalse();
    fixture.destroy();
  });
});
