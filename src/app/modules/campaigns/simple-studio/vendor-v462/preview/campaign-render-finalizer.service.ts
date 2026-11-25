import { Injectable, OnDestroy, inject } from '@angular/core';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { DonationBoxComponent } from '../public-page/cards/donation-box.component';
import { EditorService } from '../core/editor.service';

import { studioListen } from '../core/studio-session';
type CampaignWindow = Window & { hamUnifiedCart?: { removeSelectedDonation?: () => void; toggleReward?: (index:number)=>void } };

/**
 * The public page's click handlers: the mobile and panorama tabs, the rewards shortcut, the mobile view
 * buttons, a donation box's amounts, a reward's donate button and a race's registration. The tabs and the
 * shortcut are rendered by PublicPageComponent since v4.48; since v4.49 the render hook
 * (`hamFinishCampaignRender`) has nothing left to do and is a no-op the core still calls.
 */
@Injectable({ providedIn:'root' })
export class CampaignRenderFinalizerService implements OnDestroy {
  private readonly w = window as CampaignWindow;
  private readonly parts = inject(PublicPartsService);
  private readonly editor = inject(EditorService);
  private started = false;
  start():void {
    if (this.started) return;
    this.started = true;
    studioListen(window, 'click',this.onClick,true);
    studioListen(document, 'click', this.onUpdatesSortClick, true);
    studioListen(document, 'keydown', this.onUpdatesSortEscape);
    studioListen(document, 'click', this.onPublicHeaderNavClick, true);
    studioListen(document, 'keydown', this.onPublicHeaderNavEscape, true);
  }
  // Former legacy 041.js: navigation remains wired to the same existing tabs.
  private readonly onPublicHeaderNavClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLButtonElement>('#preview .header-dropdown button');
    if (!item) return;
    const preview = document.getElementById('preview');
    const dropdown = item.closest<HTMLElement>('.header-dropdown');
    if (!preview || !dropdown) return;
    const names: Record<string,string> = {
      'סיפור':'story','הסיפור':'story','תשורות':'rewards','תורמים':'donors',
      'שגרירים':'ambassadors','תגובות':'comments','עדכונים':'updates',
      'חסויות':'sponsors','שותפים':'sponsors'
    };
    const key = item.dataset['navTarget'] || names[item.textContent?.trim() || ''];
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // v4.53: the header renders its closed dropdown (its toggle's label was always 'פתיחת תפריט').
    this.parts.header?.closeMenu();
    const mobile = preview.querySelector<HTMLElement>(`.ham-mobile-tabs [data-ham-mobile-tab="${key}"]`);
    if (mobile) {
      mobile.click();
      mobile.closest<HTMLElement>('.ham-mobile-content')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const desktop = preview.querySelector<HTMLElement>(`.ham-panorama-tabs [data-ham-panorama-tab="${key}"]`);
    if (desktop) {
      desktop.click();
      desktop.closest<HTMLElement>('.ham-panorama-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const section = preview.querySelector<HTMLElement>(`[data-part="${key}"]`);
    if(section) section.scrollIntoView({behavior:'smooth',block:'start'});
    else preview.querySelector<HTMLElement>(`.nav-component [data-nav-target="${key}"]`)?.click();
  };
  private readonly onPublicHeaderNavEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    const preview = document.getElementById('preview');
    const menu = preview?.querySelector<HTMLElement>('.header-dropdown');
    if (menu && !menu.hidden) this.parts.header?.closeMenu();
  };

  // Replaces v0.1.147 updates sorting popover (legacy 025.js).
  private closeUpdatesSortMenus():void {
    document.querySelectorAll<HTMLElement>('#preview .ham-updates-stable-sort .ham-custom-sort-pop').forEach(menu => {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute('aria-expanded','false');
    });
  }
  private readonly onUpdatesSortClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest<HTMLElement>('#preview [data-ham-stable-sort-toggle]');
    if (toggle) {
      event.preventDefault();event.stopImmediatePropagation();
      const menu = toggle.nextElementSibling as HTMLElement | null;
      if (!menu) return;
      const shouldShow = menu.hidden;
      this.closeUpdatesSortMenus();
      menu.hidden = !shouldShow;
      toggle.setAttribute('aria-expanded',String(shouldShow));
      return;
    }
    const option = target.closest<HTMLElement>('#preview [data-ham-stable-sort-value]');
    if (option) {
      event.preventDefault();event.stopImmediatePropagation();
      const select = option.closest('.ham-updates-controls')?.querySelector<HTMLSelectElement>('[data-ham-update-sort]');
      if (select) {
        select.value = option.dataset['hamStableSortValue'] || '';
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      option.parentElement?.querySelectorAll<HTMLElement>('[data-ham-stable-sort-value]').forEach(el => el.setAttribute('aria-selected',String(el===option)));
      this.closeUpdatesSortMenus();
      return;
    }
    if (!target.closest('#preview .ham-updates-stable-sort')) this.closeUpdatesSortMenus();
  };
  private readonly onUpdatesSortEscape = (event: KeyboardEvent):void => {
    if (event.key === 'Escape') this.closeUpdatesSortMenus();
  };

  private readonly onClick=(event:MouseEvent):void=>{
    const target=event.target;if(!(target instanceof Element))return;
    // v4.60: the wizard's quick reset is its own (click) binding (StudioToolbarService.reset).
    const jump=target.closest('#preview [data-ham-jump-rewards]');
    if(jump){
      const tab=document.querySelector<HTMLElement>('#preview .ham-mobile-tabs [data-ham-mobile-tab="rewards"], #preview .ham-panorama-tabs [data-ham-panorama-tab="rewards"]');
      if(tab){tab.click();tab.closest<HTMLElement>('.ham-mobile-content,.ham-panorama-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});}
      else {document.querySelector<HTMLElement>('#preview .ham-desktop-story-column [data-part="rewards"],#preview .campaign-body [data-part="rewards"]')?.scrollIntoView({behavior:'smooth',block:'start'});}
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    // One navigation transaction for panorama regardless of which adapter
    // created the tab. The sidebar shortcut dispatches to this same handler.
    const desktopTab=target.closest<HTMLElement>('#preview .ham-panorama-tabs [data-ham-panorama-tab]');
    if (desktopTab) {
      const id=desktopTab.dataset['hamPanoramaTab'];
      if (id) this.editor.panoramaSelectTab(id);
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    // v4.53: the tab buttons and panels render the chosen tab (PublicPartsService `selectMobileTab`).
    const tab=target.closest<HTMLElement>('#preview [data-ham-mobile-tab]');
    if(tab){
      const id=tab.dataset['hamMobileTab'];
      if(id)this.parts.setMobileTab(id);
      if(tab.closest('.ham-mobile-content')&&id)this.parts.selectMobileTab(id);
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    // v4.53: a donation box's amounts render their choice (DonationBoxComponent `choose`).
    const choice=target.closest<HTMLElement>('#preview .donation-box [data-donation-choice],#preview .donation-box [data-donation-other]');
    if(choice){const box=DonationBoxComponent.of(choice.closest('.donation-box'));if(box){
      const key=choice.dataset['donationChoice']??'other';
      if(box.selected===key){
        box.clear();
        this.w.hamUnifiedCart?.removeSelectedDonation?.();event.preventDefault();event.stopImmediatePropagation();return;
      }
      box.choose(key);
    }}
    const reward=target.closest<HTMLElement>('#preview .reward-tile[data-reward-index] button[data-donate]');
    if(reward&&this.w.hamUnifiedCart?.toggleReward){const card=reward.closest<HTMLElement>('[data-reward-index]');if(card){this.w.hamUnifiedCart.toggleReward(Number(card.dataset['rewardIndex']));event.preventDefault();event.stopImmediatePropagation();}return;}
    // v4.61: no card renders `[data-race-register]` since v4.47 (race cards use `[data-ham-race-open]`, RaceRegistrationService).
  };
  ngOnDestroy():void {
    if(!this.started)return;
    window.removeEventListener('click',this.onClick,true);
    document.removeEventListener('click', this.onUpdatesSortClick, true);
    document.removeEventListener('keydown', this.onUpdatesSortEscape);
    document.removeEventListener('click', this.onPublicHeaderNavClick, true);
    document.removeEventListener('keydown', this.onPublicHeaderNavEscape, true);
    this.started=false;
  }
}
