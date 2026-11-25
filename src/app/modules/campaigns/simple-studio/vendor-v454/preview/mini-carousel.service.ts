import { Injectable, OnDestroy } from '@angular/core';

/** Angular lifecycle replacement for editor-preview behaviors in legacy 013.js.
 * The exported standalone public-page snapshot still embeds its own script in 000.js.
 */
@Injectable({providedIn:'root'})
export class MiniCarouselService implements OnDestroy {
  private running = false;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private frame = 0;
  private readonly trackScroll = new WeakMap<HTMLElement, EventListener>();
  private readonly mountedTracks = new Set<HTMLElement>();
  private readonly items = (track:HTMLElement): HTMLElement[] => Array.from(track.children).filter((e):e is HTMLElement => e instanceof HTMLElement && !e.matches('.ham-mini-arrow'));
  private visibleCount(track:HTMLElement):number {
    const cards=this.items(track);
    if(!cards.length) return 1;
    const w=cards[0].getBoundingClientRect().width||track.clientWidth;
    const gap=parseFloat(getComputedStyle(track).gap)||10;
    return Math.max(1,Math.min(cards.length,Math.round((track.clientWidth+gap)/(w+gap))||1));
  }
  private maxIndex(track:HTMLElement):number {return Math.max(0,this.items(track).length-this.visibleCount(track));}
  private currentIndex(track:HTMLElement):number {
    const right=track.getBoundingClientRect().right;
    let result=0, distance=Infinity;
    this.items(track).forEach((item,i)=>{
      if(i>this.maxIndex(track))return;
      const next=Math.abs(item.getBoundingClientRect().right-right);
      if(next<distance){distance=next;result=i;}
    });
    return result;
  }
  private refreshWrapper(wrapper:HTMLElement):void {
    const track=wrapper.querySelector<HTMLElement>('[data-ham-arrow-track]');
    if(!track)return;
    const index=this.currentIndex(track),max=this.maxIndex(track);
    wrapper.classList.toggle('ham-no-arrows',max===0);
    const prev=wrapper.querySelector<HTMLButtonElement>('[data-mini-prev]');
    const next=wrapper.querySelector<HTMLButtonElement>('[data-mini-next]');
    if(prev)prev.disabled=index<=0;
    if(next)next.disabled=index>=max;
    wrapper.dataset['index']=String(index);
  }
  private navigate(wrapper:HTMLElement,direction:number):void {
    const track=wrapper.querySelector<HTMLElement>('[data-ham-arrow-track]');
    if(!track)return;
    const cards=this.items(track);if(!cards.length)return;
    const index=Math.max(0,Math.min(this.maxIndex(track),Number(wrapper.dataset['index']||0)+direction));
    wrapper.dataset['index']=String(index);
    track.scrollBy({left:cards[index].getBoundingClientRect().right-track.getBoundingClientRect().right,behavior:'smooth'});
    this.refreshWrapper(wrapper);
  }
  private attach(track:HTMLElement):void {
    if(track.closest('.ham-mini-carousel'))return;
    const wrapper=document.createElement('div');wrapper.className='ham-mini-carousel';
    track.before(wrapper);wrapper.append(track);track.dataset['hamArrowTrack']='1';
    for(const [attr,label,dir] of [['data-mini-prev','›',-1],['data-mini-next','‹',1]] as const){
      const button=document.createElement('button');button.type='button';button.className='ham-mini-arrow';
      button.setAttribute(attr,'');button.setAttribute('aria-label',dir===1?'הבא':'הקודם');button.textContent=label;
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.navigate(wrapper,dir);});
      wrapper.append(button);
    }
    const onScroll=()=>{if(!this.running)return;requestAnimationFrame(()=>this.refreshWrapper(wrapper));};
    track.addEventListener('scroll',onScroll,{passive:true});this.trackScroll.set(track,onScroll);this.mountedTracks.add(track);
    this.refreshWrapper(wrapper);
  }
  refresh():void {
    if(!this.running)return;
    document.querySelectorAll<HTMLElement>('#preview .ham-panorama-tab-panel[data-ham-view-mode="carousel"],#preview .ham-mobile-tab-panel[data-display-mode="carousel"]').forEach(panel=>{
      const track=panel.querySelector<HTMLElement>('.donors-items,.ambassador-collection,.ham-comment-grid,.ham-update-grid');
      if(track)this.attach(track);
    });
    document.querySelectorAll<HTMLElement>('#preview .ham-carousel-shell .ham-carousel-track').forEach(track=>{
      track.style.setProperty('scrollbar-width','none','important');track.style.setProperty('overflow-x','hidden','important');
    });
    document.querySelectorAll<HTMLElement>('#preview.preview.mobile .ham-mobile-offers,#preview.preview.mobile [data-part="sponsors"]').forEach(section=>{
      for(const selector of ['.reward-tiles','.ham-race-grid','.sponsor-grid']){
        const track=section.querySelector<HTMLElement>(selector);
        if(track&&!track.closest('.ham-carousel-stage'))this.attach(track);
      }
    });
    document.querySelectorAll<HTMLElement>('#preview .ham-mini-carousel').forEach(wrapper=>this.refreshWrapper(wrapper));
  }
  private readonly onViewClick=(event:MouseEvent):void=>{
    const button=event.target instanceof Element?event.target.closest<HTMLElement>('#preview [data-ham-view],#preview [data-ham-mobile-view]'):null;
    if(!button)return;
    const panel=button.closest<HTMLElement>('.ham-panorama-tab-panel,.ham-mobile-tab-panel');if(!panel)return;
    const mode=button.dataset['hamView']||button.dataset['hamMobileView'];if(!mode)return;
    event.preventDefault();event.stopImmediatePropagation();
    panel.dataset[panel.classList.contains('ham-mobile-tab-panel')?'displayMode':'hamViewMode']=mode;
    panel.querySelectorAll<HTMLElement>('[data-ham-view],[data-ham-mobile-view]').forEach(option=>{
      const active=(option.dataset['hamView']||option.dataset['hamMobileView'])===mode;
      option.classList.toggle('ham-view-active',active);option.setAttribute('aria-pressed',String(active));
    });
    if(mode==='carousel')this.refresh();
  };
  private readonly onResize=():void=>this.refresh();
  start():void {
    if(this.running)return;this.running=true;
    document.addEventListener('click',this.onViewClick,true);
    window.addEventListener('resize',this.onResize,{passive:true});
    this.refresh();
    const preview=document.getElementById('preview');
    if(preview){this.observer=new MutationObserver(records=>{
      // Avoid unnecessary self-trigger cycles when only button states change.
      if(!records.some(r=>Array.from(r.addedNodes).some(n=>n instanceof Element && (n.matches('.ham-panorama-tab-panel,.ham-mobile-tab-panel,.donors-items,.ambassador-collection,.ham-update-grid,.ham-comment-grid,.reward-tiles,.sponsor-grid')||!!n.querySelector('.ham-panorama-tab-panel,.ham-mobile-tab-panel,.donors-items,.ambassador-collection,.ham-update-grid,.ham-comment-grid')))))return;
      if(this.timer)clearTimeout(this.timer);
      this.timer=setTimeout(()=>{this.timer=undefined;this.refresh();},80);
    });this.observer.observe(preview,{childList:true,subtree:true});}
    (window as Window & {ham112RefreshCarousels?:()=>void}).ham112RefreshCarousels=()=>this.refresh();
  }
  ngOnDestroy():void {
    this.running=false;this.observer?.disconnect();if(this.timer)clearTimeout(this.timer);
    if(this.frame)cancelAnimationFrame(this.frame);
    document.removeEventListener('click',this.onViewClick,true);window.removeEventListener('resize',this.onResize);
    for(const track of this.mountedTracks){const fn=this.trackScroll.get(track);if(fn)track.removeEventListener('scroll',fn);}
    this.mountedTracks.clear();
    delete (window as Window & {ham112RefreshCarousels?:()=>void}).ham112RefreshCarousels;
  }
}
