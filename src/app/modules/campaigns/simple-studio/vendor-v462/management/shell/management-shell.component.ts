import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject } from '@angular/core';
import { ManagementViewService } from '../management-view.service';
import { navActive, navEntries, navSettings } from './management-nav';
import { OverviewPageComponent } from '../pages/overview-page.component';
import { PublishPageComponent } from '../pages/publish-page.component';
import { IdentityPageComponent } from '../pages/identity-page.component';
import { FundraisingPageComponent } from '../pages/fundraising-page.component';
import { SimpleDonationPageComponent } from '../pages/simple-donation-page.component';
import { ContentPageComponent } from '../pages/content-page.component';
import { RacePageComponent } from '../pages/race-page.component';

/** Page component per view key (old page keys are aliases of the grouped pages). */
const PAGE_COMPONENT: Record<string, string> = {
  overview: 'overview', publish: 'publish', identity: 'identity', access: 'identity',
  fundraising: 'fundraising', funding: 'fundraising', donations: 'fundraising', visibility: 'fundraising', simple: 'simple',
  modules: 'content', race: 'race'
};

const REBUILT_PAGES = new Set(['content', 'race']);

/**
 * Management screen frame, mounted on `aside#huManager` (first child of `.workspace`):
 * the menu with its settings search (#huMenu) and the page area (#huPage).
 * Every page is a component rendered inside #huPage, so `#huPage …` selectors keep working.
 */
@Component({
  selector: 'ham-management-shell',
  standalone: true,
  imports: [OverviewPageComponent, PublishPageComponent, IdentityPageComponent, FundraisingPageComponent, SimpleDonationPageComponent, ContentPageComponent, RacePageComponent],
  templateUrl: './management-shell.component.html',
  styles: [':host ::ng-deep ham-mgmt-overview, :host ::ng-deep ham-mgmt-publish, :host ::ng-deep ham-mgmt-identity, :host ::ng-deep ham-mgmt-fundraising, :host ::ng-deep ham-mgmt-simple-donation, :host ::ng-deep ham-mgmt-content, :host ::ng-deep ham-mgmt-race { display: contents; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-manager', id: 'huManager', 'aria-label': 'ניהול קמפיין' }
})
export class ManagementShellComponent {
  readonly view = inject(ManagementViewService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Kind and page are re-read on every redraw, exactly when the engine used to redraw the menu. */
  private readonly snapshot = computed(() => { this.view.revision(); return { simple: this.view.isSimple(), race: this.view.isRace() }; });
  readonly simple = computed(() => this.snapshot().simple);
  readonly entries = computed(() => navEntries(this.view.navSearch(), this.snapshot().race));
  readonly settings = computed(() => navSettings(this.view.navSearch()));
  readonly page = computed(() => { this.view.revision(); return this.view.page(); });
  /** Component shown in #huPage, and the navigation it belongs to (a new visit re-creates it). */
  readonly pageComponent = computed(() => { const v = this.view.angularView(); return v ? PAGE_COMPONENT[v] ?? null : null; });
  /**
   * Instance key of the page: a new navigation re-creates it. Pages listed in REBUILT_PAGES are
   * re-created on every redraw too, exactly like the old full-page markup (their content is a
   * function of the campaign state at the redraw; outside code patches them in between).
   */
  readonly visits = computed(() => {
    const component = this.pageComponent();
    return [component && REBUILT_PAGES.has(component) ? `${this.view.pageInstance()}:${this.view.revision()}` : String(this.view.pageInstance())];
  });

  constructor() { this.view.registerRenderer(() => this.cdr.detectChanges()); }

  isActive(id: string): boolean { return navActive(id, this.page()); }
  search(event: Event): void { this.view.navSearch.set((event.target as HTMLInputElement).value); }
}
