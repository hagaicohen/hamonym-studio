import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WizardReward } from './wizard.types';
export type { WizardReward } from './wizard.types';

export interface RewardEdit { index: number; key: 'name' | 'amount' | 'description' | 'recommended' | 'stockEnabled' | 'quantity'; value: string | number | boolean; }

/** Rewards list in the funding step. */
@Component({selector:'ham-wizard-rewards',standalone:true,
  templateUrl:'./wizard-rewards.component.html',styleUrl:'./wizard-rewards.component.css'})
export class WizardRewardsComponent {
  @Input() rewards: WizardReward[] = [];
  @Output() add = new EventEmitter<void>();
  @Output() remove = new EventEmitter<number>();
  @Output() toggle = new EventEmitter<number>();
  @Output() edit = new EventEmitter<RewardEdit>();
  @Output() upload = new EventEmitter<{ index: number; input: HTMLInputElement }>();
  formatAmount(amount: number): string { return amount ? amount.toLocaleString('he-IL') + ' ₪' : 'סכום טרם הוגדר'; }
  number(value: string): number { return Math.max(0, Number(value) || 0); }
  setStock(reward: WizardReward, index: number, enabled: boolean): void {
    reward.stockEnabled = enabled;
    this.edit.emit({ index, key: 'stockEnabled', value: enabled });
  }
}
