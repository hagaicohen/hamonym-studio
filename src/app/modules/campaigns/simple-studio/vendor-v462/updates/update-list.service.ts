import { ApplicationRef, ComponentRef, createComponent, EnvironmentInjector, Injectable, OnDestroy } from '@angular/core';
import { UpdateDetail, UpdateDetailComponent } from './update-detail.component';
import { CampaignStateService } from '../core/campaign-state.service';

import { studioAdopt, studioListen } from '../core/studio-session';
/** Replaces legacy 015.js view-mode bookkeeping, filtering, and update dialog. */
@Injectable({providedIn:'root'})
export class UpdateListService implements OnDestroy {
  constructor(private readonly appRef:ApplicationRef,private readonly injector:EnvironmentInjector,private readonly state:CampaignStateService){}
  private running=false;
  private dialog?:ComponentRef<UpdateDetailComponent>;
  private host?:HTMLElement;
  private readonly timers=new Set<ReturnType<typeof setTimeout>>();
  private readonly syncModes=():void=>document.querySelectorAll<HTMLElement>('#preview [data-ham-view-mode],#preview [data-display-mode]').forEach(panel=>this.manageMode(panel));
  private manageMode(panel:HTMLElement):void {
    const carousel=(panel.dataset['hamViewMode']||panel.dataset['displayMode'])==='carousel';
    const list=panel.querySelector<HTMLElement>('.donors-items,.ambassador-collection,.ham-update-grid');if(!list)return;
    const more=panel.querySelector<HTMLElement>('[data-load],[data-amb-more],[data-public-more]');if(more)more.hidden=carousel;
    if(carousel){
      list.querySelectorAll<HTMLElement>('[data-public-index]').forEach(card=>card.style.removeProperty('display'));
      const wrapper=list.closest<HTMLElement>('.ham-inline-carousel');
      if(wrapper){list.scrollLeft=0;wrapper.dataset['hamIndex']='0';}
    }
  }
  private filter(section:HTMLElement):void {
    const input=section.querySelector<HTMLInputElement>('[data-ham-update-search]');
    const sort=section.querySelector<HTMLSelectElement>('[data-ham-update-sort]');
    const track=section.querySelector<HTMLElement>('.ham-update-grid');if(!track)return;
    const query=(input?.value||'').trim().toLocaleLowerCase('he');
    const cards=Array.from(track.querySelectorAll<HTMLElement>(':scope > .ham-update-card'));
    const ordered=cards.slice().sort((a,b)=>sort?.value==='title'
      ?(a.querySelector('h3')?.textContent||'').localeCompare(b.querySelector('h3')?.textContent||'','he')
      :sort?.value==='old'?cards.indexOf(b)-cards.indexOf(a):cards.indexOf(a)-cards.indexOf(b));
    ordered.forEach(card=>{card.hidden=!!query&&!(card.textContent||'').toLocaleLowerCase('he').includes(query);track.appendChild(card);});
  }
  private open(card:HTMLElement):void {
    this.closeDialog();
    const idx=Number(card.dataset['hamUpdateIndex']);
    // The update's own data: the campaign's main update, then the management screen's updates (by index).
    const doc:any=this.state.peek();
    let model:{text?:string;image?:string;videoUrl?:string;video?:string}|undefined;
    try{model=Number.isFinite(idx)?[doc.content.updates,...(doc.management?.modules?.updates?.items||[])][idx]:undefined;}catch{model=undefined;}
    const detail:UpdateDetail={
      title:card.querySelector('h3')?.textContent||'עדכון הקמפיין',
      date:card.querySelector('.ham-update-date')?.textContent||'',
      content:model?.text||card.querySelector('.ham-update-text')?.textContent||'',
      image:model?.image||card.querySelector('.ham-update-photo img')?.getAttribute('src')||'',
      video:String(model?.videoUrl||model?.video||card.dataset['videoUrl']||'').trim()
    };
    const host=document.createElement('div');document.body.append(studioAdopt(host));this.host=host;
    this.dialog=createComponent(UpdateDetailComponent,{environmentInjector:this.injector,hostElement:host});
    this.dialog.setInput('detail',detail);
    this.dialog.instance.close.subscribe(()=>this.closeDialog());
    this.appRef.attachView(this.dialog.hostView);this.dialog.changeDetectorRef.detectChanges();
    host.querySelector<HTMLButtonElement>('.ham-close-detail')?.focus();
  }
  private closeDialog():void {
    if(this.dialog){this.appRef.detachView(this.dialog.hostView);this.dialog.destroy();this.dialog=undefined;}
    this.host?.remove();this.host=undefined;
  }
  private defer(fn:()=>void):void {
    const timer=setTimeout(()=>{this.timers.delete(timer);if(this.running)fn();},0);this.timers.add(timer);
  }
  private readonly onClick=(event:MouseEvent):void=>{
    if(!(event.target instanceof Element))return;
    const update=event.target.closest<HTMLElement>('#preview .ham-update-card');
    if(update){event.stopPropagation();this.open(update);return;}
    const switcher=event.target.closest<HTMLElement>('#preview [data-ham-view],#preview [data-ham-mobile-view]');
    if(switcher){this.defer(()=>{const panel=switcher.closest<HTMLElement>('[data-ham-view-mode],[data-display-mode]');if(panel)this.manageMode(panel);});return;}
    if(event.target.closest('#preview [data-ham-panorama-tab],#preview [data-ham-mobile-tab]'))this.defer(this.syncModes);
  };
  private readonly onInput=(event:Event):void=>{
    if(event.target instanceof Element&&event.target.matches('#preview [data-ham-update-search]')){
      const section=event.target.closest<HTMLElement>('.ham-updates');if(section)this.filter(section);
    }
  };
  private readonly onChange=(event:Event):void=>{
    if(event.target instanceof Element&&event.target.matches('#preview [data-ham-update-sort]')){
      const section=event.target.closest<HTMLElement>('.ham-updates');if(section)this.filter(section);
    }
  };
  start():void {
    if(this.running)return;this.running=true;
    studioListen(document, 'click',this.onClick,true);
    studioListen(document, 'input',this.onInput);
    studioListen(document, 'change',this.onChange);
    this.syncModes();
  }
  ngOnDestroy():void {
    this.running=false;document.removeEventListener('click',this.onClick,true);
    document.removeEventListener('input',this.onInput);document.removeEventListener('change',this.onChange);
    for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.closeDialog();
  }
}
