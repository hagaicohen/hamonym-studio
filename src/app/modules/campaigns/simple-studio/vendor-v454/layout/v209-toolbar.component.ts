import { Component, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';

type Device = 'mobile'|'desktop';
type Layout = 'panorama'|'heroCard';
interface LayoutBridge { selected():Layout; apply(layout:Layout):void; }

/** Angular-owned device and layout menus, retaining the existing v209 CSS selectors. */
@Component({selector:'ham-v209-toolbar',standalone:true,templateUrl:'./v209-toolbar.component.html',styleUrls:['./v209-toolbar.component.css']})
export class V209ToolbarComponent implements AfterViewInit, OnDestroy {
  device:Device='mobile'; selected:Layout='panorama'; layoutOpen=false; isDonation=false;
  /** Null unless the sliding thumb is being dragged. Distance from the right edge. */
  dragOffset:number|null=null;
  private dragPointerId:number|null=null;
  private dragRange=0;
  private observer?:MutationObserver;
  private root?:HTMLElement;
  private readonly outside=(e:MouseEvent):void=>{if(e.target instanceof Element&&!e.target.closest('ham-v209-toolbar'))this.close();};
  private readonly escape=(e:KeyboardEvent):void=>{if(e.key==='Escape')this.close();};
  constructor(private readonly cdr:ChangeDetectorRef){}
  ngAfterViewInit():void {
    this.root=document.querySelector<HTMLElement>('ham-v209-toolbar')||undefined;
    const switcher=document.querySelector('.stage-toolbar .device-switch');
    if(switcher){this.observer=new MutationObserver(()=>this.refresh());this.observer.observe(switcher,{subtree:true,attributes:true,attributeFilter:['class']});}
    document.addEventListener('click',this.outside);document.addEventListener('keydown',this.escape);
    this.refresh();
  }
  refresh():void {
    this.device=document.querySelector<HTMLElement>('.stage-toolbar .device-switch button.active')?.dataset['device']==='desktop'?'desktop':'mobile';
    this.isDonation=!!document.querySelector('#preview.layout-donation');
    const bridge=(window as Window & {hamV209LayoutBridge?:LayoutBridge}).hamV209LayoutBridge;
    this.selected=bridge?.selected()==='heroCard'?'heroCard':'panorama';
    if(this.isDonation)this.layoutOpen=false;
    this.cdr.detectChanges();
  }
  close():void {this.layoutOpen=false;this.cdr.detectChanges();}
  toggleLayout(e:Event):void {e.preventDefault();if(this.isDonation)return;this.layoutOpen=!this.layoutOpen;}
  startDeviceDrag(e:PointerEvent):void {
    if(e.button!==0 || this.dragPointerId!==null)return;
    const thumb=e.currentTarget as HTMLElement;
    const track=thumb.parentElement;
    if(!track)return;
    this.dragRange=Math.max(0,track.clientWidth-6-thumb.clientWidth);
    this.dragPointerId=e.pointerId;
    this.dragOffset=this.getDragOffset(e.clientX,track);
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  moveDeviceDrag(e:PointerEvent):void {
    if(e.pointerId!==this.dragPointerId)return;
    const track=(e.currentTarget as HTMLElement).parentElement;
    if(track)this.dragOffset=this.getDragOffset(e.clientX,track);
  }
  endDeviceDrag(e:PointerEvent):void {
    if(e.pointerId!==this.dragPointerId)return;
    const track=(e.currentTarget as HTMLElement).parentElement;
    if(track)this.dragOffset=this.getDragOffset(e.clientX,track);
    const next:Device=(this.dragOffset??0)>this.dragRange/2?'mobile':'desktop';
    this.cancelDeviceDrag(e);
    if(next!==this.device)this.chooseDevice(next);
  }
  cancelDeviceDrag(e:PointerEvent):void {
    if(e.pointerId!==this.dragPointerId)return;
    const thumb=e.currentTarget as HTMLElement;
    if(thumb.hasPointerCapture(e.pointerId))thumb.releasePointerCapture(e.pointerId);
    this.dragPointerId=null;
    this.dragOffset=null;
  }
  private getDragOffset(clientX:number,track:HTMLElement):number {
    const rect=track.getBoundingClientRect();
    return Math.max(0,Math.min(this.dragRange,rect.right-clientX-3-(track.clientWidth-6-this.dragRange)/2));
  }
  chooseDevice(which:Device):void {
    const source=this.root?.parentElement?.querySelector<HTMLElement>(`[data-ham-single-device="${which}"]`);
    if(source)source.click();else document.querySelector<HTMLElement>(`.stage-toolbar .device-switch [data-device="${which}"]`)?.click();
    this.close();this.refresh();
  }
  chooseLayout(layout:Layout):void {
    const bridge=(window as Window & {hamV209LayoutBridge?:LayoutBridge}).hamV209LayoutBridge;
    bridge?.apply(layout);this.selected=layout;
    document.getElementById('templateModal')?.classList.add('hidden');
    this.close();this.refresh();
  }
  openPublic():void {
    (this.root?.parentElement?.querySelector<HTMLElement>('[data-ham-single-open]') || document.querySelector<HTMLElement>('.stage-toolbar [data-ham-open-public]'))?.click();
    this.close();
  }
  ngOnDestroy():void {this.dragPointerId=null;this.dragOffset=null;this.observer?.disconnect();document.removeEventListener('click',this.outside);document.removeEventListener('keydown',this.escape);}
}
