import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Star, Eye } from 'lucide-angular';
import { CampaignStudioStateService, CampaignAmbassador } from '../../../services/campaign-studio-state.service';
import { UploadService } from '../../../../../core/services/upload.service';

@Component({
  selector: 'app-campaign-ambassadors-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-ambassadors-step.component.html',
  styleUrl: './campaign-ambassadors-step.component.css',
})
export class CampaignAmbassadorsStepComponent {
  private state         = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);

  readonly StarIcon = Star;
  readonly EyeIcon  = Eye;

  draft$ = this.state.draft$;

  editingId: string | null = null;
  form: { name: string; imageUrl: string } = { name: '', imageUrl: '' };

  get isEditing(): boolean { return this.editingId !== null; }

  clearForm(): void {
    this.editingId = null;
    this.form = { name: '', imageUrl: '' };
  }

  edit(a: CampaignAmbassador): void {
    this.editingId = a.id;
    this.form = { name: a.name, imageUrl: a.imageUrl ?? '' };
  }

  save(): void {
    if (!this.form.name.trim()) return;
    if (this.isEditing) {
      const ambassadors = this.state.draft.ambassadors.map(a =>
        a.id === this.editingId ? { ...a, ...this.form } : a
      );
      this.state.patch({ ambassadors });
    } else {
      const item: CampaignAmbassador = {
        id: Math.random().toString(36).slice(2, 10),
        name: this.form.name,
        imageUrl: this.form.imageUrl,
      };
      this.state.patch({ ambassadors: [...this.state.draft.ambassadors, item] });
    }
    this.clearForm();
  }

  delete(id: string): void {
    this.state.patch({ ambassadors: this.state.draft.ambassadors.filter(a => a.id !== id) });
    if (this.editingId === id) this.clearForm();
  }

  isUploadingImage = false;

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingImage = true;
    this.uploadService.upload(file, 'campaigns/ambassadors').subscribe({
      next: url => { this.form.imageUrl = url; this.isUploadingImage = false; },
      error: ()  => { this.isUploadingImage = false; },
    });
  }
}
