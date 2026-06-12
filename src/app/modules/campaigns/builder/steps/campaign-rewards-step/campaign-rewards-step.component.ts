import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Gift, Settings2, ChevronDown, ChevronUp, Eye } from 'lucide-angular';
import {
  CampaignStudioStateService,
  CampaignReward,
} from '../../../../campaigns/services/campaign-studio-state.service';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { UploadService } from '../../../../../core/services/upload.service';

@Component({
  selector: 'app-campaign-rewards-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ColorPickerComponent],
  templateUrl: './campaign-rewards-step.component.html',
  styleUrl: './campaign-rewards-step.component.css',
})
export class CampaignRewardsStepComponent {
  protected state       = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);

  readonly Gift        = Gift;
  readonly Settings2   = Settings2;
  readonly ChevronDown = ChevronDown;
  readonly ChevronUp   = ChevronUp;
  readonly Eye         = Eye;

  get draft() { return this.state.draft; }

  showAdvanced = false;

  // ── Form state ──
  editingRewardId: string | null = null;
  minimumAmountInput = '250';
  stockInput = '';
  reward: CampaignReward = this.empty();

  get isEditing(): boolean { return this.editingRewardId !== null; }

  sync(): void { this.state.sync(); }

  // ── Form actions ──
  save(): void {
    if (!this.reward.title.trim()) return;
    if (this.isEditing) {
      const rewards = this.draft.rewards.map(r =>
        r.id === this.editingRewardId ? { ...this.reward, id: this.editingRewardId! } : r
      );
      this.state.patch({ rewards });
    } else {
      const rewards = [...this.draft.rewards, { ...this.reward, id: Date.now().toString() }];
      this.state.patch({ rewards });
    }
    this.reset();
  }

  clearForm(): void { this.reset(); }

  editReward(r: CampaignReward): void {
    this.editingRewardId = r.id;
    this.reward = { ...r };
    this.minimumAmountInput = r.minimumAmount ? r.minimumAmount.toLocaleString('he-IL') : '';
    this.stockInput = r.stock !== null ? String(r.stock) : '';
    setTimeout(() => document.querySelector('.reward-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  deleteReward(id: string): void {
    if (id === this.editingRewardId) this.reset();
    this.state.patch({ rewards: this.draft.rewards.filter(r => r.id !== id) });
  }

  duplicateReward(r: CampaignReward): void {
    const copy = { ...r, id: Date.now().toString() };
    const idx = this.draft.rewards.findIndex(x => x.id === r.id);
    const rewards = [...this.draft.rewards];
    rewards.splice(idx + 1, 0, copy);
    this.state.patch({ rewards });
    this.editReward(copy);
  }

  // ── Amount input ──
  onAmountInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    const n = Number(raw || 0);
    this.reward.minimumAmount = n;
    this.minimumAmountInput = n ? n.toLocaleString('he-IL') : '';
  }

  onStockInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    this.stockInput = raw;
    this.reward.stock = raw ? Number(raw) : null;
  }

  // ── Image upload ──
  isUploadingImage = false;

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.isUploadingImage = true;
    this.uploadService.upload(file, 'campaigns/rewards').subscribe({
      next: url => { this.reward.imageUrl = url; this.isUploadingImage = false; },
      error: ()  => { this.isUploadingImage = false; },
    });
  }

  removeImage(): void { this.reward.imageUrl = null; }

  setRewardsLayout(layout: 'standard' | 'image'): void {
    this.state.patch({ layout: { ...this.draft.layout, rewardsLayout: layout } });
    this.sync();
  }

  // ── Theme ──
  patchTheme(partial: Partial<typeof this.draft.layout.theme>): void {
    this.state.patch({
      layout: { ...this.draft.layout, theme: { ...this.draft.layout.theme, ...partial } },
    });
  }

  private empty(): CampaignReward {
    return { id: '', title: '', description: '', minimumAmount: 250, stock: null, imageUrl: null, featured: false };
  }

  private reset(): void {
    this.editingRewardId = null;
    this.minimumAmountInput = '250';
    this.stockInput = '';
    this.reward = this.empty();
  }
}
