import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ENTITY_CATEGORIES } from '../../config/entity-categories';
import { CategorySelectorComponent } from './category-selector.component';
import { joinCategories, splitCategories } from './category-selection';
import { StepEntityComponent } from '../../../modules/organization-registration/components/step-entity/step-entity.component';
import { OrganizationRegistrationStateService } from '../../../modules/organization-registration/services/organization-registration-state.service';
import { EntityBasicInfoSectionEditComponent } from '../../../modules/settings/components/edit/entity-basic-info-section-edit/entity-basic-info-section-edit.component';
import { EntityBasicInfoSectionViewComponent } from '../../../modules/settings/components/view/entity-basic-info-section-view/entity-basic-info-section-view.component';

@Component({
  standalone: true,
  imports: [CategorySelectorComponent],
  template: `
  <section dir="rtl" style="width:360px">
    <app-category-selector inputId="t-cat" [(selected)]="selected"></app-category-selector>
  </section>`,
})
class Host {
  selected: string[] = ['health', 'education'];
}

const texts = (root: Element, sel: string) => Array.from(root.querySelectorAll(sel)).map((e) => e.textContent!.trim());

describe('Category list', () => {
  it('is sorted with he-IL collation, keeps "אחר" last and has unique ids', () => {
    const collator = new Intl.Collator('he-IL', { sensitivity: 'base' });
    const body = ENTITY_CATEGORIES.slice(0, -1).map((c) => c.label);
    expect(body).toEqual([...body].sort(collator.compare));
    expect(ENTITY_CATEGORIES[ENTITY_CATEGORIES.length - 1].id).toBe('other');
    expect(new Set(ENTITY_CATEGORIES.map((c) => c.id)).size).toBe(ENTITY_CATEGORIES.length);
  });
});

describe('Primary/secondary mapping', () => {
  it('the first selected category is the primary; removing it promotes the next one', () => {
    expect(joinCategories('health', ['education', 'health', 'sports'])).toEqual(['health', 'education', 'sports']);
    expect(joinCategories('', [])).toEqual([]);
    expect(splitCategories(['health', 'education', 'sports'])).toEqual({ primary: 'health', secondary: ['education', 'sports'] });
    expect(splitCategories(['education', 'sports'])).toEqual({ primary: 'education', secondary: ['sports'] });
    expect(splitCategories([])).toEqual({ primary: '', secondary: [] });
  });
});

describe('Unified category selector', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  const render = () => fixture.detectChanges();
  const groups = () => el.querySelectorAll('.hm-cat-group');
  const allChip = (name: string) => Array.from(groups()[1].querySelectorAll('.hm-chip')).find((c) => c.textContent!.trim() === name) as HTMLButtonElement;
  const search = () => el.querySelector('#t-cat') as HTMLInputElement;
  const type = (value: string) => { search().value = value; search().dispatchEvent(new Event('input')); render(); };

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
    render();
  });
  afterEach(() => fixture.destroy());

  it('has one search field (no dropdown), the selected chips with a counter and every category sorted', () => {
    expect(el.querySelectorAll('select, [role="listbox"], [role="combobox"]').length).toBe(0);
    expect(search().placeholder).toBe('חפש קטגוריה להוספה...');
    expect(el.querySelector('label[for="t-cat"]')).toBeTruthy();
    expect(el.querySelector('.hm-cat-search lucide-icon')).toBeTruthy();
    expect(texts(groups()[0], '.hm-cat-heading')).toEqual(['קטגוריות שנבחרו (2)']);
    expect(texts(groups()[0], '.hm-chip--picked')).toEqual(['בריאות', 'חינוך']);
    expect(texts(groups()[1], '.hm-cat-heading')).toEqual(['כל הקטגוריות']);
    expect(texts(groups()[1], '.hm-chip')).toEqual(ENTITY_CATEGORIES.map((c) => c.label));
    expect(texts(groups()[1], '.hm-chip.is-selected')).toEqual(['בריאות', 'חינוך']);
    expect(groups()[1].querySelectorAll('.hm-chip.is-selected lucide-icon').length).toBe(2);
    expect(getComputedStyle(groups()[1].querySelector('.hm-chip-list')!).flexWrap).toBe('wrap');
  });

  it('clicking a chip selects or deselects it without duplicates; the counter updates', () => {
    allChip('אמנות').click(); render();
    expect(fixture.componentInstance.selected).toEqual(['health', 'education', 'art']);
    expect(allChip('אמנות').getAttribute('aria-pressed')).toBe('true');
    expect(texts(groups()[0], '.hm-cat-heading')).toEqual(['קטגוריות שנבחרו (3)']);
    allChip('בריאות').click(); render();
    expect(fixture.componentInstance.selected).toEqual(['education', 'art']);
    expect(allChip('בריאות').classList.contains('is-selected')).toBeFalse();
  });

  it('the X on a selected chip removes it and has a screen-reader label', () => {
    const remove = groups()[0].querySelector('.hm-chip-remove') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('הסר בריאות');
    remove.click(); render();
    expect(fixture.componentInstance.selected).toEqual(['education']);
    groups()[0].querySelector<HTMLButtonElement>('.hm-chip-remove')!.click(); render();
    expect(texts(groups()[0], '.hm-cat-empty')).toEqual(['עדיין לא נבחרו קטגוריות']);
    expect(texts(groups()[0], '.hm-cat-heading')).toEqual(['קטגוריות שנבחרו (0)']);
  });

  it('search filters only "all categories" with partial Hebrew matches; selected stay visible', () => {
    type('חינ');
    expect(texts(groups()[1], '.hm-chip')).toEqual(['חינוך']);
    expect(texts(groups()[0], '.hm-chip--picked')).toEqual(['בריאות', 'חינוך']);
    type('ריא');
    expect(texts(groups()[1], '.hm-chip')).toEqual(ENTITY_CATEGORIES.filter((c) => c.label.includes('ריא')).map((c) => c.label));
    type('zzz');
    expect(texts(groups()[1], '.hm-cat-empty')).toEqual(['לא נמצאו קטגוריות התואמות לחיפוש']);
    search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); render();
    expect(search().value).toBe('');
    expect(groups()[1].querySelectorAll('.hm-chip').length).toBe(ENTITY_CATEGORIES.length);
  });

  it('fits a phone width without horizontal overflow', () => {
    expect((el.querySelector('section') as HTMLElement).scrollWidth).toBeLessThanOrEqual(360);
  });
});

