import {
  Component,
  OnInit,
  inject
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  CurrentEntityService
} from '../../../../core/services/current-entity.service';

import {
  CAMPAIGN_TYPES
} from '../../../organization-registration/constants/campaign-types';

import {
  ENTITY_CONFIGS
} from '../../../organization-registration/config/entity-config';

import {
  environment
} from '../../../../../environments/environment';

import {
  EntityBasicInfoSectionViewComponent
} from '../view/entity-basic-info-section-view/entity-basic-info-section-view.component';

import {
  EntityBasicInfoSectionEditComponent
} from '../edit/entity-basic-info-section-edit/entity-basic-info-section-edit.component';

import {
  EntityProfileSectionViewComponent
} from '../view/entity-profile-section-view/entity-profile-section-view.component';

import {
  EntityProfileSectionEditComponent
} from '../edit/entity-profile-section-edit/entity-profile-section-edit.component';

import {
  EntityGoalsSectionViewComponent
} from '../view/entity-goals-section-view/entity-goals-section-view.component';

import {
  EntityGoalsSectionEditComponent
} from '../edit/entity-goals-section-edit/entity-goals-section-edit.component';

@Component({
  selector: 'app-entity-settings',
  standalone: true,
  imports: [
    CommonModule,

    EntityBasicInfoSectionViewComponent,
    EntityBasicInfoSectionEditComponent,

    EntityProfileSectionViewComponent,
    EntityProfileSectionEditComponent,

    EntityGoalsSectionViewComponent,
    EntityGoalsSectionEditComponent
  ],
  templateUrl:
    './entity-settings.component.html',

  styleUrls: [
    './entity-settings.component.css'
  ]
})
export class EntitySettingsComponent
  implements OnInit {

  private currentEntityService =
    inject(CurrentEntityService);

  editMode = false;

  entity: any = null;

  draftEntity: any = null;

  campaignTypes =
    CAMPAIGN_TYPES;

  ENTITY_CONFIGS =
    ENTITY_CONFIGS;

  apiUrl =
    environment.apiUrl;

  ngOnInit(): void {

    this.entity =
      this.currentEntityService
        .currentEntity();

    this.draftEntity =
      structuredClone(
        this.entity
      );
  }

  onEntityChange(
    partial: any
  ): void {

    this.draftEntity = {

      ...this.draftEntity,

      ...partial

    };
  }

  startEdit(): void {

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode = true;
  }

  cancelEdit(): void {

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode = false;
  }

  saveAll(): void {

    console.log(
      this.draftEntity
    );

    this.entity =
      structuredClone(
        this.draftEntity
      );

    this.editMode = false;
  }

  get entityTypeLabel(): string {

    const entityType =
      this.draftEntity?.entity_type as keyof typeof ENTITY_CONFIGS;

    return this.ENTITY_CONFIGS[
      entityType
    ]?.labels?.entity || 'יישות';
  }

}