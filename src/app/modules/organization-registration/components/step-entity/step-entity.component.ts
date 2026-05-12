import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import {
  OrganizationRegistrationStateService
} from '../../services/organization-registration-state.service';

import {
  ENTITY_CONFIGS,
  EntityConfig,
  EntityType
} from '../../config/entity-config';

@Component({
  selector: 'app-step-entity',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-entity.component.html',
  styleUrls: ['./step-entity.component.css']
})
export class StepEntityComponent {

  @Output()
  continue =
    new EventEmitter<void>();

  entityConfigs = ENTITY_CONFIGS;

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

  constructor(
    private readonly stateService:
    OrganizationRegistrationStateService
  ) {}

  private updateState(
    partial: any
  ): void {

    this.stateService.updateState(partial);

  }

  private get state() {

    return this.stateService.state();

  }

  get entityConfig(): EntityConfig {

    return (
      ENTITY_CONFIGS[
        this.entityType as EntityType
      ] || ENTITY_CONFIGS.association
    );

  }

  get entityType(): string {

    return this.state.entityType;

  }

  set entityType(value: string) {

    this.updateState({
      entityType: value
    });

  }

  get organizationName(): string {

    return this.state.organizationName;

  }

  set organizationName(value: string) {

    this.updateState({
      organizationName: value
    });

  }

  get organizationNumber(): string {

    return this.state.organizationNumber;

  }

  set organizationNumber(value: string) {

    this.updateState({
      organizationNumber: value
    });

  }

  get primaryCategory(): string {

    return this.state.primaryCategory;

  }

  set primaryCategory(value: string) {

    this.updateState({
      primaryCategory: value
    });

  }

  get fullName(): string {

    return this.state.fullName;

  }

  set fullName(value: string) {

    this.updateState({
      fullName: value
    });

  }

  get phone(): string {

    return this.state.phone;

  }

  set phone(value: string) {

    this.updateState({
      phone: value
    });

  }

  get email(): string {

    return this.state.email;

  }

  set email(value: string) {

    this.updateState({
      email: value
    });

  }

  get certificateFileName(): string {

    return this.state.certificateFileName;

  }

  set certificateFileName(value: string) {

    this.updateState({
      certificateFileName: value
    });

  }

  get certificateFileUrl(): string {

    return this.state.certificateFileUrl;

  }

  set certificateFileUrl(value: string) {

    this.updateState({
      certificateFileUrl: value
    });

  }

  get section46FileName(): string {

    return this.state.section46FileName;

  }

  set section46FileName(value: string) {

    this.updateState({
      section46FileName: value
    });

  }

  get section46FileUrl(): string {

    return this.state.section46FileUrl;

  }

  set section46FileUrl(value: string) {

    this.updateState({
      section46FileUrl: value
    });

  }

  get selectedCategories(): string[] {

    return this.state.selectedCategories;

  }

  set selectedCategories(value: string[]) {

    this.updateState({
      selectedCategories: value
    });

  }

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

    this.selectedCategories = [
      ...this.selectedCategories,
      category
    ];

  }

  onPhoneInput(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    let value =
      input.value.replace(/\D/g, '');

    value =
      value.substring(0, 10);

    if (value.length > 3) {

      value =
        value.substring(0, 3) +
        '-' +
        value.substring(3);

    }

    input.value = value;

    this.phone = value;

  }

  onOrganizationNumberInput(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    let value =
      input.value.replace(/\D/g, '');

    value =
      value.substring(0, 9);

    input.value = value;

    this.organizationNumber =
      value;

  }

  onCertificateSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) return;

    this.certificateFileName =
      file.name;

    this.certificateFileUrl =
      URL.createObjectURL(file);

  }

  removeCertificate(): void {

    this.certificateFileName = '';

    this.certificateFileUrl = '';

  }

  onSection46Selected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) return;

    this.section46FileName =
      file.name;

    this.section46FileUrl =
      URL.createObjectURL(file);

  }

  removeSection46(): void {

    this.section46FileName = '';

    this.section46FileUrl = '';

  }

  get isPhoneValid(): boolean {

    return /^05\d-\d{7}$/.test(
      this.phone
    );

  }

  get isEmailValid(): boolean {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      this.email
    );

  }

  get canContinue(): boolean {

    const section46Valid =
      !this.entityConfig.showSection46 ||
      !!this.section46FileName;

    return !!(

      this.entityType &&
      this.organizationName.trim() &&
      this.organizationNumber.trim() &&
      this.primaryCategory &&
      this.fullName.trim() &&
      this.isPhoneValid &&
      this.isEmailValid &&
      this.certificateFileName &&
      section46Valid

    );

  }

}