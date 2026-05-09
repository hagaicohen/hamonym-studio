import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-step-entity',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-entity.component.html',
  styleUrls: []
})
export class StepEntityComponent {

  @Output()
  continue =
    new EventEmitter<void>();

  entityType = '';

  organizationName = '';

  organizationNumber = '';

  primaryCategory = '';

  fullName = '';

  phone = '';

  email = '';

  certificateFileName = '';

  certificateFileUrl = '';

  section46FileName = '';

  section46FileUrl = '';

  selectedCategories: string[] = [];

  categories = [
    'פוליטיקה וממשל',
    'ביטחון חוץ',
    'חינוך',
    'תרבות',
    'אמנות',
    'ספורט',
    'בריאות',
    'בריאות הנפש',
    'הצלה וזיכרון',
    'סביבה',
    'עיתונאות עצמאית',
    'ספרות וספרים',
    'יהדות',
    'דת',
    'בעלי חיים',
    'צבא וכוחות ביטחון',
    'יוצרים עצמאיים',
    'יוצרי תוכן',
    'מדיניות ציבורית',
    'איכות חיים',
    'אורח חיים',
    'טבע',
    'היסטוריה',
    'משפט וצדק',
    'סיוע לנזקקים',
    'מערכת פוליטית',
    'אחר'
  ];

  toggleCategory(category: string): void {

    const exists =
      this.selectedCategories.includes(category);

    if (exists) {

      this.selectedCategories =
        this.selectedCategories.filter(
          c => c !== category
        );

      return;
    }

    this.selectedCategories.push(category);

  }

  onPhoneInput(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    let value =
      input.value.replace(/\D/g, '');

    value = value.substring(0, 10);

    if (value.length > 3) {

      value =
        value.substring(0, 3) +
        '-' +
        value.substring(3);

    }

    input.value = value;

    this.phone = value;

  }

  onOrganizationNumberInput(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    let value =
      input.value.replace(/\D/g, '');

    value = value.substring(0, 9);

    input.value = value;

    this.organizationNumber = value;

  }

  onCertificateSelected(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) return;

    this.certificateFileName = file.name;

    this.certificateFileUrl =
      URL.createObjectURL(file);

  }

  removeCertificate(): void {

    this.certificateFileName = '';

    this.certificateFileUrl = '';

  }

  onSection46Selected(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) return;

    this.section46FileName = file.name;

    this.section46FileUrl =
      URL.createObjectURL(file);

  }

  removeSection46(): void {

    this.section46FileName = '';

    this.section46FileUrl = '';

  }

  get isPhoneValid(): boolean {

    return /^05\d-\d{7}$/.test(this.phone);

  }

  get isEmailValid(): boolean {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email);

  }

  get canContinue(): boolean {

    return !!(
      this.entityType &&
      this.organizationName.trim() &&
      this.organizationNumber.trim() &&
      this.primaryCategory &&
      this.fullName.trim() &&
      this.isPhoneValid &&
      this.isEmailValid
    );

  }

}