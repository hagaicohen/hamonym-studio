import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Handshake, Eye, Settings2, ChevronDown, ChevronUp } from 'lucide-angular';
import { CampaignStudioStateService, CampaignSponsor } from '../../../services/campaign-studio-state.service';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { UploadService } from '../../../../../core/services/upload.service';

@Component({
  selector: 'app-campaign-sponsors-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ColorPickerComponent],
  templateUrl: './campaign-sponsors-step.component.html',
  styleUrl: './campaign-sponsors-step.component.css',
})
export class CampaignSponsorsStepComponent {
  private state         = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);

  readonly HandshakeIcon = Handshake;
  readonly Eye = Eye;
  readonly Settings2 = Settings2;
  readonly ChevronDown = ChevronDown;
  readonly ChevronUp = ChevronUp;

  draft$ = this.state.draft$;

  editingId: string | null = null;
  form: { name: string; logoUrl: string; link: string } = { name: '', logoUrl: '', link: '' };

  get isEditing(): boolean { return this.editingId !== null; }

  clearForm(): void {
    this.editingId = null;
    this.form = { name: '', logoUrl: '', link: '' };
  }

  editSponsor(s: CampaignSponsor): void {
    this.editingId = s.id;
    this.form = { name: s.name, logoUrl: s.logoUrl ?? '', link: s.link ?? '' };
  }

  save(): void {
    if (!this.form.name.trim()) return;
    if (this.isEditing) {
      const sponsors = this.state.draft.sponsors.map(s =>
        s.id === this.editingId
          ? { ...s, name: this.form.name, logoUrl: this.form.logoUrl || null, link: this.form.link || null }
          : s
      );
      this.state.patch({ sponsors });
    } else {
      const sponsor: CampaignSponsor = {
        id: Math.random().toString(36).slice(2, 10),
        name: this.form.name,
        logoUrl: this.form.logoUrl || null,
        link: this.form.link || null,
      };
      this.state.patch({ sponsors: [...this.state.draft.sponsors, sponsor] });
    }
    this.clearForm();
  }

  deleteSponsor(id: string): void {
    this.state.patch({ sponsors: this.state.draft.sponsors.filter(s => s.id !== id) });
    if (this.editingId === id) this.clearForm();
  }

  isUploadingLogo = false;

  onLogoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingLogo = true;
    this.uploadService.upload(file, 'campaigns/sponsors').subscribe({
      next: url => { this.form.logoUrl = url; this.isUploadingLogo = false; },
      error: ()  => { this.isUploadingLogo = false; },
    });
  }
}
