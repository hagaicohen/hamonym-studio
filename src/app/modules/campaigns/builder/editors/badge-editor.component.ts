import { Component, Input, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BadgeBlockData, CampaignBlock, CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { UploadService } from '../../../../core/services/upload.service';

// The promotional badge's settings. Display only: nothing here reaches
// amounts, charges or reports.
@Component({
  selector: 'app-badge-editor',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './badge-editor.component.html',
  styleUrl: './comments-design-editor.component.css',
})
export class BadgeEditorComponent {
  private readonly state = inject(CampaignStudioStateService);
  private readonly uploads = inject(UploadService);
  @Input({ required: true }) block!: CampaignBlock;
  readonly shapes = [
    { value: 'pill', label: 'builder.badge.shape_pill' },
    { value: 'ribbon', label: 'builder.badge.shape_ribbon' },
    { value: 'card', label: 'builder.badge.shape_card' },
  ] as const;
  readonly sizes = [
    { value: 'sm', label: 'builder.amounts.sizeSm' },
    { value: 'md', label: 'builder.amounts.sizeMd' },
    { value: 'lg', label: 'builder.amounts.sizeLg' },
  ] as const;
  readonly aligns = [
    { value: 'start', label: 'builder.badge.align_start' },
    { value: 'center', label: 'builder.badge.align_center' },
    { value: 'end', label: 'builder.badge.align_end' },
  ] as const;
  readonly colors = [
    { key: 'background', label: 'builder.badge.background', fallback: '#583cd6' },
    { key: 'textColor', label: 'builder.badge.textColor', fallback: '#ffffff' },
    { key: 'borderColor', label: 'builder.badge.borderColor', fallback: '#ffffff' },
  ] as const;
  uploading = false;
  uploadFailed = false;

  get data(): BadgeBlockData { return (this.block.data ?? { text: '' }) as BadgeBlockData; }

  set(patch: Partial<BadgeBlockData>): void {
    const next: Record<string, unknown> = { ...this.data, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    this.state.updateBlockData(this.block.id, next as unknown as BadgeBlockData);
  }

  color(key: 'background' | 'textColor' | 'borderColor'): string | undefined { return this.data[key]; }
  setColor(key: 'background' | 'textColor' | 'borderColor', value: string | undefined): void { this.set({ [key]: value }); }

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading = true;
    this.uploadFailed = false;
    this.uploads.upload(file, 'campaigns/badges').subscribe({
      next: (url: string) => { this.uploading = false; this.set({ imageUrl: url }); },
      error: () => { this.uploading = false; this.uploadFailed = true; },
    });
  }
}
