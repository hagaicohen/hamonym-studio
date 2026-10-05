import { TestBed } from '@angular/core/testing';
import { SectionPresentationPickerComponent } from './section-presentation-picker.component';

describe('SectionPresentationPickerComponent', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [SectionPresentationPickerComponent] });
    const fixture = TestBed.createComponent(SectionPresentationPickerComponent);
    return { fixture, component: fixture.componentInstance };
  }

  it('highlights the recommended option as active when no explicit value is set', () => {
    const { component } = create();
    component.recommended = 'list';

    expect(component.isActive('list')).toBe(true);
    expect(component.isActive('cards')).toBe(false);
  });

  it('an explicit value overrides the recommendation for the active state', () => {
    const { component } = create();
    component.recommended = 'list';
    component.value = 'cards';

    expect(component.isActive('cards')).toBe(true);
    expect(component.isActive('list')).toBe(false);
  });

  it('selecting an option emits valueChange with that option', () => {
    const { component } = create();
    const emitted: string[] = [];
    component.valueChange.subscribe(v => emitted.push(v));

    component.select('image');

    expect(emitted).toEqual(['image']);
  });

  it('the reset action emits reset, not a valueChange', () => {
    const { component } = create();
    const resetEmitted: void[] = [];
    const valueEmitted: string[] = [];
    component.reset.subscribe(() => resetEmitted.push(undefined));
    component.valueChange.subscribe(v => valueEmitted.push(v));

    component.onReset();

    expect(resetEmitted.length).toBe(1);
    expect(valueEmitted.length).toBe(0);
  });
});
