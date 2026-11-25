import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Angular-owned footer for wizard steps 0–5.
 * BACKEND-WRITE (future): actual persisted draft is owned by HAMONYM CampaignDraft API.
 * No backend call takes place from this component.
 */
@Component({
  selector: 'ham-wizard-footer',
  standalone: true,
  templateUrl: './wizard-footer.component.html',
  styleUrl: './wizard-footer.component.css'
})
export class WizardFooterComponent {
  @Input() step = 0;
  @Input() simple = false;
  @Output() next = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
}
