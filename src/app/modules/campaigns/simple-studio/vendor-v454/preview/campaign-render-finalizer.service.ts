import { Injectable, OnDestroy, inject } from '@angular/core';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { DonationBoxComponent } from '../public-page/cards/donation-box.component';

type CampaignWindow = Window & {
  hamMobileCurrentTab?: string;
  hamMobileView?: Record<string,string>;
  hamFinishCampaignRender?: () => void;
  hamPanoramaActiveTabBridge?: () => string;
  hamPanoramaSelectTab?: (id:string) => void;
  hamRewardsMainPlacementBridge?: () => boolean;
  hamRaceRegistrationBridge?: (index:number) => void;
  hamUnifiedCart?: { removeSelectedDonation?: () => void; toggleReward?: (index:number)=>void };
};

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
  private started = false;
  start():void {
    if (this.started) return;
    this.started = true;
    this.w.hamMobileCurrentTab ||= 'story';
    this.w.hamMobileView ||= {donors:'grid',ambassadors:'carousel',comments:'list',updates:'list'};
    // v4.49: nothing is left to do after a render. The header's controls, the mobile action bar and a race's
    // participants are in the page's template; the shared headers and the updates' sort found nothing to change
    // (the blocks are components); a donation box's chosen amount was re-applied to a box the render had
    // already replaced. The hook stays: the core calls it after each render.
    this.w.hamFinishCampaignRender = () => {};
    window.addEventListener('click',this.onClick,true);
  }
  private readonly onClick=(event:MouseEvent):void=>{
    const target=event.target;if(!(target instanceof Element))return;
    const reset=target.closest<HTMLElement>('[data-ham-quick-reset]');
    if(reset){const button=document.getElementById('resetBtn');if(button){event.preventDefault();event.stopImmediatePropagation();button.click();document.getElementById('hwWizard')?.dispatchEvent(new Event('ham-wizard-reset-sync'));}return;}
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
      if (id) this.w.hamPanoramaSelectTab?.(id);
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    // v4.53: the tab buttons and panels render the chosen tab (PublicPartsService `selectMobileTab`).
    const tab=target.closest<HTMLElement>('#preview [data-ham-mobile-tab]');
    if(tab){
      this.w.hamMobileCurrentTab=tab.dataset['hamMobileTab'];
      if(tab.closest('.ham-mobile-content')&&this.w.hamMobileCurrentTab)this.parts.selectMobileTab(this.w.hamMobileCurrentTab);
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
    const race=target.closest<HTMLElement>('#preview [data-race-register]');
    if(race&&this.w.hamRaceRegistrationBridge){this.w.hamRaceRegistrationBridge(Number(race.dataset['raceRegister']));event.preventDefault();event.stopImmediatePropagation();}
  };
  ngOnDestroy():void {
    if(!this.started)return;
    window.removeEventListener('click',this.onClick,true);
    this.started=false;
  }
}
