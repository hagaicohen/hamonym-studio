import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, OnDestroy, createComponent } from '@angular/core';
import { HamonymBrandComponent } from './hamonym-brand.component';
/** Mount the exact original inline-SVG brand in the same original DOM slot. */
@Injectable({providedIn:'root'})
export class HamonymBrandService implements OnDestroy {
  private ref?: ComponentRef<HamonymBrandComponent>;
  private observer?: MutationObserver;
  constructor(private readonly appRef:ApplicationRef, private readonly injector:EnvironmentInjector) {}
  private readonly mount = ():void => {
    if(this.ref) return;
    const identity=document.querySelector<HTMLElement>('body > .top.ham-v157-ready .ham-v157-identity');
    if(!identity) return;
    const original=identity.querySelector('.ham-v159-official-logo');
    if(original) return; // never duplicate a preexisting source logo
    const host=document.createElement('div');host.className='ham-v159-official-logo';
    host.setAttribute('role','img');host.setAttribute('aria-label','המונים');
    identity.prepend(host);
    this.ref=createComponent(HamonymBrandComponent,{environmentInjector:this.injector,hostElement:host});
    this.appRef.attachView(this.ref.hostView);
    this.ref.changeDetectorRef.detectChanges();
    this.observer?.disconnect();this.observer=undefined;
  };
  start():void {
    this.mount();
    if(!this.ref){
      this.observer=new MutationObserver(this.mount);
      this.observer.observe(document.body,{childList:true,subtree:true});
    }
  }
  ngOnDestroy():void {
    this.observer?.disconnect();
    if(this.ref){this.appRef.detachView(this.ref.hostView);this.ref.destroy();this.ref=undefined;}
  }
}
