import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AppLoaderService {
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
    this.isVisible.set(true);
  }

  hide(): void {
    const elapsed = Date.now() - this.showAt;
    const remaining = this.minMs - elapsed;

    if (remaining > 0) {
      this.hideTimer = setTimeout(() => {
        this.isVisible.set(false);
        this.hideTimer = undefined;
      }, remaining);
    } else {
      this.isVisible.set(false);
    }
  }

  forceHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
    this.isVisible.set(false);
  }
}
