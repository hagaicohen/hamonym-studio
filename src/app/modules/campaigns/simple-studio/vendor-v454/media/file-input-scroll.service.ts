import { Injectable, OnDestroy } from '@angular/core';

/** Retains the original file-input focus/scroll behavior from legacy 004.js.
 * The preservation is intentionally UI-only; no upload/DB changes.
 */
@Injectable({providedIn:'root'})
export class FileInputScrollService implements OnDestroy {
  private readonly controller=new AbortController();
  private snapshot?:{entries:Array<[Element,number,number]>;x:number;y:number;set:Set<Element>};
  private cleanupTimer?:ReturnType<typeof setTimeout>;
  private restoreTimer?:ReturnType<typeof setTimeout>;
  private started=false;
  private attach<T extends Event>(target:EventTarget,name:string,fn:(event:T)=>void):void {
    target.addEventListener(name,fn as EventListener,{capture:true,signal:this.controller.signal});
  }
  private isFileTrigger(target:EventTarget|null):boolean {
    if(!(target instanceof Element))return false;
    const label=target.closest('label') as HTMLLabelElement|null;
    const input=target.matches('input[type="file"]') ? target as HTMLInputElement
      : (label?.control||label?.querySelector<HTMLInputElement>('input[type="file"]'));
    return input instanceof HTMLInputElement && input.type === 'file';
  }
  private remember():void {
    const entries:Array<[Element,number,number]>=[];
    const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_ELEMENT);
    for(let node:Node|null=walker.currentNode;node;node=walker.nextNode()){
      const el=node as Element & {scrollTop:number;scrollLeft:number};
      if(el.scrollTop||el.scrollLeft)entries.push([el,el.scrollTop,el.scrollLeft]);
    }
    this.snapshot={entries,x:window.scrollX,y:window.scrollY,set:new Set(entries.map(x=>x[0]))};
  }
  private restore=():void=>{
    if(!this.snapshot)return;
    const {entries,x,y,set}=this.snapshot;
    const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_ELEMENT);
    for(let node:Node|null=walker.currentNode;node;node=walker.nextNode()){
      const el=node as Element & {scrollTop:number;scrollLeft:number};
      if((el.scrollTop||el.scrollLeft)&&!set.has(el)){el.scrollTop=0;el.scrollLeft=0;}
    }
    for(const [el,top,left] of entries)if(el.isConnected){el.scrollTop=top;el.scrollLeft=left;}
    window.scrollTo(x,y);
  };
  private finish=():void=>{
    if(!this.snapshot)return;
    this.restore();
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer=setTimeout(()=>{this.snapshot=undefined;},400);
  };
  start():void {
    if(this.started)return;this.started=true;
    this.attach<PointerEvent>(document,'pointerdown',e=>{if(this.isFileTrigger(e.target))this.remember();});
    this.attach<KeyboardEvent>(document,'keydown',e=>{
      if((e.key==='Enter'||e.key===' ')&&this.isFileTrigger(e.target))this.remember();
    });
    this.attach<MouseEvent>(document,'click',e=>{
      if(!this.isFileTrigger(e.target))return;
      if(!this.snapshot)this.remember();
      requestAnimationFrame(()=>{this.restore();this.restoreTimer=setTimeout(this.restore,0);});
    });
    this.attach<FocusEvent>(document,'focusin',e=>{
      if(this.snapshot&&e.target instanceof Element&&e.target.matches('input[type="file"]'))
        requestAnimationFrame(this.restore);
    });
    this.attach<Event>(document,'cancel',e=>{
      if(e.target instanceof Element&&e.target.matches('input[type="file"]'))this.finish();
    });
    this.attach<Event>(document,'change',e=>{
      if(e.target instanceof Element&&e.target.matches('input[type="file"]'))this.finish();
    });
    this.attach<FocusEvent>(window,'focus',()=>{if(this.snapshot)requestAnimationFrame(this.finish);});
  }
  ngOnDestroy():void {
    this.controller.abort();clearTimeout(this.cleanupTimer);clearTimeout(this.restoreTimer);
  }
}
