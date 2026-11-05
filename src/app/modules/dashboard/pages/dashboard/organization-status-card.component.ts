import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApprovalStatusCardComponent } from '../../../settings/components/approval-status-card/approval-status-card.component';
import { organizationNextAction } from '../../../../shared/utils/organization-next-action';
import { campaignCreatePath } from '../../../campaigns/campaign-editor-route';

@Component({
  selector: 'app-organization-status-card',
  standalone: true,
  imports: [RouterLink, ApprovalStatusCardComponent],
  template: `
    <section class="organization-card" dir="rtl" [attr.aria-labelledby]="'organization-name-' + entity.id">
      <div class="organization-card-heading">
        <div>
          <h2 class="organization-name" [id]="'organization-name-' + entity.id">{{ entity.display_name || entity.legal_name }}</h2>
          @if (entity.unavailable) {
            <p class="organization-status">לא ניתן לטעון את מצב ההשלמות של העמותה.</p>
          } @else {
            <p class="organization-status">{{ guidance.title }}</p>
          }
        </div>
        <a class="organization-primary-action" [routerLink]="action.route" [queryParams]="action.edit ? {edit: 'true'} : {}" [attr.aria-label]="action.label + ' — ' + (entity.display_name || entity.legal_name)">{{ action.label }}</a>
      </div>
      @if (!entity.unavailable) {
        <app-approval-status-card [entityId]="entity.id" [refreshKey]="entity.status + ':' + entity.updated_at" [showResubmit]="false" [compact]="true" [displayAllFeedback]="true"></app-approval-status-card>
        @if (guidance.needsCompletion) {
          <div class="organization-required">
            <h3>פרטים נדרשים להשלמה</h3>
            @if (guidance.missingRequirements.length) {
              <ul>@for (requirement of guidance.missingRequirements; track requirement) { <li>{{ requirement }}</li> }</ul>
            } @else { <p>יש לבדוק ולהשלים את הפרטים שסומנו בחסר בהגדרות העמותה.</p> }
          </div>
        }
        @if (recommendations.length) {
          <details class="organization-recommendations">
            <summary>המלצות והשלמות נוספות — אינן חוסמות יצירת טיוטה</summary>
            <ul>@for (item of recommendations; track item) { <li>{{ item }}</li> }</ul>
          </details>
        }
      }
    </section>
  `,
  styleUrls: ['./organization-card-heading.css', './organization-status-card.component.css'],
})
export class OrganizationStatusCardComponent {
  @Input({required:true}) entity: any;
  @Input() selected = false;
  @Input() campaignCount = -1;
  get guidance() { return organizationNextAction(this.entity, this.campaignCount); }
  get action(): {label:string;route:string[];edit:boolean} {
    const settings = ['/settings/entities', this.entity.id];
    if (this.entity.unavailable) return {label:'צפייה בפרטים',route:settings,edit:false};
    switch (this.entity.status) {
      case 'changes_requested': return {label:'תיקון והגשה מחדש',route:settings,edit:true};
      case 'rejected':
      case 'suspended':
      case 'pending_review': return {label:'צפייה בפרטים',route:settings,edit:false};
    }
    if (this.selected && this.guidance.ready) return {label:this.campaignCount === 0 ? 'יצירת קמפיין ראשון' : 'ניהול הקמפיינים',route:this.campaignCount === 0 ? campaignCreatePath() : ['/campaigns'],edit:false};
    return {label:this.guidance.needsCompletion ? 'השלמת פרטים' : 'צפייה בפרטים',route:settings,edit:this.guidance.needsCompletion};
  }
  get recommendations(): string[] {
    return [
      !this.entity.logo_url ? 'הוספת לוגו' : '',
      !this.entity.association_certificate_name ? 'תעודת התאגדות — ניתן להשלים בהמשך' : '',
      this.entity.cardcom_connection_status !== 'success' ? 'בדיקת הגדרות CardCom — קבלת תרומות כפופה להגדרות הסליקה הקיימות' : '',
      this.entity.entity_type === 'association' && !this.entity.tax_document_name ? 'סעיף 46, אם קיים אישור — לצורך הטבת המס' : '',
    ].filter(item => !!item && !this.guidance.missingRequirements.some(required => item.includes(required)));
  }
}
