import { Component } from '@angular/core';

/** Angular-owned UI for the original overflow toolbar. The backing commands
 * remain delegated to the original application until their domain modules migrate. */
@Component({
  selector: 'ham-unified-toolbar', standalone: true,
  templateUrl: './unified-toolbar.component.html',
  styleUrl: './unified-toolbar.component.css'
})
export class UnifiedToolbarComponent {
  run(selector: string): void {
    const host = document.querySelector<HTMLDetailsElement>('body>.top .ham-v297-more');
    if (host) host.open = false;
    document.querySelector<HTMLElement>(selector)?.click();
  }
}
