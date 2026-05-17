import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  RichTextEditorComponent
} from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-entity-profile-section-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RichTextEditorComponent
  ],
  templateUrl:
    './entity-profile-section-edit.component.html',

  styleUrls: [
    './entity-profile-section-edit.component.css'
  ]
})
export class EntityProfileSectionEditComponent {

  @Input()
  entity: any;

  @Input()
  entityTypeLabel = '';

  @Input()
  campaignTypes: any[] = [];

  @Input()
  apiUrl = '';

  @Output()
  entityChange =
    new EventEmitter<any>();

  updateField(
    field: string,
    value: any
  ): void {

    this.entityChange.emit({
      [field]: value
    });
  }

  toggleCampaignType(
    typeId: string
  ): void {

    const current =
      this.entity?.campaign_types || [];

    const exists =
      current.includes(typeId);

    const updated =
      exists
        ? current.filter(
            (t: string) => t !== typeId
          )
        : [
            ...current,
            typeId
          ];

    this.updateField(
      'campaign_types',
      updated
    );
  }

  onLogoSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {

      this.entityChange.emit({

        logo_url:
          reader.result

      });
    };

    reader.readAsDataURL(file);
  }

  getLogoUrl(): string {

    const logo =
      this.entity?.logo_url;

    if (!logo) {
      return '';
    }

    if (
      typeof logo === 'string' &&
      (
        logo.startsWith('http') ||
        logo.startsWith('data:image')
      )
    ) {
      return logo;
    }

    return `${this.apiUrl}${logo}`;
  }

  get hasCampaignTypes(): boolean {
    return (
      this.entity?.campaign_types?.length > 0
    );
  }

}