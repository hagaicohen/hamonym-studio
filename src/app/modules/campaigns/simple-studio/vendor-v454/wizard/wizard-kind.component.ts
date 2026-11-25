import { EventEmitter, Output, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
/** ANGULAR: same markup/classes/words as original wizardKindChoice() in v0.1.301.
 * Campaign-kind change remains in legacy state until the CampaignDraft adapter.
 * BACKEND-WRITE: campaignKind is business data, must be persisted by an API adapter.
 */
@Component({ selector:'ham-wizard-kind',standalone:true,imports:[CommonModule],
 templateUrl:'./wizard-kind.component.html',styleUrl:'./wizard-kind.component.css' })
export class WizardKindComponent {
 @Input() kind: 'donation'|'race'|'simple' = 'donation';
 @Output() kindChange = new EventEmitter<'donation'|'race'|'simple'>();
 readonly kinds = [
  {key:'donation',title:'קמפיין תרומות רגיל',desc:'גיוס תרומות עם תוכן, תורמים ושגרירים'},
  {key:'race',title:'קמפיין מירוץ',desc:'גיוס תרומות יחד עם הרשמה למקצים'},
  {key:'simple',title:'דף תרומה פשוט',desc:'דף ממוקד לתרומה מהירה'}
 ] as const;
 choose(kind: 'donation'|'race'|'simple'): void { this.kindChange.emit(kind); }
}
