import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Image as ImageIcon } from 'lucide-angular';
import { CampaignBlock, CampaignStudioStateService, ImageBlockData } from '../../services/campaign-studio-state.service';
import { UploadService } from '../../../../core/services/upload.service';

// Image block editor, shared by Step 9 and the Studio properties panel.
@Component({
  selector: 'app-image-block-editor',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './image-block-editor.component.html',
  styleUrl: './block-editor.css',
})
export class ImageBlockEditorComponent {
  @Input({ required: true }) block!: CampaignBlock;
  readonly ui = { ImageIcon };
  private state = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);

  asImage(data: unknown): ImageBlockData { return data as ImageBlockData; }

  updateImageField(id: string, field: keyof ImageBlockData, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as ImageBlockData);
  }

  updateImageWidth(id: string, widthPercent: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, widthPercent } as ImageBlockData);
  }

  updateImageHeight(id: string, heightPx: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, heightPx } as ImageBlockData);
  }

  resetImageHeight(id: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = { ...(block.data as ImageBlockData) };
    delete data.heightPx;
    this.state.updateBlockData(id, data);
  }

  onImageFileSelected(id: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadService.upload(file, 'campaigns/blocks').subscribe({
      next: url => this.updateImageField(id, 'url', url),
    });
  }
}
