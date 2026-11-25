import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, OnDestroy, createComponent } from '@angular/core';
import { UnifiedToolbarComponent } from './unified-toolbar.component';

/** Angular replacement for the DOM-generating legacy script 048.js.
 * The original toolbar CSS, placement and command selectors are preserved. */
@Injectable({providedIn: 'root'})
export class UnifiedToolbarService implements OnDestroy {
  private ref?: ComponentRef<UnifiedToolbarComponent>;
  private host?: HTMLDetailsElement;
  private openButton?: HTMLButtonElement;
  private retry?: ReturnType<typeof setTimeout>;
  private readonly outsideClick = (event: MouseEvent): void => {
    if (this.host?.open && event.target instanceof Element && !event.target.closest('.ham-v297-more')) this.host.open = false;
  };
  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.host) this.host.open = false;
  };
  private readonly launch = (event: MouseEvent): void => {
    event.stopPropagation();
    document.querySelector<HTMLElement>('.stage-toolbar [data-ham-open-public]')?.click();
  };
  constructor(private readonly appRef: ApplicationRef, private readonly injector: EnvironmentInjector) {}
  private mount(): boolean {
    if (this.ref) return true;
    const top = document.querySelector<HTMLElement>('body > .top.ham-v157-ready');
    const actions = top?.querySelector<HTMLElement>('.top-actions');
    const controls = top?.querySelector<HTMLElement>('.ham-single-toolbar');
    const layout = top?.querySelector<HTMLElement>('[data-ham-v209-dropdown="layout"]');
    if (!top || !actions || !controls || !layout) return false;
    if (top.querySelector('.ham-v297-more')) return true;
    const host = document.createElement('details');
    host.className = 'ham-v297-more';
    actions.appendChild(host);
    this.host = host;
    this.ref = createComponent(UnifiedToolbarComponent, {environmentInjector:this.injector,hostElement:host});
    this.appRef.attachView(this.ref.hostView);
    this.ref.changeDetectorRef.detectChanges();
    layout.querySelectorAll('[data-ham-v209-layout="sidebarCard"]').forEach(b => b.closest('.ham-layout-menu-entry')?.remove());
    document.body.classList.add('ham-v297-toolbar-ready');
    document.addEventListener('click',this.outsideClick);
    document.addEventListener('keydown',this.keyDown);
    const open = controls.querySelector<HTMLButtonElement>('.ham-v297-open-public') || document.createElement('button');
    open.type = 'button';open.className = 'ham-v297-open-public';open.textContent = '↗ פתח בדפדפן';
    open.title = 'פתח את דף הקמפיין בלשונית חדשה';
    open.addEventListener('click',this.launch);
    controls.appendChild(open);
    this.openButton = open;
    return true;
  }
  private readonly ready = ():void => {
    if (this.mount()) return;
    let attempts = 0;
    const retry = ():void => {
      if (this.mount() || ++attempts >= 80) return;
      this.retry = setTimeout(retry,120);
    };
    retry();
  };
  start():void {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',this.ready,{once:true});
    else this.ready();
  }
  ngOnDestroy():void {
    document.removeEventListener('DOMContentLoaded',this.ready);
    document.removeEventListener('click',this.outsideClick);
    document.removeEventListener('keydown',this.keyDown);
    if (this.retry) clearTimeout(this.retry);
    this.openButton?.removeEventListener('click',this.launch);
    if (this.ref) {this.appRef.detachView(this.ref.hostView);this.ref.destroy();this.ref=undefined;}
    this.host?.remove();this.host=undefined;
  }
}
