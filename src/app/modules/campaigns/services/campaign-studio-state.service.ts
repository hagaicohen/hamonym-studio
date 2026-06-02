import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

export type CampaignFundingType =
  | 'all-or-nothing'
  | 'flexible'
  | 'recurring'
  | 'matching';

export interface CampaignReward {
  id: string;
  title: string;
  description: string;
  minimumAmount: number;
  stock: number | null;
  imageUrl: string | null;
}

export interface CampaignDraft {
  // Step 1 — Basic Info
  title: string;
  slug: string;
  shortDescription: string;
  fullDescription: string;

  // Step 2 — Campaign Type
  fundingType: CampaignFundingType;

  // Step 3 — Goals
  targetAmount: number;
  startDate: string;
  endDate: string;

  // Step 4 — Content
  videoUrl: string;
  coverImageUrl: string | null;

  // Step 5 — Donations
  enableSuggestedAmounts: boolean;
  allowCustomAmount: boolean;
  allowMonthlyDonation: boolean;
  suggestedAmounts: number[];
  monthlyAmounts: number[];

  // Step 6 — Rewards
  rewardsEnabled: boolean;
  rewards: CampaignReward[];

  // Step 7 — Settings
  googleAnalyticsId: string;
  facebookPixelId: string;
  googleAdsId: string;
  hotjarSiteId: string;
  personalCampaignsEnabled: boolean;
}

function createInitialDraft(): CampaignDraft {
  const today = new Date().toISOString().split('T')[0];

  const thirtyDaysLater = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  })();

  return {
    title: '',
    slug: '',
    shortDescription: '',
    fullDescription: '',
    fundingType: 'flexible',
    targetAmount: 0,
    startDate: today,
    endDate: thirtyDaysLater,
    videoUrl: '',
    coverImageUrl: null,
    enableSuggestedAmounts: true,
    allowCustomAmount: true,
    allowMonthlyDonation: true,
    suggestedAmounts: [50, 100, 180, 360, 500, 1000],
    monthlyAmounts: [18, 36, 54, 100],
    rewardsEnabled: true,
    rewards: [],
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleAdsId: '',
    hotjarSiteId: '',
    personalCampaignsEnabled: false,
  };
}

@Injectable({
  providedIn: 'root',
})
export class CampaignStudioStateService {

  private draftSubject = new BehaviorSubject<CampaignDraft>(
    createInitialDraft()
  );

  draft$ = this.draftSubject.asObservable();

  get draft(): CampaignDraft {
    return this.draftSubject.value;
  }

  patch(partial: Partial<CampaignDraft>): void {
    this.draftSubject.next({
      ...this.draft,
      ...partial,
    });
  }

  sync(): void {
    this.draftSubject.next({ ...this.draft });
  }

  reset(): void {
    this.draftSubject.next(createInitialDraft());
  }
}
