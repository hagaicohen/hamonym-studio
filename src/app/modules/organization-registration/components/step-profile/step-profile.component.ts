import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  RichTextEditorComponent
} from '../../../../shared/ui/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-step-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RichTextEditorComponent
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

  /* DISPLAY NAME */

  displayName = '';

  /* DESCRIPTION */

  organizationDescription = '';

  /* CAMPAIGN TYPES */

  selectedCampaignTypes: string[] = [
    'one-time',
    'recurring'
  ];

  /* LOGO */

  logoPreview = '';

  /* OPTIONAL */

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

  /* VALIDATION */

  get canContinue(): boolean {

    return !!(

      this.selectedCampaignTypes.length &&

      this.displayName.trim().length > 1 &&

      this.organizationDescription.trim().length > 10 &&

      this.logoPreview

    );

  }

  /* TOGGLE TYPE */

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

  /* LOGO */

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