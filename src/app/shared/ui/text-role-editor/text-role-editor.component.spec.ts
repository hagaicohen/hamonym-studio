import { TextRoleEditorComponent } from './text-role-editor.component';

// Typography Phase A (2026-10) — plain instantiation, no TestBed: every
// method under test here is a pure read/emit of @Input()/@Output(), same
// convention as the rest of this phase's utility-level tests.
describe('TextRoleEditorComponent', () => {
  let component: TextRoleEditorComponent;
  let emitted: (Partial<any> | undefined)[];

  beforeEach(() => {
    component = new TextRoleEditorComponent();
    emitted = [];
    component.overrideChange.subscribe(v => emitted.push(v));
  });

  it('patch() merges onto the existing override without clobbering other set properties', () => {
    component.override = { color: '#ff0000' };
    component.patch({ fontWeight: 900 });
    expect(emitted[0]).toEqual({ color: '#ff0000', fontWeight: 900 });
  });

  it('patch() with no prior override starts a fresh object', () => {
    component.override = undefined;
    component.patch({ color: '#00ff00' });
    expect(emitted[0]).toEqual({ color: '#00ff00' });
  });

  // 3. Reset property — removes only the one property, keeps the rest.
  it('3. resetProperty removes only that property, keeping other overrides intact', () => {
    component.override = { color: '#ff0000', fontWeight: 900 };
    component.resetProperty('color');
    expect(emitted[0]).toEqual({ fontWeight: 900 });
  });

  it('3. resetProperty on the LAST remaining property emits undefined (not an empty object)', () => {
    component.override = { color: '#ff0000' };
    component.resetProperty('color');
    expect(emitted[0]).toBeUndefined();
  });

  it('3. resetProperty is a no-op when there is no override at all', () => {
    component.override = undefined;
    component.resetProperty('color');
    expect(emitted.length).toBe(0);
  });

  // 4. Reset role — clears the whole role in one action regardless of how
  // many properties were set.
  it('4. resetRole emits undefined even with multiple properties set', () => {
    component.override = { color: '#ff0000', fontWeight: 900, fontSize: 'lg' };
    component.resetRole();
    expect(emitted[0]).toBeUndefined();
  });

  it('hasOverride is false for undefined or an empty object, true once a property is set', () => {
    component.override = undefined;
    expect(component.hasOverride).toBe(false);
    component.override = {};
    expect(component.hasOverride).toBe(false);
    component.override = { color: '#ff0000' };
    expect(component.hasOverride).toBe(true);
  });
});
