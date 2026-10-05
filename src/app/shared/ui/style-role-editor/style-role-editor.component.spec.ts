import { StyleRoleEditorComponent } from './style-role-editor.component';

// Universal Local Styling Phase B1 (2026-10) — plain instantiation, no
// TestBed, same convention as TextRoleEditorComponent's own spec.
describe('StyleRoleEditorComponent', () => {
  let component: StyleRoleEditorComponent;
  let emitted: (object | undefined)[];

  beforeEach(() => {
    component = new StyleRoleEditorComponent();
    emitted = [];
    component.overrideChange.subscribe(v => emitted.push(v));
  });

  it('patch() merges onto the existing override without clobbering other set properties', () => {
    component.override = { background: '#ff0000' };
    component.patch({ borderRadius: 12 });
    expect(emitted[0]).toEqual({ background: '#ff0000', borderRadius: 12 });
  });

  it('3. resetProperty removes only that property, keeping the rest', () => {
    component.override = { background: '#ff0000', textColor: '#00ff00' };
    component.resetProperty('background');
    expect(emitted[0]).toEqual({ textColor: '#00ff00' });
  });

  it('3. resetProperty on the last remaining property emits undefined', () => {
    component.override = { background: '#ff0000' };
    component.resetProperty('background');
    expect(emitted[0]).toBeUndefined();
  });

  it('4. resetRole emits undefined regardless of how many properties were set', () => {
    component.override = { background: '#ff0000', textColor: '#00ff00', borderRadius: 8 };
    component.resetRole();
    expect(emitted[0]).toBeUndefined();
  });

  it('hasOverride is false for undefined/empty, true once a property is set', () => {
    component.override = undefined;
    expect(component.hasOverride).toBe(false);
    component.override = {};
    expect(component.hasOverride).toBe(false);
    component.override = { fillColor: '#123456' };
    expect(component.hasOverride).toBe(true);
  });
});
