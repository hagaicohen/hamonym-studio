import { AfterViewInit, Component, OnDestroy, ViewChild, ViewContainerRef, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CampaignApiService } from '../services/campaign-api.service';
import { CampaignDraft, CampaignStudioStateService } from '../services/campaign-studio-state.service';
import { CurrentContextService } from '../../../core/services/current-context.service';
import { AppLoaderService } from '../../../core/services/app-loader.service';
import { AppComponent as StudioComponent } from './vendor-v454/app.component';
import { CampaignDraftStorageService, HamDraftStorageBridge } from './vendor-v454/persistence/campaign-draft-storage.service';
import { CampaignStateService } from './vendor-v454/core/campaign-state.service';
import { blankCampaign } from './vendor-v454/core/campaign-defaults';

@Component({
  selector: 'app-simple-studio-page',
  standalone: true,
  host: { 'data-hamonym-editor': 'simple-studio-v4.54' },
  template: `<p dir="rtl" role="status">{{ message }}</p><ng-container #studio />`,
})
export class SimpleStudioPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('studio', { read: ViewContainerRef, static: true }) private host!: ViewContainerRef;
  private readonly api = inject(CampaignApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(CurrentContextService);
  private readonly loader = inject(AppLoaderService);
  private readonly platformState = inject(CampaignStudioStateService);
  private readonly storage = inject(CampaignDraftStorageService);
  private readonly studioState = inject(CampaignStateService);
  private campaign!: CampaignDraft;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private savedDocument = '';
  private localDocument = '';
  private observer?: MutationObserver;
  private controls?: HTMLElement;
  private sheet?: HTMLLinkElement;
  private isolation?: HTMLStyleElement;
  private destroyed = false;
  message = 'טוען את הקמפיין…';

  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  };

  async ngAfterViewInit(): Promise<void> {
    try {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.campaign = await firstValueFrom(this.api.getById(id));
      } else {
        const active = this.context.active();
        if (active?.role !== 'entity-manager' || !active.context?.id) throw new Error('יש לבחור ארגון ליצירת קמפיין');
        this.platformState.reset();
        this.campaign = { ...this.platformState.draft, entityId: active.context.id };
      }
      if (this.destroyed) return;
      const studioDocument = this.campaign.layout.simpleStudio ?? this.initialDocument(!!id);
      this.localDocument = JSON.stringify(studioDocument);
      this.savedDocument = this.campaign.layout.simpleStudio ? this.localDocument : '';

      // Install before Studio's start(): its storage service retains this instance.
      this.storage.start();
      const local = window.hamAngularDraftStorage!;
      const recoveryKey = `hamonym-simple-studio:${id ?? crypto.randomUUID()}`;
      const adapter: HamDraftStorageBridge = {
        persistent: local.persistent,
        getItem: key => key === 'hamonym-studio-v01' ? this.localDocument : local.getItem(key),
        setItem: (key, value) => {
          if (key === 'hamonym-studio-v01') {
            local.setItem(recoveryKey, value);
            this.localDocument = value;
          } else local.setItem(key, value);
        },
        setItemAsync: (key, value) => {
          if (key !== 'hamonym-studio-v01') return Promise.resolve();
          // Each immutable snapshot waits for its predecessor, including failed saves.
          this.pending++;
          const save = this.queue.then(() => this.save(value));
          this.queue = save.catch(() => {});
          return save.finally(() => { this.pending--; });
        },
      };
      window.hamAngularDraftStorage = adapter;
      await this.loadStyles();
      if (this.destroyed) return;
      this.isolation = document.createElement('style');
      this.isolation.textContent = 'body > app-root { display: none !important; }';
      document.head.append(this.isolation);
      this.loader.forceHide();
      this.mountControls();
      window.addEventListener('beforeunload', this.beforeUnload);
      this.observer = new MutationObserver(() => {
        const ready = document.documentElement.dataset['hamBridgeReady'];
        if (ready === 'true') {
          this.observer?.disconnect();
          this.message = '';
        } else if (ready === 'error') {
          this.observer?.disconnect();
          this.controls?.append(' — הפעלת Studio נכשלה; ניתן לחזור לרשימה או לעורך הקודם.');
        }
      });
      this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ham-bridge-ready'] });
      this.host.createComponent(StudioComponent).changeDetectorRef.detectChanges();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'טעינת הקמפיין נכשלה';
      this.loader.forceHide();
      this.isolation?.remove();
    }
  }

  private initialDocument(existing: boolean): Record<string, unknown> {
    const doc = blankCampaign();
    const draft = this.campaign;
    doc.content.hero.title = draft.title;
    doc.content.hero.subtitle = draft.shortDescription;
    doc.content.hero.image = draft.coverImageUrl ?? '';
    doc.content.hero.video = draft.videoUrl ?? '';
    doc.content.hero.orgLogo = draft.campaignLogoUrl ?? draft.entityLogo ?? '';
    doc.content.hero.showOrgLogo = !!doc.content.hero.orgLogo;
    doc.content.title.title = draft.title;
    doc.content.title.subtitle = draft.shortDescription;
    doc.content.title.description = draft.layout.projectDescription ?? '';
    doc.content.stats.goal = draft.targetAmount;
    doc.content.campaignInfo.endAt = draft.endDate ?? '';
    doc.content.campaignInfo.category = draft.category ?? '';
    doc.content.campaignInfo.manager = draft.managerName ?? '';
    doc.content.donate.boxAmounts = [...draft.suggestedAmounts];
    doc.management = {
      entryWizard: { step: -1, status: existing ? 'complete' : 'draft', version: 2 },
      campaignKind: draft.layout.pageFormat === 'minimal' ? 'simple' : 'donation',
      modules: Object.fromEntries(['rewards', 'races', 'sponsors', 'ambassadors', 'updates', 'donors', 'comments'].map(key => [key, { items: [] }])),
    };
    return doc;
  }

  private async save(value: string): Promise<void> {
    const document = JSON.parse(value) as Record<string, unknown>;
    try {
      if (!this.campaign.id) {
        this.campaign = await firstValueFrom(this.api.create(this.campaign.entityId!, {
          ...this.campaign,
          layout: { ...this.campaign.layout, simpleStudio: document },
        }));
        // Keep the mounted editor, selection and history; only replace its URL.
        history.replaceState(history.state, '', `/campaigns/${this.campaign.id}/simple-studio`);
      } else {
        this.campaign = await firstValueFrom(this.api.saveSimpleStudio(this.campaign.id, this.campaign.layout, document));
      }
      this.savedDocument = value;
    } catch (error) {
      const response = error as { error?: { error?: string; message?: string }; message?: string };
      throw new Error(response.error?.error ?? response.error?.message ?? response.message ?? 'שמירה לשרת נכשלה');
    }
  }

  private loadStyles(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sheet = document.createElement('link');
      this.sheet.rel = 'stylesheet';
      this.sheet.href = '/studio-v454.css';
      this.sheet.onload = () => resolve();
      this.sheet.onerror = () => reject(new Error('טעינת עיצוב Studio נכשלה'));
      document.head.append(this.sheet);
    });
  }

  private mountControls(): void {
    this.controls = document.createElement('nav');
    this.controls.dir = 'rtl';
    this.controls.setAttribute('aria-label', 'ניווט מסביבת העריכה');
    this.controls.setAttribute('data-hamonym-studio-navigation', '');
    this.controls.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;box-sizing:border-box;height:32px;padding:0 12px;background:#fff;border-bottom:1px solid #e7ebef;font:12px sans-serif';
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.textContent = 'יציאה לקמפיינים';
    exit.style.cssText = 'height:26px;padding:0 10px;border:1px solid #dce5e1;border-radius:6px;background:#fff;color:#203a36;cursor:pointer;font:inherit';
    exit.onclick = () => this.leave('/campaigns');
    this.controls.append(exit);
    document.body.prepend(this.controls);
  }

  private hasUnsavedChanges(): boolean {
    const current = this.studioState.peek();
    return this.pending > 0 || (!!current && JSON.stringify(current) !== this.savedDocument);
  }

  leave(url: string): false {
    if (!this.hasUnsavedChanges() || confirm('יש שינויים שטרם נשמרו לשרת. לצאת בכל זאת?')) {
      window.removeEventListener('beforeunload', this.beforeUnload);
      // v4.54 owns body-level DOM/global listeners; a full navigation isolates it.
      location.assign(url);
    }
    return false;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.sheet?.remove();
    this.isolation?.remove();
    this.controls?.remove();
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
