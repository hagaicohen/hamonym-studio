import { Injectable, OnDestroy } from '@angular/core';
/** Original save feedback behavior (038.js), Angular service-owned.
 * MOCK-ONLY: status reflects the retained browser persistence, not a server save. */
interface MediaReader { read(ref:string):Promise<unknown>;src(ref:string):string; }
@Injectable({providedIn:'root'})
export class SaveStatusService implements OnDestroy {
  private statusObserver?:MutationObserver;
  private mediaObserver?:MutationObserver;
  private ready=false;
  private badge?:HTMLElement;
  private readonly synchronize=():void=>{
    const raw=(document.getElementById('saveStatus')?.textContent||'').trim();
    if(!this.badge)return;
    const failed=/נכשלה|שגיא|מלא/.test(raw),temporary=/זמני|לא נשמר/.test(raw),saving=/^שומר/.test(raw),remote=raw==='✓ נשמר';
    this.badge.dataset['state']=failed?'failed':saving?'saving':temporary?'temporary':'saved';
    this.badge.textContent=failed?'⚠ השמירה נכשלה':saving?'שומר…':temporary?'⚠ שמירה זמנית בלבד':remote?'✓ נשמר':'✓ נשמר בדפדפן';
    this.badge.title=raw||'שמירה אוטומטית מקומית בלבד, לא בשרת';
  };
  private mountFeedback():boolean {
    const actions=document.querySelector<HTMLElement>('body>.top .top-actions');
    const source=document.getElementById('saveStatus');
    if(!actions||!source)return false;
    this.badge=actions.querySelector<HTMLElement>('.ham-save-feedback')||document.createElement('span');
    this.badge.className='ham-save-feedback';this.badge.setAttribute('role','status');this.badge.setAttribute('aria-live','polite');
    if(!this.badge.isConnected)actions.appendChild(this.badge);
    this.statusObserver?.disconnect();this.statusObserver=new MutationObserver(this.synchronize);
    this.statusObserver.observe(source,{childList:true,characterData:true,subtree:true});
    this.synchronize();return true;
  }
  private hydrateLogos():void {
    const media=(window as Window & {hamonymMediaFix?:MediaReader}).hamonymMediaFix;
    if(!media)return;
    document.querySelectorAll<HTMLImageElement>('[data-ham-sponsor-media]').forEach(img=>{
      const ref=img.getAttribute('data-ham-sponsor-media');
      if(!ref?.startsWith('hamonymmedia:')||img.dataset['hamSponsorLoading'])return;
      img.dataset['hamSponsorLoading']='1';
      Promise.resolve(media.read(ref)).then(()=>{
        if(!img.isConnected)return;
        const url=media.src(ref);
        if(url)img.src=url;else delete img.dataset['hamSponsorLoading'];
      }).catch(()=>delete img.dataset['hamSponsorLoading']);
    });
  }
  private readonly onReady=():void=>{
    if(this.ready)return;this.ready=true;
    this.mountFeedback();this.hydrateLogos();(window as any).hamonymMediaFix?.patchMedia?.();
    let scheduled=false;
    this.mediaObserver=new MutationObserver(records=>{
      if(scheduled||!records.some(r=>r.type==='childList'&&Array.from(r.addedNodes).some(n=>
        n instanceof Element&&(n.matches('[data-ham-sponsor-media],[data-ham-media-ref]')||!!n.querySelector('[data-ham-sponsor-media],[data-ham-media-ref]')))))return;
      scheduled=true;queueMicrotask(()=>{scheduled=false;this.hydrateLogos();(window as any).hamonymMediaFix?.patchMedia?.();});
    });
    this.mediaObserver.observe(document.body,{childList:true,subtree:true});
  };
  start():void {
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',this.onReady,{once:true});
    else this.onReady();
  }
  ngOnDestroy():void {
    this.statusObserver?.disconnect();this.mediaObserver?.disconnect();
    document.removeEventListener('DOMContentLoaded',this.onReady);
    this.ready=false;
  }
}
