import { AfterViewInit, Component, ElementRef, EnvironmentInjector, EventEmitter, HostListener, Input, Output, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewEncapsulation, createEnvironmentInjector, inject, effect, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { STUDIO_PUBLIC_ACTIONS } from './studio-public-actions';
import { CampaignJoinDialogComponent } from '../shared/components/campaign-join-dialog/campaign-join-dialog.component';
import { CartStoreService } from './vendor-v462/cart/cart-store.service';
import { PublicPartsService } from './vendor-v462/public-page/parts/public-parts.service';
import { RaceRegistrationService } from './vendor-v462/races/race-registration.service';
import { Subscription } from 'rxjs';
import { DonationService } from '../services/donation.service';
import { Ambassador, AmbassadorMembership, AmbassadorService } from '../services/ambassador.service';
import { CampaignDraft, CampaignStudioStateService } from '../services/campaign-studio-state.service';
import { PublicStudioCheckout, SimpleStudioCheckoutService } from './simple-studio-checkout.service';
import { STUDIO_CHECKOUT } from './studio-checkout';
import { CampaignStateService } from './vendor-v462/core/campaign-state.service';
import { EditorService } from './vendor-v462/core/editor.service';
import { STUDIO_SERVICES } from './vendor-v462/core/studio-services';
import { StudioSession } from './vendor-v462/core/studio-session';
import { CampaignRenderFinalizerService } from './vendor-v462/preview/campaign-render-finalizer.service';
import { CampaignCardsService } from './vendor-v462/public-page/campaign-cards.service';
import { CampaignCartService } from './vendor-v462/cart/campaign-cart.service';

/** Public host for the exact Angular page used by Studio Preview. No editor or local-draft initialization. */
@Component({
  selector: 'app-simple-studio-public-page',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CampaignJoinDialogComponent],
  template: `<div id="preview" #page dir="rtl" [attr.inert]="ambassadorRouteBlocked ? '' : null" [style.--ham-campaign-accent]="campaignAccent" data-renderer="simple-studio-v462"></div>
    @if (joining) { <app-campaign-join-dialog (closed)="joining=false" (joined)="ambassadorsChanged()" /> }
    @if (error) { <p role="alert">{{ error }}</p> }`,
  styles: [`
    app-simple-studio-public-page { display:block; }
    app-simple-studio-public-page #preview.desktop.layout-panorama > app-public-ambassador-panel {
      inline-size: calc(100% - clamp(20px, 4cqw, 48px));
      margin-inline: auto;
    }
    body.hamonym-simple-public { margin:0; background:#fff; overflow:auto !important; height:auto !important; }
    body.hamonym-simple-public #preview { margin:0; width:100%; max-width:none; min-height:0; max-height:none !important; height:auto; overflow:visible; box-shadow:none; border:0; }
    body.hamonym-simple-public #preview .editable { cursor:default; outline:none !important; }
    body.hamonym-simple-public #preview .editable::after { display:none !important; }
    body.hamonym-simple-public #preview .donation-box :is(.donation-amount,.donation-other).donation-selected,
    body.hamonym-simple-public #preview .donation-box :is(.donation-amount,.donation-other).is-chosen {
      border: 1px solid var(--ham-campaign-accent) !important;
      background: color-mix(in srgb, var(--ham-campaign-accent) 8%, white) !important;
      box-shadow: none !important;
    }
    body.hamonym-simple-public #preview .donation-box .donation-amount:is(.donation-selected,.is-chosen)::after {
      background: var(--ham-campaign-accent) !important;
    }
    body.hamonym-simple-public #preview :is(button,input,a):not(:where([data-hm-public-account-menu] *)):focus-visible {
      outline: 2px solid var(--ham-campaign-accent) !important;
      outline-offset: 2px;
    }
    body.hamonym-simple-public #preview .edit-pencil { display:none !important; }
  `]
})
export class SimpleStudioPublicPageComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) draft!: CampaignDraft;
  @Input() ambassadorId?: string;
  @Input() ambassadorRouteBlocked = false;
  @Input() canEditAmbassador = false;
  @Output() editAmbassador = new EventEmitter<void>();
  @Input() myAmbassador: AmbassadorMembership | null = null;
  @Input() ambassadorLookupReady = true;
  @Output() ambassadorJoined = new EventEmitter<void>();
  @Input() ambassador: Ambassador | null = null;
  @ViewChild('page', { static: true }) page!: ElementRef<HTMLElement>;
  get campaignAccent(): string { return (this.draft.layout.simpleStudio as any)?.theme?.primary || '#246f65'; }
  error = '';
  joining = false;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly parent = inject(EnvironmentInjector);
  private readonly platform = inject(CampaignStudioStateService);
  private readonly checkout = inject(SimpleStudioCheckoutService);
  private readonly donations = inject(DonationService);
  private readonly ambassadors = inject(AmbassadorService);
  private readonly element = inject(ElementRef);
  private environment?: EnvironmentInjector;
  private session?: StudioSession;
  private sheet?: HTMLLinkElement;
  private payment?: ReturnType<SimpleStudioCheckoutService['paymentAdapter']>;
  private checkoutContext?: PublicStudioCheckout;
  private subscription?: Subscription;
  private readonly requests = new Subscription();
  private destroyed = false;
  private lastLive = '';
  private readonly publicActionRevision = signal(0);
  private joinRequested = ['1', 'ambassador'].includes(new URLSearchParams(location.search).get('join') || '');
  private readonly mobile = window.matchMedia('(max-width: 767px)');

  async ngAfterViewInit(): Promise<void> {
    try {
      this.session = StudioSession.begin(this.element.nativeElement);
      document.body.classList.add('hamonym-simple-public');
      await new Promise<void>((resolve, reject) => {
        this.sheet = document.createElement('link');
        this.sheet.rel = 'stylesheet';
        this.sheet.href = '/simple-studio/v462/styles.css';
        this.sheet.onload = () => resolve();
        this.sheet.onerror = () => reject(new Error('לא ניתן לטעון את עיצוב הקמפיין. יש לרענן את הדף.'));
        document.head.append(this.sheet);
      });
      if (this.destroyed) return;
      this.checkoutContext={draft:this.draft,amount:0};
      this.payment = this.checkout.paymentAdapter(this.checkoutContext);
      this.environment = createEnvironmentInjector([...STUDIO_SERVICES, {
        provide: STUDIO_CHECKOUT, useValue: { submit: this.payment.submit, enabled: () => this.draft.status === 'published' && !this.ambassadorRouteBlocked }
      }, {provide: STUDIO_PUBLIC_ACTIONS, useValue: {
        user: () => { const user=this.auth.currentUser(); return user?{isLoggedIn:true,name:user.full_name,photo:user.picture || undefined}:null; },
        account: (action:string) => this.account(action), donate: () => this.donate(), join: () => this.openAmbassadorAction(),
        navigate: (section:string) => this.navigate(section), share: (action:string) => this.share(action),
        donateThroughAmbassador: (id: string) => {
          const instance = this.environment;
          if (!instance || this.draft.status !== 'published' || !this.checkoutContext) return;
          const ambassador = instance.get(CampaignStateService).current.management?.modules?.ambassadors?.items
            ?.find((item: { id?: string }) => item.id === id);
          if (!ambassador?.name) {
            this.toast.show('error', 'לא ניתן לתרום דרך השגריר שנבחר', 'בחרו שגריר פעיל ונסו שוב.');
            return;
          }
          instance.get(CampaignCartService).open(false, undefined, {
            id, name: String(ambassador.name), campaignTitle: this.draft.title, photo: ambassador.photo ? String(ambassador.photo) : undefined,
          });
        },
        isAmbassadorPage: () => {
          this.publicActionRevision();
          return !!this.ambassador;
        },
        ambassadorPanel: () => {
          this.publicActionRevision();
          return this.ambassador ? {
          ambassador: this.ambassador,
          campaignUrl: '/campaigns/' + encodeURIComponent(this.draft.slug) + '/view',
          accent: this.campaignAccent,
          edit: this.canEditAmbassador ? () => this.editAmbassador.emit() : undefined,
          showAmounts: this.environment?.get(CampaignStateService).current.management?.modules?.ambassadors?.publicAmounts !== false,
          } : null;
        },
        campaignAccent: () => this.campaignAccent,
        ambassadorActionLabel: () => {
          this.publicActionRevision();
          return this.ambassadorActionLabel;
        },
        registrationOptions:()=>this.draft.registrationOptions
      }}], this.parent);
      this.environment.get(CampaignStateService).replace(structuredClone(this.draft.layout.simpleStudio) as any);
      const editor = this.environment.get(EditorService);
      editor.setDeviceOnly(this.mobile.matches ? 'mobile' : 'desktop');
      editor.startPublicPage();
      this.environment.get(CampaignRenderFinalizerService).start();
      this.environment.get(CampaignCartService).start();
      this.environment.get(RaceRegistrationService).start();
      const cart=this.environment.get(CartStoreService);
      cart.setPageAmbassador(this.ambassadorId);
      const cartKey=`hamonym-public-cart:${this.draft.id}`;
      try { const saved=JSON.parse(sessionStorage.getItem(cartKey)||'null'); if(Array.isArray(saved))cart.entries.set(saved); } catch {}
      effect(()=>{try{sessionStorage.setItem(cartKey,JSON.stringify(cart.entries()));}catch{}},{injector:this.environment});
      this.maybeOpenRequestedJoin();
      this.subscription = this.platform.draft$.subscribe(draft => this.updateLive(draft));
      this.requests.add(this.ambassadors.listPublic(this.draft.slug).subscribe({ next: items => {
        const modules = this.environment!.get(CampaignStateService).current.management.modules;
        if (modules?.ambassadors) modules.ambassadors.items = items.map(item => ({
          ...modules.ambassadors.items?.find((saved: any) => saved.id === item.id),
          id: item.id, name: item.fullName, ...(item.photoUrl ? { photo: item.photoUrl } : {}), target: item.goalAmount, raised: item.raisedTotal,
          url: `/campaigns/${encodeURIComponent(this.draft.slug)}/${encodeURIComponent(item.slug)}`
        }));
        editor.renderPublicPage();
      }, error: () => {} }));
      editor.renderPublicPage();
    } catch (error) { this.error = error instanceof Error ? error.message : 'טעינת הקמפיין נכשלה.'; }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.environment) return;
    if (changes['ambassadorId'] || changes['ambassadorRouteBlocked']) {
      this.environment.get(CartStoreService).setPageAmbassador(this.ambassadorId);
    }
    if (changes['draft']) this.updateLive(this.draft);
    this.maybeOpenRequestedJoin();
    this.publicActionRevision.update(revision => revision + 1);
    this.environment.get(CampaignCardsService).refreshPublicActions();
  }

  private maybeOpenRequestedJoin(): void {
    if (!this.joinRequested || !this.ambassadorLookupReady) return;
    this.joinRequested = false;
    this.openAmbassadorAction();
  }

  private account(action:string):void {
    if(action==='logout'){this.auth.logout(this.router.url);return;}
    const path=action==='login'?'/login':action==='register'?'/register':action==='donations'?'/my-donations':'/welcome';
    void this.router.navigate([path],{queryParams:{returnUrl:this.router.url}});
  }

  private get ambassadorActionLabel(): string | null {
    if (!this.ambassadorLookupReady || this.draft.status !== 'published') return null;
    if (this.myAmbassador) return this.myAmbassador.status === 'active' && this.myAmbassador.id !== this.ambassador?.id
      ? 'לדף השגריר שלי' : null;
    const ambassadors = this.environment?.get(CampaignStateService).current.management?.modules?.ambassadors;
    return ambassadors?.enabled === false ? null : 'הצטרפו כשגרירים';
  }

  private openAmbassadorAction(): void {
    if (!this.ambassadorLookupReady) return;
    if (this.myAmbassador?.slug) {
      if (this.myAmbassador.status === 'active' && this.myAmbassador.id !== this.ambassador?.id) {
        void this.router.navigate(['/campaigns', this.draft.slug, this.myAmbassador.slug]);
      }
      return;
    }
    if (this.draft.status === 'published' &&
        this.environment?.get(CampaignStateService).current.management?.modules?.ambassadors?.enabled !== false) {
      this.joining = true;
    }
  }

  private donate(fromAmbassadorCard = false):void {
    if (!fromAmbassadorCard) this.environment?.get(CartStoreService).selectDonationAmbassador();
    const minimal=this.page.nativeElement.querySelector<HTMLElement>('[ham-simple-donation]');
    if(minimal){minimal.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const box=this.page.nativeElement.querySelector<HTMLElement>('.donation-box');
    if(box){this.navigate('donationBox');if(!fromAmbassadorCard && this.environment!.get(CartStoreService).entries().length)this.environment!.get(CampaignCartService).open(false);else box.querySelector<HTMLButtonElement>('[data-donation-choice]')?.focus({preventScroll:true});}
    else if(this.environment!.get(CartStoreService).entries().length)this.environment!.get(CampaignCartService).open(false);
    else this.toast.show('info','בחירת סכום לתרומה','בחרו סכום באזור התרומה בקמפיין.');
  }

  private navigate(section:string):void {
    if(section==='donate'){this.donate();return;}
    const preview=this.page.nativeElement;
    if(this.environment!.get(CampaignStateService).current.visible?.[section]===false)return;
    if(!this.environment!.get(PublicPartsService).deviceAllowed(section))return;
    const tab=preview.querySelector<HTMLElement>(`[data-ham-mobile-tab="${section}"], [data-ham-panorama-tab="${section}"]`);
    tab?.click();
    requestAnimationFrame(()=>{
      const target=Array.from(preview.querySelectorAll<HTMLElement>(`[data-part="${section}"], [data-ham-mobile-panel="${section}"], [data-ham-panorama-panel="${section}"]`)).find(e=>e.getClientRects().length && getComputedStyle(e).display!=='none') || tab;
      if(!target)return;
      const header=preview.querySelector<HTMLElement>('[data-part="header"]');
      const sticky=header && ['sticky','fixed'].includes(getComputedStyle(header).position)?header.offsetHeight:0;
      window.scrollTo({top:Math.max(0,scrollY+target.getBoundingClientRect().top-sticky-12),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
  }

  private async share(action:string):Promise<void> {
    if(this.draft.status!=='published'){this.toast.show('warning','הקמפיין עדיין לא פורסם');return;}
    const ambassador = this.ambassador ? '/' + encodeURIComponent(this.ambassador.slug) : '';
    // Same public application origin used by the existing ambassador API; never share a localhost/editor URL.
    const origin=['localhost','127.0.0.1'].includes(location.hostname)?'https://app.hamonym.com':location.origin;
    const url=`${origin}/campaigns/${encodeURIComponent(this.draft.slug)}${ambassador}`;
    const title=this.draft.title;
    const links:Record<string,string>={whatsapp:`https://wa.me/?text=${encodeURIComponent(title+' '+url)}`,facebook:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,telegram:`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`};
    try{
      if(links[action]){window.open(links[action],'_blank','noopener,noreferrer');return;}
      if(action==='native' && navigator.share){await navigator.share({title,url});return;}
      await navigator.clipboard.writeText(url);this.toast.show('success','הקישור הועתק');
    }catch(error){if((error as Error).name!=='AbortError')this.toast.show('error','לא ניתן לשתף את הקישור','אפשר להעתיק את כתובת הקמפיין מסרגל הכתובת.');}
  }

  ambassadorsChanged():void {
    this.ambassadorJoined.emit();
    this.toast.show('success','ההרשמה לשגרירות הושלמה');
    this.requests.add(this.ambassadors.listPublic(this.draft.slug).subscribe(items=>{
      const modules=this.environment!.get(CampaignStateService).current.management.modules;
      if(modules?.ambassadors)modules.ambassadors.items=items.map(item=>({id:item.id,name:item.fullName,photo:item.photoUrl,target:item.goalAmount,raised:item.raisedTotal,url:`/campaigns/${this.draft.slug}/${item.slug}`}));
      this.environment!.get(EditorService).renderPublicPage();
    }));
  }

  private updateLive(draft: CampaignDraft): void {
    if (!this.environment || draft.id !== this.draft.id) return;
    const live = JSON.stringify([draft.currentAmount, draft.supportersCount, draft.targetAmount, draft.endDate]);
    if (live === this.lastLive) return;
    this.lastLive = live;
    const document = this.environment.get(CampaignStateService).current;
    // Presentation stays in the saved document; only authoritative live business counters are projected.
    const end = draft.endDate ? Date.parse(draft.endDate) : NaN;
    Object.assign(document.content.stats, { raised: draft.currentAmount || 0, donors: draft.supportersCount || 0,
      goal: draft.targetAmount, meterDays: Number.isFinite(end) ? Math.max(0, Math.ceil((end - Date.now()) / 86400000)) : null });
    for(const item of document.content.rewards?.items || []){
      const reward=draft.offerings.find(row=>row.id===item.businessId);
      if(reward){item.amount=reward.minimumAmount;item.stockEnabled=reward.stock!==null;item.quantity=reward.stock ?? 0;}
    }
    this.requests.add(this.donations.getRewardCounts(draft.slug).subscribe({next:counts=>{
      for(const item of document.content.rewards?.items || []){
        const reward=draft.offerings.find(row=>row.id===item.businessId);
        if(reward?.stock!==null && reward?.stock!==undefined)item.quantity=Math.max(0,reward.stock-(counts[reward.id]||0));
      }
      this.environment?.get(EditorService).renderPublicPage();
    },error:()=>{}}));
    this.environment.get(EditorService).renderPublicPage();
    this.requests.add(this.donations.getDonors(draft.slug).subscribe({ next: result => {
      if (document.management.modules?.donors) document.management.modules.donors.items = result.donors.map(donor => ({
        name: donor.name, amount: donor.amount, isAnonymous: donor.isAnonymous,
        donatedAt: donor.completedAt, dedication: donor.isAnonymous ? '' : donor.note || '',
        ambassadorName: donor.isAnonymous ? undefined : donor.ambassadorName
      }));
      this.environment?.get(EditorService).renderPublicPage();
    }, error: () => {} }));
  }

  @HostListener('window:resize') resized(): void {
    if (!this.environment) return;
    const editor = this.environment.get(EditorService);
    const device = this.mobile.matches ? 'mobile' : 'desktop';
    if (editor.device() !== device) { editor.setDeviceOnly(device); editor.renderPublicPage(); }
    else editor.syncDonationCtas();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription?.unsubscribe();
    this.requests.unsubscribe();
    this.payment?.destroy();
    this.environment?.destroy();
    this.sheet?.remove();
    this.session?.end();
  }
}
