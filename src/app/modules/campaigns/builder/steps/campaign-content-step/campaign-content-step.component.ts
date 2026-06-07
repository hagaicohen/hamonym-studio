import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Image, Video, Upload } from 'lucide-angular';
import { CampaignStudioStateService } from '../../../../campaigns/services/campaign-studio-state.service';
import { UploadService } from '../../../../../core/services/upload.service';

@Component({
  selector: 'app-campaign-content-step',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './campaign-content-step.component.html',
  styleUrls: ['./campaign-content-step.component.css'],
})
export class CampaignContentStepComponent {

  protected campaignState = inject(CampaignStudioStateService);
  private uploadService   = inject(UploadService);

  get draft() { return this.campaignState.draft; }

  readonly Image = Image;
  readonly Video = Video;
  readonly Upload = Upload;

  selectedFileName = '';
  isUploading = false;

  sync(): void { this.campaignState.sync(); }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.selectedFileName = file.name;
    this.isUploading = true;
    this.uploadService.upload(file, 'campaigns/covers').subscribe({
      next: url => { this.campaignState.patch({ coverImageUrl: url }); this.isUploading = false; },
      error: ()  => { this.isUploading = false; },
    });
  }
}
