import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, OnDestroy, createComponent } from '@angular/core';
import { SingleToolbarControlsComponent } from './single-toolbar-controls.component';

/** Replaces legacy 027, 028 and 029 without replacing visual CSS or existing command handlers.
 * DOM rearrangement remains an integration bridge until the entire original toolbar is Angular-owned.
 */
@Injectable({providedIn:'root'})
export class SingleToolbarShellService implements OnDestroy {
  private controls?:ComponentRef<SingleToolbarControlsComponent>;
  private controlsHost?:HTMLElement;
  private top?:HTMLElement;
  private observer?:ResizeObserver;
  private retry?:ReturnType<typeof setTimeout>;
  constructor(private readonly appRef:ApplicationRef,private readonly injector:EnvironmentInjector){}
  private readonly fit=():void=>{if(this.top) document.documentElement.style.setProperty('--ham-toolbar-real-height',`${Math.ceil(this.top.getBoundingClientRect().height)}px`);};
  private mount():boolean {
    const top=document.querySelector<HTMLElement>('body > .top');
    const second=document.getElementById('huToolbar');
    const actions=top?.querySelector<HTMLElement>('.top-actions');
    if(!top||!second||!actions)return false;
    if(top.classList.contains('ham-v157-ready'))return true;
    const tabs=second.querySelector<HTMLElement>('.hu-tabs');
    if(!tabs)return false;
    this.top=top;
    tabs.classList.add('ham-single-modes');top.insertBefore(tabs,actions);
    const readiness=second.querySelector<HTMLElement>('.hu-meter-trigger');
    if(readiness){const host=document.createElement('div');host.className='ham-single-readiness';host.appendChild(readiness);top.insertBefore(host,actions);}
    const host=document.createElement('div');host.className='ham-single-toolbar';
    top.insertBefore(host,actions);this.controlsHost=host;
    this.controls=createComponent(SingleToolbarControlsComponent,{environmentInjector:this.injector,hostElement:host});
    this.appRef.attachView(this.controls.hostView);this.controls.changeDetectorRef.detectChanges();
    const more=actions.querySelector<HTMLDetailsElement>('.ham-top-more');
    const menu=more?.querySelector('.hw-toolbar-more-menu');
    const reset=actions.querySelector<HTMLElement>('#hamResetTopButton');
    if(menu&&reset){reset.textContent='↺ איפוס מלא וחזרה לאשף';reset.title='מחק את נתוני הקמפיין וחזור לאשף ההקמה';menu.appendChild(reset);}
    // Legacy 028: row grouping and identity alignment.
    const rowMain=document.createElement('div');rowMain.className='ham-v155-row ham-v155-row-main';
    const rowWork=document.createElement('div');rowWork.className='ham-v155-row ham-v155-row-work';
    const identity=document.createElement('div');identity.className='ham-v155-identity';
    const brand=top.querySelector('.brand');const project=top.querySelector('.project-name');
    if(brand)identity.appendChild(brand);if(project)identity.appendChild(project);
    rowMain.append(identity,actions);
    const navigation=document.createElement('div');navigation.className='ham-v155-group ham-v155-navigation';
    const preview=document.createElement('div');preview.className='ham-v155-group ham-v155-preview';
    navigation.appendChild(tabs);preview.appendChild(host);rowWork.append(navigation,preview);top.append(rowMain,rowWork);
    top.querySelector('.ham-single-readiness')?.remove();
    host.querySelector('[data-ham-single-edit]')?.remove();
    const save=actions.querySelector<HTMLElement>('#saveBtn');
    if(save){save.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v7h10V3M7 21v-8h10v8"/></svg>';save.setAttribute('aria-label','שמור שינויים');save.title='שמור שינויים';}
    top.classList.add('ham-v155-ready');
    // Legacy 029: final editor toolbar layout.
    const shell=document.createElement('div');shell.className='ham-v157-shell';
    const group=(name:string)=>{const el=document.createElement('div');el.className='ham-v157-group '+name;return el;};
    const gIdentity=group('ham-v157-identity');const currentBrand=top.querySelector('.brand');if(currentBrand)gIdentity.appendChild(currentBrand);
    const gNav=group('ham-v157-navigation');gNav.appendChild(tabs);
    const gPreview=group('ham-v157-preview');gPreview.appendChild(host);
    const gProgress=group('ham-v157-progress-group');
    const btn=document.createElement('button');btn.type='button';btn.className='ham-v157-progress';btn.title='השלמת נתוני הקמפיין — הצג פירוט';btn.setAttribute('aria-label','השלמת נתוני הקמפיין');btn.setAttribute('data-hu-drawer','');
    btn.innerHTML='<span class="ham-v157-progress-head"><span>השלמה</span><strong data-hu-percent>0%</strong></span><span class="ham-v157-progress-track"><span data-hu-meter></span></span>';
    gProgress.appendChild(btn);
    const gActions=group('ham-v157-actions');gActions.appendChild(actions);
    const separator=()=>{const el=document.createElement('span');el.className='ham-v157-separator';el.setAttribute('aria-hidden','true');return el;};
    shell.append(gIdentity,separator(),gNav,separator(),gPreview,separator(),gProgress,separator(),gActions);
    top.replaceChildren(shell);
    for(const [key,text] of [['management','ניהול ותוכן'],['design','עיצוב'],['publish','פרסום']]){
      const tab=tabs.querySelector<HTMLElement>(`[data-hu-mode="${key}"]`);
      if(tab){tab.textContent=text;tab.title=key==='publish'?'בדיקה ופרסום':text;}
    }
    const template=host.querySelector<HTMLElement>('[data-ham-single-template]');if(template)template.textContent='▦ תבנית';
    for(const [id,label] of [['undoBtn','ביטול שינוי'],['redoBtn','ביצוע מחדש'],['saveBtn','שמור שינויים']]){
      const button=actions.querySelector<HTMLElement>(`#${id}`);if(button){button.title=label;button.setAttribute('aria-label',label);}
    }
    top.querySelector('.project-name')?.remove();top.classList.add('ham-v157-ready');
    const oldPercent=document.querySelector<HTMLElement>('[data-hu-percent]:not(.ham-v157-progress [data-hu-percent])');
    const percent=btn.querySelector<HTMLElement>('[data-hu-percent]');if(percent&&oldPercent?.textContent)percent.textContent=oldPercent.textContent;
    this.fit();if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(this.fit);this.observer.observe(top);}
    return true;
  }
  private readonly ready=():void=>{
    if(this.mount())return;
    let attempts=0;
    const retry=():void=>{if(this.mount()||++attempts>=40)return;this.retry=setTimeout(retry,100);};
    this.retry=setTimeout(retry,100);
  };
  start():void {if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',this.ready,{once:true});else this.ready();}
  ngOnDestroy():void {
    document.removeEventListener('DOMContentLoaded',this.ready);
    if(this.retry)clearTimeout(this.retry);
    this.observer?.disconnect();
    if(this.controls){this.appRef.detachView(this.controls.hostView);this.controls.destroy();this.controls=undefined;}
  }
}
