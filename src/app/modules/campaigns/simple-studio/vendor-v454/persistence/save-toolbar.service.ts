import { Injectable, OnDestroy } from '@angular/core';
/** Original save-button feedback (039.js), Angular-owned, preserving original DOM and icons.
 * MOCK-ONLY: browser-local save, no implied BACKEND-WRITE. */
@Injectable({providedIn:'root'})
export class SaveToolbarService implements OnDestroy {
  private readonly icons:Record<string,string>={
    idle:'<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v7h10V3M7 21v-8h10v8"/>',
    saving:'<path d="M12 3a9 9 0 1 0 9 9"/>',
    saved:'<path d="M5 12.5 10 17l9-10"/>',
    failed:'<path d="M12 8v5m0 4h.01"/><circle cx="12" cy="12" r="9"/>'
  };
  private observer?:MutationObserver;
  private source?:HTMLElement;
  private button?:HTMLButtonElement;
  private timer?:ReturnType<typeof setTimeout>;
  private retry?:ReturnType<typeof setTimeout>;
  private epoch=0;
  private readonly click=():void=>this.show('saving');
  private show(which:'idle'|'saving'|'saved'|'failed'):void {
    if(!this.button)return;
    this.button.dataset['hamSaveState']=which;
    this.button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+this.icons[which]+'</svg>';
    const info=which==='saving'?'שומר שינויים…':which==='saved'?'נשמר בדפדפן':which==='failed'?'השמירה נכשלה':'שמור שינויים';
    this.button.title=info;this.button.setAttribute('aria-label',info);
  }
  private readonly onPersistence=():void=>{
    const raw=(this.source?.textContent||'').trim();
    const failed=/נכשלה|שגיא|מלא|זמני|לא נשמר/.test(raw);
    const current=++this.epoch;
    if(this.timer)clearTimeout(this.timer);
    this.show('saving');
    this.timer=setTimeout(()=>{
      if(current!==this.epoch)return;
      this.show(failed?'failed':'saved');
      if(!failed)this.timer=setTimeout(()=>{if(this.epoch===current)this.show('idle');},1100);
    },330);
  };
  private setup():boolean {
    const top=document.querySelector<HTMLElement>('body>.top.ham-v157-ready');
    const btn=top?.querySelector<HTMLButtonElement>('#saveBtn');
    const source=document.getElementById('saveStatus');
    if(!btn||!source||btn.dataset['hamV206Ready'])return false;
    btn.dataset['hamV206Ready']='1';
    top?.querySelector('.ham-save-feedback')?.remove();
    this.button=btn;this.source=source;
    this.observer=new MutationObserver(this.onPersistence);
    this.observer.observe(source,{childList:true,characterData:true,subtree:true});
    btn.addEventListener('click',this.click,{capture:true});
    this.show('idle');return true;
  }
  private readonly ready=():void=>{
    if(this.setup())return;
    let tries=0;
    const again=():void=>{if(this.setup()||++tries>=20)return;this.retry=setTimeout(again,100);};
    again();
  };
  start():void {
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',this.ready,{once:true});else this.ready();
  }
  ngOnDestroy():void {
    document.removeEventListener('DOMContentLoaded',this.ready);
    this.observer?.disconnect();
    this.button?.removeEventListener('click',this.click,true);
    if(this.timer)clearTimeout(this.timer);if(this.retry)clearTimeout(this.retry);
    if(this.button)delete this.button.dataset['hamV206Ready'];
  }
}
