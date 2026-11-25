import { Component, OnDestroy, AfterViewInit } from '@angular/core';

/** The device/template/open toolbar formerly constructed by legacy 027.js. */
@Component({
  selector: 'ham-single-toolbar-controls', standalone: true,
  templateUrl: './single-toolbar-controls.component.html',
  styleUrls: ['./single-toolbar-controls.component.css']
})
export class SingleToolbarControlsComponent implements AfterViewInit, OnDestroy {
  device: 'desktop'|'mobile' = 'mobile';
  private observer?: MutationObserver;
  ngAfterViewInit():void {
    const switcher=document.querySelector('.stage-toolbar .device-switch');
    if(switcher){this.observer=new MutationObserver(()=>this.refresh());this.observer.observe(switcher,{subtree:true,attributes:true,attributeFilter:['class']});}
    this.refresh();
  }
  private refresh():void {
    const chosen=document.querySelector<HTMLElement>('.stage-toolbar .device-switch button.active')?.dataset['device'];
    this.device=chosen==='desktop'?'desktop':'mobile';
    const root=document.querySelector('ham-single-toolbar-controls');
    root?.querySelectorAll<HTMLElement>('[data-ham-single-device]').forEach(b=>b.classList.toggle('active',b.dataset['hamSingleDevice']===this.device));
  }
  chooseDevice(device:'desktop'|'mobile'):void {
    document.querySelector<HTMLElement>(`.stage-toolbar .device-switch [data-device="${device}"]`)?.click();
    this.refresh();
  }
  openDesignStudio():void {
    // Hand off to the active campaign editor. A dedicated event avoids coupling
    // the permanent Angular toolbar to the legacy inspector's DOM hierarchy.
    window.dispatchEvent(new Event('hamonym:open-design-studio'));
  }
  chooseTemplate():void {document.getElementById('templatesBtn')?.click();}
  openPublic():void {document.querySelector<HTMLElement>('.stage-toolbar [data-ham-open-public]')?.click();}
  editIdentity():void {
    document.querySelector<HTMLElement>('[data-hu-mode="management"]')?.click();
    document.querySelector<HTMLElement>('[data-hu-page="identity"]')?.click();
  }
  ngOnDestroy():void {this.observer?.disconnect();}
}
