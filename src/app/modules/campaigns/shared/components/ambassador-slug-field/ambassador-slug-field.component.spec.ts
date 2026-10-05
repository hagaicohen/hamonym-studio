import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { AmbassadorSlugFieldComponent } from './ambassador-slug-field.component';
import { AmbassadorService } from '../../../services/ambassador.service';

describe('AmbassadorSlugFieldComponent', () => {
  let checkSlugAvailable: jasmine.Spy;

  function create() {
    const fixture = TestBed.createComponent(AmbassadorSlugFieldComponent);
    const component = fixture.componentInstance;
    component.campaignSlug = 'my-campaign';
    return { fixture, component };
  }

  beforeEach(() => {
    checkSlugAvailable = jasmine.createSpy('checkSlugAvailable');
    TestBed.configureTestingModule({
      imports: [AmbassadorSlugFieldComponent],
      providers: [
        { provide: AmbassadorService, useValue: { checkSlugAvailable } },
      ],
    });
  });

  // Direct property assignment on a standalone-created fixture (no host
  // template bindings) never triggers ngOnChanges -- only Angular's own
  // input-binding machinery does. setInput() is the TestBed-supported way
  // to simulate a real @Input() change and exercise ngOnChanges here.
  it('suggests a Hebrew-preserving default slug from the ambassador name', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'חגי-כהן', available: true }));
    const { fixture, component } = create();
    fixture.detectChanges();
    fixture.componentRef.setInput('nameForDefault', 'חגי כהן');
    fixture.detectChanges();
    tick(600);

    expect(component.value).toBe('חגי-כהן');
    expect(checkSlugAvailable).toHaveBeenCalledWith('my-campaign', 'חגי-כהן', undefined);
  }));

  it('accepts an English name unchanged into the default slug', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'israel-israeli', available: true }));
    const { fixture, component } = create();
    fixture.detectChanges();
    fixture.componentRef.setInput('nameForDefault', 'Israel Israeli');
    fixture.detectChanges();
    tick(600);

    expect(component.value).toBe('israel-israeli');
    expect(component.status).toBe('available');
  }));

  it('marks an existing saved slug (edit mode) as available without calling the server', () => {
    const { fixture, component } = create();
    fixture.detectChanges();
    fixture.componentRef.setInput('value', 'already-saved');
    fixture.detectChanges();

    expect(component.status).toBe('available');
    expect(checkSlugAvailable).not.toHaveBeenCalled();
  });

  // A transport/server failure (e.g. a stale backend mid-deploy) must never
  // be shown as "already taken" -- that false-positive was reported during
  // manual QA (2026-10-01), traced to the service collapsing every error
  // into { available: false } with no way to tell it apart from a real conflict.
  it('shows a neutral "could not check" status instead of "taken" when the check itself fails', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'דוד-לוי-111', available: false, failed: true }));
    const { fixture, component } = create();
    fixture.detectChanges();
    const emitted: boolean[] = [];
    component.availabilityChange.subscribe((v: boolean) => emitted.push(v));

    component.onInput('דוד לוי 111');
    tick(600);

    expect(component.status).toBe('error');
    expect(emitted).toContain(false);
  }));

  it('shows "taken" and reports unavailable when the server rejects the candidate', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'דנה-לוי', available: false }));
    const { fixture, component } = create();
    fixture.detectChanges();
    const emitted: boolean[] = [];
    component.availabilityChange.subscribe((v: boolean) => emitted.push(v));

    component.onInput('דנה לוי');
    tick(600);

    expect(component.status).toBe('taken');
    expect(emitted).toContain(false);
  }));

  it('shows "available" and reports true when the server accepts the candidate', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'new-name', available: true }));
    const { fixture, component } = create();
    fixture.detectChanges();
    const emitted: boolean[] = [];
    component.availabilityChange.subscribe((v: boolean) => emitted.push(v));

    component.onInput('new name');
    tick(600);

    expect(component.status).toBe('available');
    expect(emitted).toContain(true);
  }));

  it('flags a too-short candidate without calling the server', fakeAsync(() => {
    const { fixture, component } = create();
    fixture.detectChanges();

    component.onInput('א');
    tick(600);

    expect(component.status).toBe('too-short');
    expect(checkSlugAvailable).not.toHaveBeenCalled();
  }));

  it('debounces rapid typing into a single availability check', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'final-value', available: true }));
    const { fixture, component } = create();
    fixture.detectChanges();

    component.onInput('f');
    tick(100);
    component.onInput('fi');
    tick(100);
    component.onInput('final-value');
    tick(600);

    expect(checkSlugAvailable).toHaveBeenCalledTimes(1);
    expect(checkSlugAvailable).toHaveBeenCalledWith('my-campaign', 'final-value', undefined);
  }));

  it('passes excludeAmbassadorId through to the availability check (edit mode conflict scoping)', fakeAsync(() => {
    checkSlugAvailable.and.returnValue(of({ slug: 'name', available: true }));
    const { fixture, component } = create();
    component.excludeAmbassadorId = 'amb-123';
    fixture.detectChanges();

    component.onInput('name');
    tick(600);

    expect(checkSlugAvailable).toHaveBeenCalledWith('my-campaign', 'name', 'amb-123');
  }));
});
