import { Component, HostBinding, HostListener, OnDestroy } from '@angular/core';
/** Angular-owned direct-child button, preserving v0.1.301 CSS selectors. */
@Component({selector:'button[hamMobileTools]',standalone:true,templateUrl:'./mobile-tools.component.html',styleUrl:'./mobile-tools.component.css'})
export class MobileToolsComponent implements OnDestroy {
  @HostBinding('attr.aria-expanded') get ariaExpanded():string {return String(this.expanded);}
  expanded = false;
  private readonly onPaneChange = () => this.close();
  constructor(){document.addEventListener('ham:mobile-pane-change',this.onPaneChange);}
  @HostListener('click') toggle():void {this.expanded=!this.expanded;document.body.classList.toggle('ham-mobile-tools-open',this.expanded);}
  close():void {this.expanded=false;document.body.classList.remove('ham-mobile-tools-open');}
  ngOnDestroy():void {this.close();document.removeEventListener('ham:mobile-pane-change',this.onPaneChange);}
}
