import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Megaphone, Eye } from 'lucide-angular';
import { CampaignStudioStateService, CampaignUpdate } from '../../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-updates-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-updates-step.component.html',
  styleUrl: './campaign-updates-step.component.css',
})
export class CampaignUpdatesStepComponent {
  private state = inject(CampaignStudioStateService);

  readonly MegaphoneIcon = Megaphone;
  readonly EyeIcon       = Eye;

  draft$ = this.state.draft$;

  editingId: string | null = null;
  form: Omit<CampaignUpdate, 'id'> = this.emptyForm();

  get isEditing(): boolean { return this.editingId !== null; }

  private emptyForm(): Omit<CampaignUpdate, 'id'> {
    return {
      title: '', date: new Date().toISOString().split('T')[0],
      description: '', mediaType: 'none', mediaUrl: '',
      linkUrl: '', linkLabel: '',
    };
  }

  clearForm(): void { this.editingId = null; this.form = this.emptyForm(); }

  edit(u: CampaignUpdate): void {
    this.editingId = u.id;
    this.form = { title: u.title, date: u.date, description: u.description, mediaType: u.mediaType, mediaUrl: u.mediaUrl, linkUrl: u.linkUrl, linkLabel: u.linkLabel };
  }

  save(): void {
    if (!this.form.title.trim()) return;
    if (this.isEditing) {
      const updates = this.state.draft.updates.map(u =>
        u.id === this.editingId ? { ...u, ...this.form } : u
      );
      this.state.patch({ updates });
    } else {
      const item: CampaignUpdate = { id: Math.random().toString(36).slice(2, 10), ...this.form };
      this.state.patch({ updates: [...this.state.draft.updates, item] });
    }
    this.clearForm();
  }

  delete(id: string): void {
    this.state.patch({ updates: this.state.draft.updates.filter(u => u.id !== id) });
    if (this.editingId === id) this.clearForm();
  }

  onMediaSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onload = () => {
      this.form.mediaUrl  = reader.result as string;
      this.form.mediaType = isVideo ? 'video' : 'image';
    };
    reader.readAsDataURL(file);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y.slice(2)}`;
  }
}
