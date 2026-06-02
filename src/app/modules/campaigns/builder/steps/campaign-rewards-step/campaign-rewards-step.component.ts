import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CampaignStudioStateService,
  CampaignReward,
} from '../../../../campaigns/services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-rewards-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-rewards-step.component.html',
  styleUrl: './campaign-rewards-step.component.css',
})
export class CampaignRewardsStepComponent {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  showCreateRewardForm = false;
  minimumAmountInput = '100';

  newReward: CampaignReward = this.emptyReward();

  sync(): void { this.campaignState.sync(); }

  addReward(): void {
    if (this.draft.rewards.length >= 20) return;
    this.showCreateRewardForm = true;
  }

  saveReward(): void {
    if (!this.newReward.title.trim()) return;
    const updated = [{ ...this.newReward, id: Date.now().toString() }, ...this.draft.rewards];
    this.campaignState.patch({ rewards: updated });
    this.resetReward();
  }

  cancelReward(): void {
    this.resetReward();
  }

  deleteReward(rewardId: string): void {
    this.campaignState.patch({ rewards: this.draft.rewards.filter(r => r.id !== rewardId) });
  }

  onMinimumAmountInput(event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    const amount = Number(digits || 0);
    this.newReward.minimumAmount = amount;
    this.minimumAmountInput = amount ? amount.toLocaleString('en-US') : '';
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.newReward.imageUrl = reader.result as string; };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.newReward.imageUrl = null;
  }

  private emptyReward(): CampaignReward {
    return { id: '', title: '', description: '', minimumAmount: 100, stock: null, imageUrl: null };
  }

  private resetReward(): void {
    this.showCreateRewardForm = false;
    this.minimumAmountInput = '100';
    this.newReward = this.emptyReward();
  }
}
