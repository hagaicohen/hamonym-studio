import { Component, OnDestroy, HostListener, effect, inject } from '@angular/core';
import { StudioToolbarService } from './studio-toolbar.service';
type Device = 'mobile'|'desktop';
type Layout = 'panorama'|'heroCard';

/** Angular-owned device and layout menus, retaining the existing v209 CSS selectors. */
@Component({selector:'ham-v209-toolbar',standalone:true,templateUrl:'./v209-toolbar.component.html',styleUrls:['./v209-toolbar.component.css']})
export class V209ToolbarComponent implements OnDestroy {
  readonly toolbar = inject(StudioToolbarService);
  selected:Layout='panorama'; isDonation=false;
  get device():Device { return this.toolbar.device(); }
  get layoutOpen():boolean { return this.toolbar.layoutOpen(); }
  set layoutOpen(open:boolean) { this.toolbar.layoutOpen.set(open); }
  /** Null unless the sliding thumb is being dragged. Distance from the right edge. */
  dragOffset:number|null=null;
  private dragPointerId:number|null=null;
  private dragRange=0;
  /** The layout choice and the donation layout are read again when the device changes (as the observer of the device switch did). */
  constructor(){effect(()=>{this.toolbar.device();this.toolbar.started();this.refresh();},{allowSignalWrites:true});}
  /** A click outside closes the menu; the template buttons open it (StudioToolbarService.openTemplates). */
  @HostListener('document:click',['$event']) outside(e:MouseEvent):void{if(e.target instanceof Element&&!e.target.closest('ham-v209-toolbar,#templatesBtn,[data-ham-single-template]'))this.close();}
  @HostListener('document:keydown',['$event']) escape(e:KeyboardEvent):void{if(e.key==='Escape')this.close();}
  refresh():void {
    this.isDonation=this.toolbar.isDonation();
    this.selected=this.toolbar.started()?this.toolbar.layoutSelected():'panorama';
    if(this.isDonation)this.layoutOpen=false;
  }
  close():void {this.layoutOpen=false;}
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
  chooseDevice(which:Device):void {this.toolbar.setDevice(which);this.close();this.refresh();}
  chooseLayout(layout:Layout):void {
    this.toolbar.applyLayout(layout);this.selected=layout;
    this.toolbar.modalOpen.set(false);
    this.close();this.refresh();
  }
  openPublic():void {this.toolbar.openPublic(false);this.close();}
  ngOnDestroy():void {this.dragPointerId=null;this.dragOffset=null;}
}
