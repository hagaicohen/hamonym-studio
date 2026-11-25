import { ApplicationRef, ComponentRef, DestroyRef, EnvironmentInjector, Injectable, createComponent, inject } from '@angular/core';
import { RaceChoice, RaceRegistrationDialogComponent } from './race-registration-dialog.component';

interface RaceItem { title?: string; name?: string; distance?: string; price?: number | string; }
type RaceWindow = Window & { hamAngularReadLegacyState?: () => { management?: { modules?: { races?: { items?: RaceItem[] } } } } | undefined };

/** Opens the race registration dialog from `[data-ham-race-open]` buttons in the preview. */
@Injectable({ providedIn: 'root' })
export class RaceRegistrationService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private dialog?: ComponentRef<RaceRegistrationDialogComponent>;

  start(): void {
    if (this.started) return;
    this.started = true;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.('#preview [data-ham-race-open]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.open();
    };
    document.addEventListener('click', onClick, true);
    this.destroyRef.onDestroy(() => { document.removeEventListener('click', onClick, true); this.dispose(); });
  }

  open(): void {
    this.dispose();
    const ref = createComponent(RaceRegistrationDialogComponent, { environmentInjector: this.injector });
    ref.instance.setChoices(this.choices());
    ref.instance.closed.subscribe(() => this.dispose(ref));
    this.appRef.attachView(ref.hostView);
    document.body.appendChild(ref.location.nativeElement);
    ref.changeDetectorRef.detectChanges();
    this.dialog = ref;
  }

  private choices(): RaceChoice[] {
    let races: RaceItem[] = [];
    try { races = (window as RaceWindow).hamAngularReadLegacyState?.()?.management?.modules?.races?.items || []; } catch { /* not ready */ }
    return races
      .filter(x => x && String(x.title || x.name || x.distance || '').trim())
      .map((x, i) => ({ id: String(i), name: String(x.title || x.name || x.distance || 'מקצה ' + (i + 1)), price: Number(x.price) || 0 }));
  }

  private dispose(ref = this.dialog): void {
    if (!ref || ref.hostView.destroyed) return;
    this.appRef.detachView(ref.hostView);
    ref.destroy();
    if (this.dialog === ref) this.dialog = undefined;
  }
}
