import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  LucideAngularModule,
  Image,
  Video,
  Upload,
} from 'lucide-angular';

@Component({
  selector: 'app-campaign-content-step',

  standalone: true,

  imports: [
    FormsModule,
    LucideAngularModule,
  ],

  templateUrl:
    './campaign-content-step.component.html',

  styleUrls: [
    './campaign-content-step.component.css',
  ],
})
export class CampaignContentStepComponent {

  readonly Image =
    Image;

  readonly Video =
    Video;

  readonly Upload =
    Upload;

  videoUrl = '';

  selectedFileName = '';

  onFileSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    if (
      !input.files ||
      !input.files.length
    ) {
      return;
    }

    this.selectedFileName =
      input.files[0].name;

  }

}