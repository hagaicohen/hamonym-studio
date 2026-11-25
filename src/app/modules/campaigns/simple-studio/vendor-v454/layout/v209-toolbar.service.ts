import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, OnDestroy, createComponent } from '@angular/core';
import { V209ToolbarComponent } from './v209-toolbar.component';

/** Replaces legacy 042.js without taking over the campaign-state engine. */
@Injectable({providedIn:'root'})
export class V209ToolbarService implements OnDestroy {
  private component?:ComponentRef<V209ToolbarComponent>;
  private host?:HTMLElement;
  private retry?:ReturnType<typeof setTimeout>;
  constructor(private readonly appRef:ApplicationRef,private readonly injector:EnvironmentInjector){}
  private mount():boolean {
    if(this.component)return true;
    const top=document.querySelector<HTMLElement>('body>.top.ham-v157-ready');
    const shell=top?.querySelector<HTMLElement>('.ham-v157-shell');
    const identity=shell?.querySelector<HTMLElement>('.ham-v157-identity');
    const nav=shell?.querySelector<HTMLElement>('.ham-v157-navigation');
    const preview=shell?.querySelector<HTMLElement>('.ham-v157-preview');
    const actions=shell?.querySelector<HTMLElement>('.ham-v157-actions');
    const controls=preview?.querySelector<HTMLElement>('.ham-single-toolbar');
    if(!top||!shell||!identity||!nav||!preview||!actions||!controls)return false;
    if(!shell.classList.contains('ham-v209-ready')) {
      const right=document.createElement('div');right.className='ham-v209-right';right.append(identity,nav);
      const left=document.createElement('div');left.className='ham-v209-left';left.append(preview,actions);
      shell.replaceChildren(right,left);shell.classList.add('ham-v209-ready');
    }
    const host=document.createElement('ham-v209-toolbar');controls.prepend(host);this.host=host;
    this.component=createComponent(V209ToolbarComponent,{environmentInjector:this.injector,hostElement:host});
    this.appRef.attachView(this.component.hostView);this.component.changeDetectorRef.detectChanges();
    return true;
  }
  start():void {
    if(this.mount())return;
    let attempts=0;
    const retry=():void=>{if(this.mount()||++attempts>=80)return;this.retry=setTimeout(retry,100);};retry();
  }
  ngOnDestroy():void {
    if(this.retry)clearTimeout(this.retry);
    if(this.component){this.appRef.detachView(this.component.hostView);this.component.destroy();this.component=undefined;}
    this.host?.remove();this.host=undefined;
  }
}
