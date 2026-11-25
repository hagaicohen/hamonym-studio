import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, Output, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WizardService } from './wizard.service';
import { calendarTriggerMarkup } from '../management/calendar/calendar.service';
import { ManagementModelService } from '../management/management-model.service';
import { StudioToolbarService } from '../layout/studio-toolbar.service';
import { STEP_PARTS, WizardCheck } from './wizard.types';
import { WelcomeComponent } from '../welcome/welcome.component';
import { WelcomeActionsComponent } from '../welcome/welcome-actions.component';
import { WizardHeaderComponent } from './wizard-header.component';
import { WizardProgressComponent } from './wizard-progress.component';
import { WizardFooterComponent } from './wizard-footer.component';
import { WizardPreviewControlsComponent } from './wizard-preview-controls.component';
import { WizardKindComponent } from './wizard-kind.component';
import { WizardChoiceComponent } from './wizard-choice.component';
import { WizardFieldComponent } from './wizard-field.component';
import { WizardSlugComponent } from './wizard-slug.component';
import { WizardDescriptionComponent } from './wizard-description.component';
import { WizardCategorySearchComponent } from './wizard-category-search.component';
import { WizardSubcategoryComponent } from './wizard-subcategory.component';
import { WizardLogoComponent } from './wizard-logo.component';
import { WizardHeroSourceComponent } from './wizard-hero-source.component';
import { WizardSliderComponent } from './wizard-slider.component';
import { WizardStoryToolbarComponent } from './wizard-story-toolbar.component';
import { WizardStoryEditorComponent } from './wizard-story-editor.component';
import { WizardStoryMediaComponent } from './wizard-story-media.component';
import { WizardAmountsComponent } from './wizard-amounts.component';
import { WizardRewardsComponent } from './wizard-rewards.component';

import { studioListen } from '../core/studio-session';
type WizardWindow = Window & {
  hamDemoKind?: string;
};

/** Elements in the preview that stay interactive while the wizard is open. */
const PREVIEW_INTERACTIVE = 'button,a,input,select,textarea,[role=button],[role=tab],[data-ham-slide-nav],[data-ham-slide-dot],[data-ham-story-toggle]';
const CALENDAR_PICK = '#huCalendarPortal [data-hu-day],#huCalendarPortal [data-hu-calendar-today],#huCalendarPortal [data-hu-calendar-tomorrow],#huCalendarPortal [data-hu-calendar-clear]';

/**
 * First-run campaign wizard (host element: #hwWizard).
 * The live campaign preview (#canvas) is moved into the preview pane while
 * the wizard is open and moved back to the studio stage when it finishes.
 */
