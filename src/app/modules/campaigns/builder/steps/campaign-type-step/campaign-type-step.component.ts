import { Component } from '@angular/core';

export type CampaignType =
  | 'all-or-nothing'
  | 'flexible'
  | 'recurring'
  | 'matching';

@Component({
  selector: 'app-campaign-type-step',
  standalone: true,
  templateUrl: './campaign-type-step.component.html',
  styleUrls: ['./campaign-type-step.component.css'],
})
export class CampaignTypeStepComponent {
  selectedType: CampaignType | null = null;

  selectType(type: CampaignType): void {
    this.selectedType = type;
  }

  getSelectedTypeLabel(): string {
    switch (this.selectedType) {
      case 'all-or-nothing':
        return 'הכל או כלום';

      case 'flexible':
        return 'גיוס גמיש';

      case 'recurring':
        return 'הוראות קבע';

      case 'matching':
        return "מאצ'ינג";

      default:
        return 'טרם נבחר';
    }
  }
}