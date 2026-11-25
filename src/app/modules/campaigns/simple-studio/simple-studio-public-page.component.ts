import { AfterViewInit, Component, ElementRef, EnvironmentInjector, HostListener, Input, OnChanges, OnDestroy, ViewChild, ViewEncapsulation, createEnvironmentInjector, inject, effect } from '@angular/core';
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
import { AmbassadorService } from '../services/ambassador.service';
import { CampaignDraft, CampaignStudioStateService } from '../services/campaign-studio-state.service';
import { PublicStudioCheckout, SimpleStudioCheckoutService } from './simple-studio-checkout.service';
import { STUDIO_CHECKOUT } from './studio-checkout';
import { CampaignStateService } from './vendor-v462/core/campaign-state.service';
import { EditorService } from './vendor-v462/core/editor.service';
import { STUDIO_SERVICES } from './vendor-v462/core/studio-services';
import { StudioSession } from './vendor-v462/core/studio-session';
import { CampaignRenderFinalizerService } from './vendor-v462/preview/campaign-render-finalizer.service';
import { CampaignCartService } from './vendor-v462/cart/campaign-cart.service';

/** Public host for the exact Angular page used by Studio Preview. No editor or local-draft initialization. */
@Component({
  selector: 'app-simple-studio-public-page',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CampaignJoinDialogComponent],
  template: `<div id="preview" #page dir="rtl" data-renderer="simple-studio-v462"></div>
    @if (joining) { <app-campaign-join-dialog (closed)="joining=false" (joined)="ambassadorsChanged()" /> }
    @if (error) { <p role="alert">{{ error }}</p> }`,
  styles: [`
    app-simple-studio-public-page { display:block; }
    body.hamonym-simple-public { margin:0; background:#fff; overflow:auto !important; height:auto !important; }
    body.hamonym-simple-public #preview { margin:0; width:100%; max-width:none; min-height:0; max-height:none !important; height:auto; overflow:visible; box-shadow:none; border:0; }
    body.hamonym-simple-public #preview .editable { cursor:default; outline:none !important; }
    body.hamonym-simple-public #preview .editable::after { display:none !important; }
    body.hamonym-simple-public #preview .edit-pencil { display:none !important; }
  `]
})
export class SimpleStudioPublicPageComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) draft!: CampaignDraft;
  @Input() ambassadorId?: string;
  @ViewChild('page', { static: true }) page!: ElementRef<HTMLElement>;
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
      this.checkoutContext={draft:this.draft,amount:0,ambassadorId:this.ambassadorId};
      this.payment = this.checkout.paymentAdapter(this.checkoutContext);
      this.environment = createEnvironmentInjector([...STUDIO_SERVICES, {
        provide: STUDIO_CHECKOUT, useValue: { submit: this.payment.submit, enabled: () => this.draft.status === 'published' }
      }, {provide: STUDIO_PUBLIC_ACTIONS, useValue: {
        user: () => { const user=this.auth.currentUser(); return user?{isLoggedIn:true,name:user.full_name,photo:user.picture || undefined}:null; },
        account: (action:string) => this.account(action), donate: () => this.donate(), join: () => {this.joining=true;},
        navigate: (section:string) => this.navigate(section), share: (action:string) => this.share(action),
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
      const cartKey=`hamonym-public-cart:${this.draft.id}`;
      try { const saved=JSON.parse(sessionStorage.getItem(cartKey)||'null'); if(Array.isArray(saved))cart.entries.set(saved); } catch {}
      effect(()=>{try{sessionStorage.setItem(cartKey,JSON.stringify(cart.entries()));}catch{}},{injector:this.environment});
      if(new URLSearchParams(location.search).get('join')==='1')this.joining=true;
      this.subscription = this.platform.draft$.subscribe(draft => this.updateLive(draft));
      this.requests.add(this.ambassadors.listPublic(this.draft.slug).subscribe({ next: items => {
        const modules = this.environment!.get(CampaignStateService).current.management.modules;
        if (modules?.ambassadors) modules.ambassadors.items = items.map(item => ({
          ...modules.ambassadors.items?.find((saved: any) => saved.id === item.id),
          id: item.id, name: item.fullName, target: item.goalAmount, raised: item.raisedTotal,
          url: `/campaigns/${encodeURIComponent(this.draft.slug)}/${encodeURIComponent(item.slug)}`
        }));
        editor.renderPublicPage();
      }, error: () => {} }));
      editor.renderPublicPage();
    } catch (error) { this.error = error instanceof Error ? error.message : 'טעינת הקמפיין נכשלה.'; }
  }

  ngOnChanges(): void { if(this.checkoutContext)this.checkoutContext.ambassadorId=this.ambassadorId; if (this.environment) this.updateLive(this.draft); }

  private account(action:string):void {
    if(action==='logout'){this.auth.logout(this.router.url);return;}
    const path=action==='login'?'/login':action==='register'?'/register':action==='donations'?'/my-donations':'/welcome';
    void this.router.navigate([path],{queryParams:{returnUrl:this.router.url}});
  }

  private donate():void {
    const minimal=this.page.nativeElement.querySelector<HTMLElement>('[ham-simple-donation]');
    if(minimal){minimal.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const box=this.page.nativeElement.querySelector<HTMLElement>('.donation-box');
    if(box){this.navigate('donationBox');if(this.environment!.get(CartStoreService).entries().length)this.environment!.get(CampaignCartService).open(false);else box.querySelector<HTMLButtonElement>('[data-donation-choice]')?.focus({preventScroll:true});}
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
    const path=location.pathname.split('/').filter(Boolean);
    const ambassador=path[2] && path[2]!=='view'?`/${encodeURIComponent(decodeURIComponent(path[2]))}`:'';
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
    this.toast.show('success','ההרשמה לשגרירות הושלמה');
    this.requests.add(this.ambassadors.listPublic(this.draft.slug).subscribe(items=>{
      const modules=this.environment!.get(CampaignStateService).current.management.modules;
      if(modules?.ambassadors)modules.ambassadors.items=items.map(item=>({id:item.id,name:item.fullName,target:item.goalAmount,raised:item.raisedTotal,url:`/campaigns/${this.draft.slug}/${item.slug}`}));
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
    Object.assign(document.content.stats, { raised: draft.currentAmount || 0, donors: draft.supportersCount || 0, goal: draft.targetAmount });
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
        donatedAt: donor.completedAt, dedication: donor.note || ''
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
