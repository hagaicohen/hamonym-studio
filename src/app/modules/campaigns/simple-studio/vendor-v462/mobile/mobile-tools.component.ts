import { Component, HostBinding, HostListener, OnDestroy } from '@angular/core';
/** Angular-owned direct-child button, preserving v0.1.301 CSS selectors. Closed by AppComponent when a mobile pane is chosen. */
@Component({selector:'button[ham-mobile-tools]',exportAs:'hamMobileTools',standalone:true,templateUrl:'./mobile-tools.component.html',styleUrl:'./mobile-tools.component.css'})
export class MobileToolsComponent implements OnDestroy {
  @HostBinding('attr.aria-expanded') get ariaExpanded():string {return String(this.expanded);}
  expanded = false;
  @HostListener('click') toggle():void {this.expanded=!this.expanded;document.body.classList.toggle('ham-mobile-tools-open',this.expanded);}
  close():void {this.expanded=false;document.body.classList.remove('ham-mobile-tools-open');}
  ngOnDestroy():void {this.close();}
}
