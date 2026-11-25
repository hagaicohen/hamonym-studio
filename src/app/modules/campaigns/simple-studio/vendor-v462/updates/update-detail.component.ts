import { Component, EventEmitter, Input, Output, HostListener } from '@angular/core';

export interface UpdateDetail {
  title:string; date:string; content:string; image:string; video:string;
}

/** Actual Angular dialog template; replaces the legacy imperative dialog DOM. */
@Component({
  selector:'ham-update-detail',standalone:true,
  template:`<div class="ham-update-detail-backdrop" (click)="dismissBackdrop($event)">
    <div class="ham-update-detail-dialog" role="dialog" aria-modal="true" [attr.aria-label]="detail.title">
      <button type="button" class="ham-close-detail" (click)="close.emit()">סגור ×</button>
      <small>{{detail.date}}</small><h2>{{detail.title}}</h2>
      @if(detail.image){<img [src]="detail.image" alt="" />}
      <p>{{detail.content}}</p>
      @if(safeVideo){<a class="ham-update-video" target="_blank" rel="noopener noreferrer" [href]="safeVideo">▶ צפייה בסרטון של העדכון</a>}
    </div>
  </div>`
})
export class UpdateDetailComponent {
  @Input() detail:UpdateDetail={title:'עדכון הקמפיין',date:'',content:'',image:'',video:''};
  @Output() close=new EventEmitter<void>();
  get safeVideo():string {return /^https?:\/\//i.test(this.detail.video)?this.detail.video:'';}
  dismissBackdrop(event:MouseEvent):void {if(event.target===event.currentTarget)this.close.emit();}
  @HostListener('document:keydown.escape') escape():void {this.close.emit();}
}
