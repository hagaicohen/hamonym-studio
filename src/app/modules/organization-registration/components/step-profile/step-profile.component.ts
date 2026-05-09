import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-step-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-profile.component.html',
  styleUrls: ['./step-profile.component.css']
})
export class StepProfileComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  continue =
    new EventEmitter<void>();

  get canContinue(): boolean {
    return !!(
      this.selectedCampaignTypes.length &&
      this.organizationDescription.trim().length > 10 &&
      this.logoPreview
    );
  }

  organizationDescription = '';

  selectedCampaignTypes: string[] = [];

  logoPreview = '';

  campaignTypes = [
    'גיוס תרומות',
    'מימון המונים',
    'קמפיין חירום',
    'הנצחה',
    'מלגות',
    'פרויקט קהילתי',
    'קמפיין פוליטי',
    'תוכן ויצירה'
  ];

  toggleCampaignType(type: string): void {

    const exists =
      this.selectedCampaignTypes.includes(type);

    if (exists) {

      this.selectedCampaignTypes =
        this.selectedCampaignTypes.filter(
          t => t !== type
        );

      return;
    }

    this.selectedCampaignTypes.push(type);

  }

  onLogoSelected(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) return;

    this.logoPreview =
      URL.createObjectURL(file);

  }

  removeLogo(): void {

    this.logoPreview = '';

  }

}