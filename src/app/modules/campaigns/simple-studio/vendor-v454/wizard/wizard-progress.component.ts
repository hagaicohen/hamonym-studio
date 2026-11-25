import { Component, Input } from '@angular/core';
@Component({selector:'ham-wizard-progress',standalone:true,templateUrl:'./wizard-progress.component.html',styleUrl:'./wizard-progress.component.css'})
export class WizardProgressComponent {
 @Input() step=0; @Input() simple=false; @Input() title=''; @Input() subtitle='';
 readonly shortSteps=['פרטים','מדיה','הסיפור','תרומות','מנהל'];
 readonly simpleSteps=['פרטי הדף','הגדרות תרומה','סיום'];
 readonly kickers=['נותנים לקמפיין שם','יוצרים את הרושם הראשון','מספרים למה זה חשוב','מאפשרים לאנשים לעזור','מכירים את מי שמוביל','מוכנים להמשיך'];
 readonly icons=['✎','▧','☷','♡','♙','✓'];
 get simpleIndex(){return this.step===5?2:this.step===3?1:0}
 get simplePercent(){return Math.round((this.simpleIndex+1)/3*100)}
 get current(){return this.step===5?5:Math.max(1,this.step+1)}
}
