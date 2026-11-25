import { Injectable, OnDestroy } from '@angular/core';

/** Angular-owned workspace layout interaction layer.
 * Replaces legacy scripts 031–034 without changing existing DOM/CSS contracts.
 * BACKEND: none. These are viewport-local UI preferences only.
 */
@Injectable({providedIn: 'root'})
export class WorkspaceResizeService implements OnDestroy {
  private readonly aborter = new AbortController();
  private readonly attached = new WeakSet<HTMLElement>();
  private readonly resizeCallbacks: Array<() => void> = [];
  private started = false;

  private read(key:string, fallback:number):number {
    try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value > 0 ? value : fallback; }
    catch { return fallback; }
  }
  private save(key:string, width:number):void {
    try { localStorage.setItem(key,String(width)); } catch { /* blocked storage */ }
  }
  private on<T extends Event>(node:EventTarget, name:string, fn:(e:T)=>void):void {
    node.addEventListener(name, fn as EventListener, {signal:this.aborter.signal});
  }
  private resize(fn:()=>void):void {this.resizeCallbacks.push(fn);this.on(window,'resize',fn);}

  start():void {
    if(this.started) return;
    this.started=true;
    this.setupWorkspace();
    this.setupWizard();
    // v4.62: no observer. The sidebar, inspector and management shell (#huManager, #huMenu) are mounted once
    // before this runs and never replaced, so each splitter is attached here once.
  }

  setupWorkspace():void {
    const ws=document.querySelector<HTMLElement>('.workspace');
    if(!ws)return;
    const sidebar=ws.querySelector<HTMLElement>(':scope > .sidebar');
    const inspector=ws.querySelector<HTMLElement>(':scope > .inspector');
    const manager=document.getElementById('huManager');
    if(sidebar && inspector)this.setupInspector(ws,sidebar,inspector);
    if(sidebar)this.setupNavigation(ws,sidebar,'--ham-tree-width','hamonym.treeWidth',250,185,480);
    const menu=document.querySelector<HTMLElement>('#huManager > #huMenu');
    if(menu)this.setupNavigation(ws,menu,'--ham-menu-width','hamonym.contentMenuWidth',205,165,430);
    if(manager)this.setupManagement(ws,manager);
  }

  private setupInspector(ws:HTMLElement,sidebar:HTMLElement,inspector:HTMLElement):void {
    // The handle is in AppComponent's template.
    const handle=inspector.querySelector<HTMLElement>(':scope > .ham-inspector-resizer');
    if(!handle||this.attached.has(handle))return;
    this.attached.add(handle);
    const key='hamonym.inspectorWidth',preferred=320,min=280;
    const sidebarWidth=()=>Math.round(sidebar.getBoundingClientRect().width||250);
    const apply=(raw:number,store=false)=>{
      const max=Math.max(min,Math.min(760,Math.floor(window.innerWidth*.62)));
      const width=Math.max(min,Math.min(max,Math.round(raw||preferred)));
      ws.style.gridTemplateColumns=`${sidebarWidth()}px minmax(300px,1fr) ${width}px`;
      inspector.style.width=width+'px';if(store)this.save(key,width);
      return width;
    };
    apply(this.read(key,inspector.getBoundingClientRect().width||preferred));
    let x=0,start=preferred,dragging=false;
    this.on<MouseEvent>(handle,'mousedown',e=>{
      e.preventDefault();x=e.clientX;start=inspector.getBoundingClientRect().width||preferred;
      dragging=true;document.body.classList.add('ham-inspector-resizing');
    });
    this.on<MouseEvent>(document,'mousemove',e=>{if(dragging)apply(start+x-e.clientX);});
    this.on<MouseEvent>(document,'mouseup',e=>{
      if(!dragging)return;dragging=false;document.body.classList.remove('ham-inspector-resizing');
      apply(start+x-e.clientX,true);
    });
    this.on<MouseEvent>(handle,'dblclick',()=>{apply(preferred,true);});
    this.resize(()=>apply(parseInt(inspector.style.width,10)||preferred));
  }

  private setupNavigation(ws:HTMLElement,element:HTMLElement,prop:string,key:string,preferred:number,min:number,max:number):void {
    if(element.querySelector(':scope > .ham-navigation-splitter'))return;
    const bar=document.createElement('div');bar.className='ham-navigation-splitter';
    bar.setAttribute('role','separator');bar.setAttribute('aria-orientation','vertical');
    bar.setAttribute('aria-label','גרור לשינוי רוחב התפריט');
    bar.title='גרור שמאלה להרחבה, ימינה לצמצום';element.appendChild(bar);
    const apply=(value:number,store=false)=>{
      const limit=Math.max(min,Math.min(max,Math.floor(window.innerWidth*.54)));
      const width=Math.max(min,Math.min(limit,Math.round(value)));
      ws.style.setProperty(prop,width+'px');if(store)this.save(key,width);return width;
    };
    apply(this.read(key,preferred));
    let x=0,start=preferred,dragging=false;
    this.on<PointerEvent>(bar,'pointerdown',e=>{
      if(e.button!==0||window.innerWidth<=860)return;
      e.preventDefault();dragging=true;x=e.clientX;
      start=parseFloat(getComputedStyle(ws).getPropertyValue(prop))||element.getBoundingClientRect().width;
      document.body.classList.add('ham-nav-resizing');
    });
    this.on<PointerEvent>(document,'pointermove',e=>{if(dragging)apply(start+x-e.clientX);});
    const finish=(e:PointerEvent)=>{
      if(!dragging)return;dragging=false;document.body.classList.remove('ham-nav-resizing');
      if(e.type==='pointerup')apply(start+x-e.clientX,true);
    };
    this.on<PointerEvent>(document,'pointerup',finish);
    this.on<PointerEvent>(document,'pointercancel',finish);
    this.on<MouseEvent>(bar,'dblclick',()=>{apply(preferred,true);});
    this.resize(()=>{const width=parseFloat(getComputedStyle(ws).getPropertyValue(prop));if(width>0)apply(width);});
  }

  private setupManagement(ws:HTMLElement,manager:HTMLElement):void {
    if(manager.querySelector('.ham-management-boundary'))return;
    const handle=document.createElement('div');handle.className='ham-management-boundary';
    handle.title='גררו שמאלה להרחבת אזור הסקירה';handle.setAttribute('role','separator');
    handle.setAttribute('aria-label','שינוי רוחב הסקירה');manager.appendChild(handle);
    const key='hamonym.managementPanelWidth',preferred=Math.min(740,window.innerWidth*.58);
    let width=this.read(key,preferred),x=0,start=width,pointer:number|null=null;
    const apply=(value:number,save=false)=>{
      const max=Math.max(390,window.innerWidth-290);
      width=Math.round(Math.max(390,Math.min(max,Math.min(1100,value))));
      ws.style.setProperty('--ham-management-width',width+'px');if(save)this.save(key,width);
    };
    apply(width);
    this.on<PointerEvent>(handle,'pointerdown',e=>{
      if(e.button!==0||window.innerWidth<=860)return;
      e.preventDefault();pointer=e.pointerId;x=e.clientX;start=width;
      try{handle.setPointerCapture(pointer);}catch{};
      document.body.classList.add('ham-management-drag');
    });
    this.on<PointerEvent>(handle,'pointermove',e=>{if(pointer===e.pointerId)apply(start+x-e.clientX);});
    const finish=(e:PointerEvent)=>{
      if(pointer!==e.pointerId)return;pointer=null;document.body.classList.remove('ham-management-drag');apply(width,true);
    };
    this.on<PointerEvent>(handle,'pointerup',finish);
    this.on<PointerEvent>(handle,'pointercancel',finish);
    this.on<MouseEvent>(handle,'dblclick',()=>apply(preferred,true));
    this.resize(()=>apply(width));
  }

  setupWizard():void {
    const layout=document.querySelector<HTMLElement>('#hwWizard .hw-layout');
    const form=layout?.querySelector<HTMLElement>('.hw-form-pane');
    if(!layout||!form||this.attached.has(form))return;
    this.attached.add(form);
    const handle=document.createElement('div');handle.className='hw-form-splitter';
    handle.setAttribute('role','separator');handle.setAttribute('tabindex','0');
    handle.setAttribute('aria-label','גרור ימינה או שמאלה לשינוי רוחב אשף הקמפיין');
    handle.setAttribute('aria-orientation','vertical');
    handle.title='גרור ימינה או שמאלה לשינוי רוחב האשף · לחיצה כפולה לאיפוס הרוחב';
    form.appendChild(handle);
    const key='hamonym.wizardFormWidth',preferred=520,min=340;
    let size=this.read(key,preferred),startX=0,startWidth=size,pointer:number|null=null;
    const apply=(raw:number,store=false)=>{
      const total=layout.getBoundingClientRect().width||window.innerWidth;
      const max=Math.max(min,total-300);
      size=Math.round(Math.max(Math.min(min,max),Math.min(raw,max)));
      layout.style.setProperty('--hw-form-width',size+'px');
      handle.setAttribute('aria-valuenow',String(size));if(store)this.save(key,size);
    };
    apply(size);
    this.on<PointerEvent>(handle,'pointerdown',e=>{
      if(e.button!==0||window.innerWidth<=940)return;
      e.preventDefault();pointer=e.pointerId;startX=e.clientX;startWidth=size;
      try{handle.setPointerCapture(pointer);}catch{};
      document.body.classList.add('hw-split-dragging');
    });
    this.on<PointerEvent>(handle,'pointermove',e=>{
      if(pointer===e.pointerId)apply(startWidth+startX-e.clientX);
    });
    const finish=(e:PointerEvent)=>{
      if(pointer!==e.pointerId)return;
      pointer=null;document.body.classList.remove('hw-split-dragging');apply(size,true);
    };
    this.on<PointerEvent>(handle,'pointerup',finish);
    this.on<PointerEvent>(handle,'pointercancel',finish);
    this.on<Event>(handle,'lostpointercapture',()=>{
      if(pointer!==null){pointer=null;document.body.classList.remove('hw-split-dragging');apply(size,true);}
    });
    this.on<MouseEvent>(handle,'dblclick',()=>apply(preferred,true));
    this.on<KeyboardEvent>(handle,'keydown',e=>{
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
        e.preventDefault();apply(size+(e.key==='ArrowLeft'?24:-24),true);
      }
    });
    this.resize(()=>{if(window.innerWidth>940)apply(size);});
  }

  ngOnDestroy():void {
    this.aborter.abort();
    document.body.classList.remove('ham-nav-resizing','hw-split-dragging','ham-management-drag','ham-inspector-resizing');
  }
}