describe('Category selection in onboarding and settings', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  });

  it('onboarding: one unified selector mapped to primary + secondary', async () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.updateState({ entityType: 'association', primaryCategory: 'health', selectedCategories: ['education', 'health'] } as any);
    const fixture = TestBed.createComponent(StepEntityComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const selector = el.querySelector('app-category-selector') as HTMLElement;
    const section = selector.closest('.form-section') as HTMLElement;
    expect(section.querySelector('select, app-category-suggest')).toBeNull();
    expect(section.textContent).not.toContain('קטגוריה ראשית');
    expect(section.textContent).not.toContain('קטגוריות נוספות');
    expect(texts(selector, '.hm-chip--picked')).toEqual(['בריאות', 'חינוך']);

    selector.querySelector<HTMLButtonElement>('.hm-chip-remove')!.click();
    expect(state.state().primaryCategory).toBe('education');
    expect(state.state().selectedCategories).toEqual([]);
    fixture.detectChanges();
    Array.from(selector.querySelectorAll<HTMLButtonElement>('.hm-chip')).find((c) => c.textContent!.trim() === 'ספורט')!.click();
    expect(state.state().primaryCategory).toBe('education');
    expect(state.state().selectedCategories).toEqual(['sports']);
    fixture.destroy();
  });

  it('settings: one unified selector; removing the primary emits the promoted mapping', async () => {
    const fixture = TestBed.createComponent(EntityBasicInfoSectionEditComponent);
    fixture.componentInstance.entity = { id: 'e1', primary_category: 'health', secondary_categories: ['education', 'sports'] };
    fixture.componentInstance.editMode = true;
    const changes: any[] = [];
    fixture.componentInstance.entityChange.subscribe((c: any) => changes.push(c));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const field = el.querySelector('app-category-selector')!.closest('.field') as HTMLElement;
    expect(el.querySelector('#settings-primary-category, app-category-suggest')).toBeNull();
    expect(field.querySelectorAll('select').length).toBe(0);
    expect(texts(field, '.hm-chip--picked')).toEqual(['בריאות', 'חינוך', 'ספורט']);

    field.querySelector<HTMLButtonElement>('.hm-chip-remove')!.click();
    expect(changes).toEqual([{ primary_category: 'education', secondary_categories: ['sports'] }]);
    fixture.componentInstance.setCategories([]);
    expect(changes[1]).toEqual({ primary_category: null, secondary_categories: [] });
    fixture.destroy();
  });

  it('settings view: one "קטגוריות" list, primary first', () => {
    const fixture = TestBed.createComponent(EntityBasicInfoSectionViewComponent);
    fixture.componentInstance.entity = { id: 'e1', primary_category: 'health', secondary_categories: ['education'] };
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('קטגוריה ראשית');
    expect(texts(el, '.categories-field .tag')).toEqual(['בריאות', 'חינוך']);
    fixture.destroy();
  });
});
