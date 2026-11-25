import { Injectable, OnDestroy } from '@angular/core';
/** Direct Angular replacement for the old carousel reset patch (014.js).
 * Keeps the source renderer and scroll semantics unchanged. */
@Injectable({providedIn:'root'})
export class CarouselResetService implements OnDestroy {
  private started=false;
  private readonly pending=new Set<ReturnType<typeof setTimeout>>();
  private reset(panel:Element|null):void {
    if(!(panel instanceof HTMLElement)||panel.dataset['hamViewMode']!=='carousel')return;
    const track=panel.querySelector<HTMLElement>('.ham-inline-carousel-track, .donors-items, .ambassador-collection, .ham-update-grid');
    if(!track)return;
    try{track.scrollTo({left:0,behavior:'auto'});}catch{track.scrollLeft=0;}
    const wrap=track.closest<HTMLElement>('.ham-inline-carousel');if(wrap)wrap.dataset['hamIndex']='0';
    (window as Window & {hamPublicRefreshCarousels?:()=>void}).hamPublicRefreshCarousels?.();
  }
  private schedule(panel:Element|null):void {
    const timer=setTimeout(()=>{this.pending.delete(timer);this.reset(panel);},0);
    this.pending.add(timer);
  }
  private readonly click=(event:MouseEvent):void=>{
    if(!(event.target instanceof Element))return;
    const view=event.target.closest('#preview .ham-panorama-tab-panel [data-ham-view]');
    if(view){this.schedule(view.closest('.ham-panorama-tab-panel'));return;}
    if(event.target.closest('#preview [data-ham-panorama-tab]'))
      this.schedule(document.querySelector('#preview .ham-panorama-tab-panel:not([hidden])'));
  };
  private readonly ready=():void=>this.reset(document.querySelector('#preview .ham-panorama-tab-panel:not([hidden])'));
  start():void {
    if(this.started)return;this.started=true;
    document.addEventListener('click',this.click,true);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',this.ready,{once:true});else this.ready();
  }
  ngOnDestroy():void {
    document.removeEventListener('click',this.click,true);
    document.removeEventListener('DOMContentLoaded',this.ready);
    this.pending.forEach(clearTimeout);this.pending.clear();this.started=false;
  }
}
