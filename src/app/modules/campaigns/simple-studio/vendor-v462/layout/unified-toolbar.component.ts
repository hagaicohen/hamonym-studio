import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { StudioToolbarService } from './studio-toolbar.service';

/** The toolbar's overflow menu ("⋯"): demos, page download, JSON export / import, reset (StudioToolbarService). */
@Component({
  selector: 'details[ham-unified-toolbar]', standalone: true,
  templateUrl: './unified-toolbar.component.html',
  styleUrl: './unified-toolbar.component.css'
})
export class UnifiedToolbarComponent {
  private readonly host = inject<ElementRef<HTMLDetailsElement>>(ElementRef).nativeElement;
  readonly toolbar = inject(StudioToolbarService);
  /** Closed by a click outside it and by Escape (formerly UnifiedToolbarService's document listeners). */
  @HostListener('document:click', ['$event']) outside(event: MouseEvent): void {
    if (this.host.open && event.target instanceof Element && !event.target.closest('.ham-v297-more')) this.host.open = false;
  }
  @HostListener('document:keydown', ['$event']) escape(event: KeyboardEvent): void { if (event.key === 'Escape') this.host.open = false; }
  close(): void { this.host.open = false; }

}
