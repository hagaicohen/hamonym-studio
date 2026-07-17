import { Injectable, NgZone, inject, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AppLoaderService {
  private ngZone = inject(NgZone);

  isVisible = signal(false);
  text = signal('טוען...');

  private showAt = 0;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private readonly minMs = 600;

  show(text = 'טוען...'): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
    this.text.set(text);
    this.showAt = Date.now();
    this.ngZone.run(() => this.isVisible.set(true));
  }

  hide(): void {
    const elapsed = Date.now() - this.showAt;
    const remaining = this.minMs - elapsed;

    if (remaining > 0) {
      // Callers of hide() can run from deep inside a lazy-loaded route's async
      // chain (dynamic import() -> component construction -> an HttpClient
      // subscribe callback) which — depending on how the dev/build tooling
      // schedules that chain — can end up executing outside Angular's zone.
      // A signal set from outside the zone still updates the signal's value,
      // but never triggers the change detection that would actually remove
      // the @if-gated overlay from the DOM, so it silently stays up forever,
      // blocking every click underneath it. ngZone.run() guarantees a tick
      // regardless of which zone this was called from.
      this.hideTimer = setTimeout(() => {
        this.ngZone.run(() => {
          this.isVisible.set(false);
          this.hideTimer = undefined;
        });
      }, remaining);
    } else {
      this.ngZone.run(() => this.isVisible.set(false));
    }
  }

  forceHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
    this.ngZone.run(() => this.isVisible.set(false));
  }
}
