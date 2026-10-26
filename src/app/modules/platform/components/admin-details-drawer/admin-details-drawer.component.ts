import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-admin-details-drawer',
  standalone: true,
  template: `<div class="drawer-backdrop" (click)="requestClose()"></div>
    <section #panel class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="heading" tabindex="-1" dir="rtl">
      <header><h2>{{ heading }}</h2><button #closeButton type="button" [disabled]="closeDisabled" aria-label="סגירת פרטים" (click)="requestClose()">✕</button></header>
      <div class="drawer-content"><ng-content /></div>
    </section>`,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 1200; }
    * { box-sizing: border-box; }
    .drawer-backdrop { position: absolute; inset: 0; background: #0f172a66; }
    .drawer { position: absolute; inset-block: 0; inset-inline-end: 0; width: min(540px, 100%); background: #fff; color: #1e293b; box-shadow: 0 0 32px #0f172a22; display: flex; flex-direction: column; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid #e2e8f0; }
    h2 { font-size: 20px; margin: 0; overflow-wrap: anywhere; }
    button { border: 1px solid #e2e8f0; background: #fff; color: #583cd6; border-radius: 8px; width: 36px; height: 36px; flex-shrink: 0; cursor: pointer; }
    button:focus-visible { outline: 3px solid #b8a7f4; outline-offset: 2px; }
    .drawer-content { padding: 20px; overflow: auto; flex: 1; }
  `],
})
export class AdminDetailsDrawerComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) heading = '';
  @Input() closeDisabled = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('panel') panel!: ElementRef<HTMLElement>;
  @ViewChild('closeButton') closeButton!: ElementRef<HTMLButtonElement>;
  private returnFocus = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void { this.closeButton.nativeElement.focus(); }
  ngOnDestroy(): void { if (this.returnFocus?.isConnected) this.returnFocus.focus(); }
  requestClose(): void { if (!this.closeDisabled) this.closed.emit(); }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.requestClose(); return; }
    if (event.key !== 'Tab') return;
    const elements = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
    const first = elements[0], last = elements[elements.length - 1];
    if (!this.panel.nativeElement.contains(document.activeElement)) { event.preventDefault(); (first || this.panel.nativeElement).focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.panel.nativeElement)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