@Component({
  selector: 'ham-wizard',
  standalone: true,
  imports: [
    NgTemplateOutlet, WelcomeComponent, WelcomeActionsComponent, WizardHeaderComponent, WizardProgressComponent, WizardFooterComponent,
    WizardPreviewControlsComponent, WizardKindComponent, WizardChoiceComponent, WizardFieldComponent, WizardSlugComponent,
    WizardDescriptionComponent, WizardCategorySearchComponent, WizardSubcategoryComponent, WizardLogoComponent, WizardHeroSourceComponent,
    WizardSliderComponent, WizardStoryToolbarComponent, WizardStoryEditorComponent, WizardStoryMediaComponent, WizardAmountsComponent,
    WizardRewardsComponent
  ],
  host: { id: 'hwWizard', dir: 'rtl', '[attr.data-ham-mobile-pane]': 'pane()' },
  styles: [':host{display:block} [aria-invalid="true"]{display:block;border-radius:10px;outline:1px solid #dc6b6b;outline-offset:3px}'],
  styleUrls: ['../management/fields/no-end-switch.css'],
  templateUrl: './wizard.component.html'
})
export class WizardComponent implements AfterViewInit {
  readonly wizard = inject(WizardService);
  private readonly calendarModel = inject(ManagementModelService);
  readonly toolbar = inject(StudioToolbarService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Emitted after the wizard completed and the studio should take over. */
  @Output() finished = new EventEmitter<boolean>();

  private readonly previewMount = viewChild.required<ElementRef<HTMLElement>>('previewMount');
  private readonly formContent = viewChild.required<ElementRef<HTMLElement>>('formContent');
  readonly parts = STEP_PARTS;
  readonly pane = signal<'form' | 'preview'>('form');
  readonly categoryVersion = signal(0);
  private canvasHome?: { parent: Node; next: Node | null };

  readonly step = this.wizard.step;
  readonly simple = computed(() => { this.wizard.renderToken(); return this.wizard.isSimple(); });
  readonly previewSimple = computed(() => { this.wizard.previewToken(); return this.wizard.isSimple(); });
  readonly previewHeroCard = computed(() => { this.wizard.previewToken(); return !!this.wizard.state().management?.heroStatsCard?.enabled; });
  readonly demoLoaded = computed(() => { this.wizard.previewToken(); return this.wizard.demoLoaded(); });
  readonly demoTitle = computed(() => {
    this.wizard.previewToken();
    if (!this.wizard.demoLoaded()) return 'טען נתוני דמה תחילה';
    return this.wizard.checks().every(x => x.ok) ? 'כל פרטי החובה הושלמו. פתיחה במצב עריכת קמפיין קיים.' : 'יש להשלים את פרטי החובה החסרים לפני פתיחה.';
  });

  // Values read when a step view is (re)created.
  state() { return this.wizard.state(); }
  get c() { return this.wizard.state().content; }
  organizerName(): string { return this.state().management?.organizerName || ''; }
  logoSrc(): string { return this.wizard.mediaSrc(this.c.hero.orgLogo); }
  managerPhoto(): string { return this.wizard.mediaSrc(this.c.campaignInfo.photo) ; }
  sliderImages(): string[] { return (this.c.hero.slides || []).map(ref => this.wizard.mediaSrc(ref)); }
  amountsText(): string { return this.wizard.suggestedAmounts().join(', '); }
  donations() { return this.state().management.donations || {}; }
  allOk(checks: WizardCheck[]): boolean { return checks.every(x => x.ok); }

  identity(): { mode: string; showHeart: boolean; showLogo: boolean; showHero: boolean } {
    const visual = this.wizard.context.hamSimpleVisualSettings();
    const logo = !!this.logoSrc();
    const mode = visual.identityMode || '';
    return {
      mode: mode === 'hero' ? (logo ? 'logo' : 'avatar') : mode,
      showHeart: mode === 'avatar' || (mode === 'hero' && !logo),
      showLogo: mode === 'logo' || (mode === 'hero' && logo),
      showHero: visual.showHeroImage === true || (visual.showHeroImage == null && mode === 'hero')
    };
  }

  /** Date field from the shared management calendar (trusted local markup). */
  calendarField(path = 'funding.end'): SafeHtml {
    const markup = calendarTriggerMarkup(String(this.calendarModel.get(path) || '').slice(0, 10), path, path === 'funding.end' && !this.wizard.hasEndDate()) || '';
    // Same object while the markup is unchanged: re-assigning innerHTML on every
    // change detection would trigger DOM observers and loop forever.
    if (markup !== this.calendarCache.get(path)?.markup) this.calendarCache.set(path, { markup, html: this.sanitizer.bypassSecurityTrustHtml(markup) });
    return this.calendarCache.get(path)!.html;
  }
  private calendarCache = new Map<string, { markup: string; html: SafeHtml }>();

  write(key: string, value: string): void { this.wizard.writeField(key, value); }

  ngAfterViewInit(): void {
    const canvas = document.getElementById('canvas');
    if (canvas?.parentNode) {
      this.canvasHome = { parent: canvas.parentNode, next: canvas.nextSibling };
      this.previewMount().nativeElement.appendChild(canvas);
    }
    document.body.classList.add('hw-wizard-active');

    // The preview is read-only while the wizard is open (except its own controls).
    const blockPreview = (e: Event) => {
      if ((e.target as Element).closest(PREVIEW_INTERACTIVE)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    this.previewMount().nativeElement.addEventListener('click', blockPreview, true);

    // Story Builder "back" returns to the wizard.
    const sbBack = () => this.wizard.storyBuilderClosed();
    document.getElementById('sbBack')?.addEventListener('click', sbBack, true);

    // The shared calendar writes the end date itself; sync once it is done.
    const onCalendar = (e: MouseEvent) => {
      if (this.wizard.step() !== 4 || !(e.target as Element).closest?.(CALENDAR_PICK)) return;
      queueMicrotask(() => this.wizard.endDatePicked());
    };
    studioListen(document, 'click', onCalendar);

    // The quick-reset button (handled by the core) asks the wizard to restart.
    const onReset = () => this.wizard.resetToWelcome();
    this.host.nativeElement.addEventListener('ham-wizard-reset-sync', onReset);

    this.destroyRef.onDestroy(() => {
      document.getElementById('sbBack')?.removeEventListener('click', sbBack, true);
      document.removeEventListener('click', onCalendar);
    });
    this.wizard.refreshPreview();
  }

  setPane(pane: 'form' | 'preview'): void {
    if (!window.matchMedia('(max-width:700px)').matches) return;
    this.pane.set(pane);
    this.formContent().nativeElement.scrollTo(0, 0);
    this.previewMount().nativeElement.scrollTo(0, 0);
  }

  onFormInteraction(): void { queueMicrotask(() => this.wizard.clearResolvedWarning()); }

  next(): void { if (this.wizard.next()) this.leave(false); }

  openDemoAsExisting(): void { if (this.wizard.openDemoAsExisting()) this.leave(true); }

  /** The full reset (toolbar), then the new wizard starts from its welcome step. */
  quickReset(event: Event): void {
    event.preventDefault(); event.stopPropagation();
    this.toolbar.reset();
    document.getElementById('hwWizard')?.dispatchEvent(new Event('ham-wizard-reset-sync'));
  }

  loadDemo(kind: 'donation' | 'race', menu: HTMLDetailsElement): void {
    (window as WizardWindow).hamDemoKind = kind;
    menu.open = false;
    this.toolbar.loadDemo(kind);
    this.wizard.display();
    this.wizard.clearResolvedWarning();
  }

  openStoryBuilder(editor: WizardStoryEditorComponent): void {
    this.wizard.storyTextNode().value = editor.element.innerHTML;
    this.wizard.openStoryBuilder();
  }

  /** Moves the preview back to the studio and removes the wizard. */
  private leave(asExistingDemo: boolean): void {
    const canvas = document.getElementById('canvas');
    if (canvas && this.canvasHome) this.canvasHome.parent.insertBefore(canvas, this.canvasHome.next);
    document.body.classList.remove('hw-wizard-active');
    this.finished.emit(asExistingDemo);
  }
}
