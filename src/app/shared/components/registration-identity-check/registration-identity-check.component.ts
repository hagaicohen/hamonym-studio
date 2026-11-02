import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, catchError, map, of, switchMap, timer } from 'rxjs';
import { EntitiesService } from '../../../core/services/entities.service';

export type IdentityCheckState = {status:'idle'|'checking'|'available'|'duplicate'|'error';existingEntityId?:string;managementScope?:'entity'|'platform'};

@Component({
 selector:'app-registration-identity-check',standalone:true,imports:[RouterLink],
 template:`<div class="identity-feedback" aria-live="polite" [class.identity-error]="state.status === 'duplicate' || state.status === 'error'">
 @if (state.status === 'checking') { <span class="identity-spinner" aria-hidden="true"></span><span>בודק את מספר הזיהוי...</span> }
 @if (state.status === 'available') { <span aria-hidden="true">✓</span><span>{{ excludeEntityId ? 'מספר הזיהוי תקין לשמירה' : 'מספר הזיהוי פנוי לרישום' }}</span> }
 @if (state.status === 'duplicate') {
   <span aria-hidden="true">ⓘ</span><span>מספר הזיהוי הזה כבר רשום במערכת. לא ניתן ליצור גוף נוסף עם אותו מספר.</span>
   @if (state.existingEntityId) { <a [routerLink]="[state.managementScope === 'platform' ? '/platform/organizations' : '/settings/entities',state.existingEntityId]">ניהול הגוף הקיים</a> }
   @else { <span>לבירור הרשאה לגוף קיים, יש לפנות לתמיכה.</span> }
 }
 @if (state.status === 'error') { <span>לא ניתן לבדוק את מספר הזיהוי כרגע. זמינות המספר לא אומתה.</span><button type="button" (click)="ngOnChanges()">נסה שוב</button> }
 </div>`,
 styles:[`:host{display:block;min-width:0}.identity-feedback{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;font-size:13px;line-height:1.6;color:#64748b;direction:rtl}.identity-error{color:#b91c1c}.identity-feedback a,.identity-feedback button{color:#583cd6;text-decoration:underline;cursor:pointer}.identity-feedback button{border:0;background:transparent;padding:0;font:inherit}.identity-feedback a:focus-visible,.identity-feedback button:focus-visible{outline:2px solid #6236ed;outline-offset:3px}.identity-spinner{width:12px;height:12px;border:2px solid #e2e8f0;border-top-color:#6236ed;border-radius:50%;animation:identity-spin .8s linear infinite}@keyframes identity-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.identity-spinner{animation:none}}`],
})
export class RegistrationIdentityCheckComponent implements OnChanges, OnDestroy {
 @Input() entityType='';
 @Input() registrationNumber='';
 @Input() excludeEntityId?:string;
 @Output() stateChange=new EventEmitter<IdentityCheckState>();
 state:IdentityCheckState={status:'idle'};
 private api=inject(EntitiesService);
 private changes=new Subject<{type:string;number:string;id?:string}|null>();
 private subscription:Subscription=this.changes.pipe(switchMap(value=>!value?of<IdentityCheckState>({status:'idle'}):timer(400).pipe(
   switchMap(()=>this.api.checkRegistrationAvailability(value.type,value.number,value.id)),
   map(result=>{
     if(typeof result?.available !== 'boolean') throw new Error('Unverified availability');
     return {status:result.available?'available':'duplicate',existingEntityId:result.existingEntityId,managementScope:result.managementScope} as IdentityCheckState;
   }),
   catchError(()=>of<IdentityCheckState>({status:'error'})),
 ))).subscribe(state=>this.setState(state));
 ngOnChanges():void {
   const number=String(this.registrationNumber??'').replace(/[\s\u200B-\u200D\uFEFF\-\u2010-\u2015\u2212]/g,'');
   const candidate=!!this.entityType && /^\d+$/.test(number);
   this.setState({status:candidate?'checking':'idle'});
   this.changes.next(candidate?{type:this.entityType,number:this.registrationNumber,id:this.excludeEntityId}:null);
 }
 private setState(state:IdentityCheckState):void {this.state=state;this.stateChange.emit(state);}
 ngOnDestroy():void {this.subscription.unsubscribe();this.changes.complete();}
}
