import { DestroyRef, Injectable, inject } from '@angular/core';
import { ActiveModule, ManagementMode, ManagementViewService } from './management-view.service';

/**
 * Navigation commands addressed by data attributes. This is a public contract: besides the
 * management screen itself, the top toolbar, the wizard and the core inspector navigate by
 * rendering (or synthetically clicking) buttons such as `[data-hu-page="visibility"]` or
 * `[data-hu-mode="management"]`. Moved verbatim from the engine's document click handler.
 */
@Injectable({ providedIn: 'root' })
export class ManagementCommandsService {
  private readonly view = inject(ManagementViewService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    const onClick = (event: MouseEvent): void => this.handle(event);
    document.addEventListener('click', onClick);
    this.destroyRef.onDestroy(() => document.removeEventListener('click', onClick));
  }

  private handle(event: MouseEvent): void {
    const b = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!b) return;
    const d = b.dataset;
    if (b.hasAttribute('data-hu-close')) { this.view.closeDrawer(); return; }
    if (b.hasAttribute('data-hu-drawer')) { this.view.openDrawer(); return; }
    if (d['huMode']) { this.view.chooseMode(d['huMode'] as ManagementMode); return; }
    if (d['huNavModule']) { this.view.goModule(d['huNavModule'] as ActiveModule); return; }
    if (d['huPage']) { this.view.goPage(d['huPage']); return; }
    if (d['huEdit']) { this.view.goEdit(d['huEdit']); return; }
    if (b.hasAttribute('data-hu-story')) this.view.openStory();
  }
}
