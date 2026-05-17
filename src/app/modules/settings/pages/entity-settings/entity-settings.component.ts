import {
  Component,
  OnInit,
  inject
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  EntityBasicInfoSectionComponent
} from '../../../../shared/entity/entity-basic-info-section/entity-basic-info-section.component';

import {
  CurrentEntityService
} from '../../../../core/services/current-entity.service';
import { CAMPAIGN_TYPES } from '../../../organization-registration/constants/campaign-types';

import {
  EntityProfileSectionComponent
} from '../../../../shared/entity/entity-profile-section/entity-profile-section.component';

import {
  ENTITY_CONFIGS
} from '../../../organization-registration/config/entity-config';

import {
  environment
} from '../../../../../environments/environment';

@Component({
  selector: 'app-entity-settings',
  standalone: true,
  imports: [
    CommonModule,
    EntityBasicInfoSectionComponent,
    EntityProfileSectionComponent
  ],
  templateUrl: './entity-settings.component.html',
  styleUrls: ['./entity-settings.component.css']
})
export class EntitySettingsComponent

  implements OnInit {

  private currentEntityService =
    inject(CurrentEntityService);

  editMode = false;

  entity: any = null;

  draftEntity: any = null;

  campaignTypes = CAMPAIGN_TYPES;

  ENTITY_CONFIGS = ENTITY_CONFIGS;

  apiUrl = environment.apiUrl;

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
  ) {

    this.draftEntity = {

      ...this.draftEntity,

      ...partial

    };
  }

  cancelEdit() {

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode = false;
  }

  saveAll() {

    console.log(
      this.draftEntity
    );

    this.entity =
      structuredClone(
        this.draftEntity
      );

    this.editMode = false;
  }

  onLogoSelected(
  file: File
        ) {

          console.log(
            'LOGO SELECTED',
            file
          );

    }

    get entityTypeLabel(): string {
        return this.ENTITY_CONFIGS[
          this.draftEntity?.entity_type as keyof typeof ENTITY_CONFIGS
        ]?.labels?.entity || 'יישות';
      }
}