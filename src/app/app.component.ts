import { Component, inject, OnDestroy, OnInit } from '@angular/core';
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
  'donors', 'reports',
];

function workspaceKey(url: string): string | null {
  const match = url.split('?')[0].match(/^\/campaigns\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  const [, id, segment] = match;
  return WORKSPACE_SHELL_SEGMENTS.includes(segment) ? id : null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppLoaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly loader = inject(AppLoaderService);
  private readonly router = inject(Router);
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        const fromKey = workspaceKey(this.router.url);
        const toKey = workspaceKey(event.url);
        if (fromKey && toKey && fromKey === toKey) {
          // Internal Workspace navigation -- shell stays mounted, no
          // full-screen "טוען..." for what's really just a content swap.
          return;
        }
        this.loader.show('טוען...');
      } else if (event instanceof NavigationEnd) {
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
  }
}
