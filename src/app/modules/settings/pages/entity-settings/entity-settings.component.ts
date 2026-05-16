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

@Component({
  selector: 'app-entity-settings',
  standalone: true,
  imports: [
    CommonModule,
    EntityBasicInfoSectionComponent
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
}