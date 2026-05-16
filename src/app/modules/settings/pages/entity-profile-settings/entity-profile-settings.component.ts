import { Component } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { EntityBasicInfoSectionComponent } from '../../../../shared/entity/entity-basic-info-section/entity-basic-info-section.component';

@Component({
  selector: 'app-entity-profile-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EntityBasicInfoSectionComponent
  ],
  templateUrl: './entity-profile-settings.component.html',
  styleUrls: ['./entity-profile-settings.component.css']
})
export class EntityProfileSettingsComponent {

  editingBasicInfo = false;

  entity = {

    name: 'עמותת אור לחייל',

    type: 'עמותה',

    description: 'עמותה המסייעת לחיילים בודדים'

  };

  startEditBasicInfo(): void {

    this.editingBasicInfo = true;

  }

  cancelEditBasicInfo(): void {

    this.editingBasicInfo = false;

  }

  saveBasicInfo(): void {

    console.log('SAVE ENTITY', this.entity);

    this.editingBasicInfo = false;

  }

}