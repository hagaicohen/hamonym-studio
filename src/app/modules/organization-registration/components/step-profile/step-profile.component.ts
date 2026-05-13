import { Component, EventEmitter, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { RichTextEditorComponent } from '../../../../shared/ui/rich-text-editor/rich-text-editor.component';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

import { CAMPAIGN_TYPES } from '../../constants/campaign-types';

import {
  ENTITY_CONFIGS,
  EntityConfig,
  EntityType,
} from '../../config/entity-config';

@Component({
  selector: 'app-step-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RichTextEditorComponent],
  templateUrl: './step-profile.component.html',
  styleUrls: ['./step-profile.component.css'],
})
export class StepProfileComponent {
  @Output()
  back = new EventEmitter<void>();

  @Output()
  continue = new EventEmitter<void>();

  campaignTypes = CAMPAIGN_TYPES;

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
      ENTITY_CONFIGS[this.state.entityType as EntityType] ||
      ENTITY_CONFIGS.association
    );
  }

  get displayName(): string {
    return this.state.displayName;
  }

  set displayName(value: string) {
    this.updateState({
      displayName: value,
    });
  }

  get organizationDescription(): string {
    return this.state.organizationDescription;
  }

  set organizationDescription(value: string) {
    this.updateState({
      organizationDescription: value,
    });
  }

  get selectedCampaignTypes(): string[] {
    return this.state.selectedCampaignTypes;
  }

  set selectedCampaignTypes(value: string[]) {
    this.updateState({
      selectedCampaignTypes: value,
    });
  }

  get logoPreview(): string {
    return this.state.logoPreview;
  }

  set logoPreview(value: string) {
    this.updateState({
      logoPreview: value,
    });
  }

  get canContinue(): boolean {
    return !!(
      this.selectedCampaignTypes.length &&
      this.displayName.trim().length > 1 &&
      this.organizationDescription.trim().length > 10 &&
      this.logoPreview
    );
  }

  toggleCampaignType(type: string): void {
    const exists = this.selectedCampaignTypes.includes(type);

    if (exists) {
      this.selectedCampaignTypes = this.selectedCampaignTypes.filter(
        (t) => t !== type,
      );

      return;
    }

    this.selectedCampaignTypes = [...this.selectedCampaignTypes, type];
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) return;

    this.logoPreview = URL.createObjectURL(file);
  }

  removeLogo(): void {
    this.logoPreview = '';
  }
}
