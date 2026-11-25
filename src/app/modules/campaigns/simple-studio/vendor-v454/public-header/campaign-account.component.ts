import { ChangeDetectorRef, Component, Input, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CampaignAccountUser {
  isLoggedIn?: boolean;
  name?: string;
  photo?: string;
}

/**
 * Campaign account menu: template and interactions are owned by Angular. v4.49: part of the header's template
 * (the page is rendered from its inputs, not checked by the application), so its own changes are rendered here.
 */
@Component({
  selector:'div[ham-campaign-account]', standalone:true, imports:[CommonModule],
  templateUrl:'./campaign-account.component.html',
  styleUrls:['./campaign-account.component.css']
})
export class CampaignAccountComponent implements OnDestroy {
  @Input() user: CampaignAccountUser | null = null;
  expanded=false;
  get photo():string {
    const src=this.user?.photo;
    return typeof src==='string' && /^(https?:|data:image\/)/i.test(src)?src:'';
  }
  get initial():string { return String(this.user?.name||'משתמש').trim().slice(0,1); }
  toggle(event:MouseEvent):void {event.preventDefault();event.stopPropagation();this.set(!this.expanded);}
  action(action:string,event:MouseEvent):void {
    event.preventDefault();event.stopPropagation();this.set(false);
    const messages:Record<string,string>={
      login:'התחברות תתחבר למערכת המשתמשים של המונים',
      register:'הרשמה תתחבר למערכת המשתמשים של המונים',
      profile:'האזור האישי ייפתח דרך מערכת המשתמשים',
      donations:'התרומות שלי ייפתחו דרך מערכת המשתמשים',
      logout:'התנתקות תתבצע דרך מערכת המשתמשים'
    };
    const message=messages[action]||'פעולה אינה זמינה בדמו';
    // MOCK-ONLY: authentication/account actions connect to the real backend later.
    const existingToast=(window as Window & {hamAccountToast?:(message:string)=>void}).hamAccountToast;
    if(typeof existingToast==='function') existingToast(message);
    else window.alert(message);
  }
  @HostListener('document:click',['$event']) outside(event:MouseEvent):void {
    if(!(event.target instanceof Node) || !this.hostContains(event.target))this.set(false);
  }
  @HostListener('document:keydown.escape') escape():void {this.set(false);}
  constructor(private readonly element:ElementRef<HTMLElement>,private readonly cdr:ChangeDetectorRef){}
  private set(expanded:boolean):void {
    if(this.expanded===expanded)return;
    this.expanded=expanded;
    this.cdr.detectChanges();
  }
  private hostContains(node:Node):boolean{return this.element.nativeElement.contains(node);}
  ngOnDestroy():void {this.expanded=false;}
}
