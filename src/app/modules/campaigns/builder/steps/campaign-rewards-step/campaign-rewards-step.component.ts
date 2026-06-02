import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Reward {

  id: string;

  title: string;

  description: string;

  minimumAmount: number;

  stock: number | null;

  imageUrl: string | null;

}

@Component({
  selector: 'app-campaign-rewards-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl:
    './campaign-rewards-step.component.html',
  styleUrl:
    './campaign-rewards-step.component.css'
})
export class CampaignRewardsStepComponent {

  rewardsEnabled =
    true;

  showCreateRewardForm =
    false;

  minimumAmountInput =
    '100';

  rewards: Reward[] = [];

  newReward: Reward = {

    id: '',

    title: '',

    description: '',

    minimumAmount: 100,

    stock: null,

    imageUrl: null

  };

  addReward(): void {

    if (
      this.rewards.length >= 20
    ) {

      return;

    }

    this.showCreateRewardForm =
      true;

  }

  saveReward(): void {

    if (
      !this.newReward.title.trim()
    ) {

      return;

    }

    this.rewards.unshift({

      ...this.newReward,

      id:
        Date.now().toString()

    });

    this.resetReward();

  }

  cancelReward(): void {

    this.resetReward();

  }

  deleteReward(
    rewardId: string
  ): void {

    this.rewards =
      this.rewards.filter(
        reward =>
          reward.id !== rewardId
      );

  }

  onMinimumAmountInput(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const digits =
      input.value.replace(
        /[^0-9]/g,
        ''
      );

    const amount =
      Number(
        digits || 0
      );

    this.newReward.minimumAmount =
      amount;

    this.minimumAmountInput =
      amount
        ? amount.toLocaleString(
            'en-US'
          )
        : '';

  }

  onImageSelected(
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

    reader.onload =
      () => {

        this.newReward.imageUrl =
          reader.result as string;

      };

    reader.readAsDataURL(
      file
    );

  }

  removeImage(): void {

    this.newReward.imageUrl =
      null;

  }

  private resetReward(): void {

    this.showCreateRewardForm =
      false;

    this.minimumAmountInput =
      '100';

    this.newReward = {

      id: '',

      title: '',

      description: '',

      minimumAmount: 100,

      stock: null,

      imageUrl: null

    };

  }

}