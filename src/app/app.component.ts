import { Component, ElementRef, inject, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { Subscription } from 'rxjs';
import { AppLoaderComponent } from './core/ui/app-loader/app-loader.component';
import { AppLoaderService } from './core/services/app-loader.service';
import { TopbarComponent } from './core/layout/topbar/topbar.component';
import { ImpersonationBannerComponent } from './core/layout/impersonation-banner/impersonation-banner.component';
import { ToastContainerComponent } from './core/ui/toast-container.component';

// Routes that hide the loader themselves after async data loading
const SELF_HIDING_PREFIXES = ['/campaigns', '/dashboard'];

// Campaign Workspace persistent-shell fix (2026-09-23) -- these are exactly
// the child segments nested under the shared campaigns/:id shell route in
// app.routes.ts (CampaignWorkspaceShellComponent). Moving between two of
// them for the SAME campaign id never leaves that shell -- the sidebar
// stays mounted -- so the full-screen loader would only be a false
// "reloading the whole app" signal. Keep this list in sync with the
// shell's children.
const WORKSPACE_SHELL_SEGMENTS = [
  'dashboard', 'rewards', 'ambassadors', 'sponsors', 'registration',
  'registrations', 'donation', 'settings', 'visibility', 'donations',
  'donors', 'reports', 'updates',
];

function workspaceKey(url: string): string | null {
  const match = url.split(/[?#]/, 1)[0].match(/^\/campaigns\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  const [, id, segment] = match;
  return WORKSPACE_SHELL_SEGMENTS.includes(segment) ? id : null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppLoaderComponent, TopbarComponent, ImpersonationBannerComponent, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly loader = inject(AppLoaderService);
  private readonly router = inject(Router);
  private sub?: Subscription;
  readonly sharedHeader = signal(false);
  readonly studioWorkspace = signal(false);
  readonly campaignWorkspace = signal(false);
  @ViewChild(RouterOutlet) private outlet?: RouterOutlet;
  private headerElement?: HTMLElement;
  private headerObserver?: ResizeObserver;
  @ViewChild('fixedHeader') set fixedHeader(ref: ElementRef<HTMLElement> | undefined) {
    this.headerObserver?.disconnect();
    this.headerElement = ref?.nativeElement;
    if (this.headerElement) {
      this.measureHeader();
      this.headerObserver = new ResizeObserver(this.measureHeader);
      this.headerObserver.observe(this.headerElement);
    }
  }
  private readonly measureHeader = (): void => {
    if (this.headerElement) document.documentElement.style.setProperty('--header-height', `${this.headerElement.offsetHeight}px`);
  };

  toggleSidebar(): void {
    if (this.outlet?.isActivated) {
      (this.outlet.component as { toggleSidebar?: () => void }).toggleSidebar?.();
    }
  }

  private syncHeader(): void {
    const pending = [this.router.routerState.snapshot.root];
    let shared = false, studio = false;
    while (pending.length) {
      const route = pending.pop()!;
      shared ||= route.data['sharedHeader'] === true;
      studio ||= route.data['studioWorkspace'] === true;
      pending.push(...route.children);
    }
    this.sharedHeader.set(shared);
    this.campaignWorkspace.set(workspaceKey(this.router.url) !== null);
    this.studioWorkspace.set(studio);
    this.measureHeader();
  }

  ngOnInit(): void {
    this.sub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        const active = this.outlet?.isActivated
          ? this.outlet.component as { keepsPublicCampaignMounted?: (url: string) => boolean }
          : undefined;
        if (active?.keepsPublicCampaignMounted?.(event.url)) return;
        const fromKey = workspaceKey(this.router.url);
        const toKey = workspaceKey(event.url);
        if (fromKey && toKey && fromKey === toKey) {
          // Internal Workspace navigation -- shell stays mounted, no
          // full-screen "טוען..." for what's really just a content swap.
          return;
        }
        this.loader.show('טוען...');
      } else if (event instanceof NavigationEnd) {
        this.syncHeader();
        const url = event.url;
        const selfHiding = SELF_HIDING_PREFIXES.some(p => url.startsWith(p));
        if (!selfHiding) {
          this.loader.hide();
        }
      } else if (event instanceof NavigationCancel) {
        // hide() (not forceHide) so a follow-up redirect's show() can cancel it
        this.loader.hide();
      } else if (event instanceof NavigationError) {
        this.loader.forceHide();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.headerObserver?.disconnect();
  }
}
