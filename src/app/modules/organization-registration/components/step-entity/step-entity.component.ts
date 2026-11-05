import { Component, EventEmitter, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { OrganizationRegistrationStateService, stepGatePasses } from '../../services/organization-registration-state.service';

import {
  ENTITY_CONFIGS,
  EntityConfig,
  EntityType,
} from '../../config/entity-config';
import { ENTITY_CATEGORIES } from '../../../../shared/config/entity-categories';
import { CategorySelectorComponent } from '../../../../shared/ui/category-picker/category-selector.component';
import { joinCategories, splitCategories } from '../../../../shared/ui/category-picker/category-selection';
import { CategorySuggestComponent } from '../../../../shared/ui/category-picker/category-suggest.component';
import { CATEGORY_SUGGESTIONS_ENABLED } from '../../../../shared/config/category-suggestions';
import { RegistrationIdentityCheckComponent, IdentityCheckState } from '../../../../shared/components/registration-identity-check/registration-identity-check.component';

@Component({
  selector: 'app-step-entity',
  standalone: true,
  imports: [CommonModule, FormsModule, RegistrationIdentityCheckComponent, CategorySelectorComponent, CategorySuggestComponent],
  templateUrl: './step-entity.component.html',
  styleUrls: ['./step-entity.component.css'],
})
export class StepEntityComponent {
  identityCheck:IdentityCheckState={status:'idle'};
  onIdentityCheck(state:IdentityCheckState):void {
    this.identityCheck=state;
    if (state.status==='duplicate') this.stateService.identityDuplicate.set(true);
    if (state.status==='available') this.stateService.identityDuplicate.set(false);
  }
  get identityEntityId():string|undefined { return this.stateService.state().entityId || undefined; }
  @Output()
  continue = new EventEmitter<void>();

  entityConfigs = ENTITY_CONFIGS;

  categories = ENTITY_CATEGORIES;

  readonly categorySuggestionsEnabled = CATEGORY_SUGGESTIONS_ENABLED;

  constructor(
    private readonly stateService: OrganizationRegistrationStateService,
  ) {}

  private updateState(partial: any): void {
    this.stateService.updateState(partial);
  }

  private get state() {
    return this.stateService.state();
  }

  get entityConfig(): EntityConfig {
    return (
      ENTITY_CONFIGS[this.entityType as EntityType] ||
      ENTITY_CONFIGS.association
    );
  }

  get entityType(): string {
    return this.stateService.state().entityType;
  }

  set entityType(value: string) {
    this.identityCheck={status:'idle'};
    this.updateState({
      entityType: value,
    });
  }

  get organizationName(): string {
    return this.stateService.state().organizationName;
  }

  set organizationName(value: string) {
    this.updateState({
      organizationName: value,
    });
  }

  get organizationNumber(): string {
    return this.stateService.state().organizationNumber;
  }

  set organizationNumber(value: string) {
    this.identityCheck={status:'idle'};
    this.updateState({
      organizationNumber: value,
    });
  }

  get primaryCategory(): string {
    return this.stateService.state().primaryCategory;
  }

  get categoryList(): string[] {
    return joinCategories(this.primaryCategory, this.selectedCategories);
  }

  setCategories(list: string[]): void {
    const { primary, secondary } = splitCategories(list);
    this.updateState({ primaryCategory: primary, selectedCategories: secondary });
  }

  get fullName(): string {
    return this.stateService.state().fullName;
  }

  set fullName(value: string) {
    this.updateState({
      fullName: value,
    });
  }

  get phone(): string {
    return this.stateService.state().phone;
  }

  set phone(value: string) {
    this.updateState({
      phone: value,
    });
  }

  get email(): string {
    return this.stateService.state().email;
  }

  set email(value: string) {
    this.updateState({
      email: value,
    });
  }

  get certificateFileName(): string {
    return this.stateService.state().certificateFileName;
  }

  set certificateFileName(value: string) {
    this.updateState({
      certificateFileName: value,
    });
  }

  get certificateFileUrl(): string {
    return this.stateService.state().certificateFileUrl;
  }

  set certificateFileUrl(value: string) {
    this.updateState({
      certificateFileUrl: value,
    });
  }

  get section46FileName(): string {
    return this.stateService.state().section46FileName;
  }

  set section46FileName(value: string) {
    this.updateState({
      section46FileName: value,
    });
  }

  get section46FileUrl(): string {
    return this.stateService.state().section46FileUrl;
  }

  set section46FileUrl(value: string) {
    this.updateState({
      section46FileUrl: value,
    });
  }

  get selectedCategories(): string[] {
    return this.stateService.state().selectedCategories;
  }

  get certificateFile(): File | null {
    return this.stateService.state().certificateFile;
  }

  set certificateFile(value: File | null) {
    this.updateState({
      certificateFile: value,
    });
  }

  get section46File(): File | null {
    return this.stateService.state().section46File;
  }

  set section46File(value: File | null) {
    this.updateState({
      section46File: value,
    });
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;

    let value = input.value.replace(/\D/g, '');

    value = value.substring(0, 10);

    if (value.length > 3) {
      value = value.substring(0, 3) + '-' + value.substring(3);
    }

    input.value = value;

    this.phone = value;
  }

  onOrganizationNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;

    let value = input.value.replace(/\D/g, '');

    value = value.substring(0, 9);

    input.value = value;

    this.organizationNumber = value;
  }

  onCertificateSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) return;

    this.certificateFile = file;

    this.certificateFileName = file.name;

    this.certificateFileUrl = URL.createObjectURL(file);
  }

  removeCertificate(): void {
    this.certificateFileName = '';

    this.certificateFileUrl = '';
  }

  onSection46Selected(event: Event): void {
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) return;

    this.section46File = file;

    this.section46FileName = file.name;

    this.section46FileUrl = URL.createObjectURL(file);
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
    return !this.stateService.identityDuplicate() && stepGatePasses(1, this.stateService.state());
  }
}
