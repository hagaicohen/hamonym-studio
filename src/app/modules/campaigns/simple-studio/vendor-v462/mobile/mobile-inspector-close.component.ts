import { Component, EventEmitter, HostListener, Output } from '@angular/core';
@Component({selector:'button[ham-mobile-inspector-close]',standalone:true,templateUrl:'./mobile-inspector-close.component.html',styleUrl:'./mobile-inspector-close.component.css'})
export class MobileInspectorCloseComponent {
  @Output() close = new EventEmitter<void>();
  @HostListener('click') onClick():void {this.close.emit();}
}
