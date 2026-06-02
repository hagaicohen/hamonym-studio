import { Component, inject } from '@angular/core';

import {
  LucideAngularModule,
  Circle,
  CheckCircle2,
  Target,
  TrendingUp,
  RefreshCw,
  Zap
} from 'lucide-angular';

import {
  CampaignStudioStateService,
  CampaignFundingType,
} from '../../../../campaigns/services/campaign-studio-state.service';

interface CampaignTypeOption {
  id: CampaignFundingType;
  title: string;
  description: string;
  recommendation: string;
  icon: any;
}

@Component({
  selector: 'app-campaign-type-step',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './campaign-type-step.component.html',
  styleUrls: ['./campaign-type-step.component.css'],
})
export class CampaignTypeStepComponent {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  readonly Circle = Circle;
  readonly CheckCircle2 = CheckCircle2;
  readonly Target = Target;
  readonly TrendingUp = TrendingUp;
  readonly RefreshCw = RefreshCw;
  readonly Zap = Zap;

  readonly campaignTypes: CampaignTypeOption[] = [
    {
      id: 'all-or-nothing',
      title: 'הכל או כלום',
      description: 'הכסף יועבר רק אם יעד הגיוס הושג במלואו',
      recommendation: 'מומלץ לפרויקטים עם יעד ברור',
      icon: Target,
    },
    {
      id: 'flexible',
      title: 'גיוס גמיש',
      description: 'כל סכום שיגויס יועבר לעמותה',
      recommendation: 'מומלץ לרוב העמותות',
      icon: TrendingUp,
    },
    {
      id: 'recurring',
      title: 'הוראות קבע',
      description: 'תרומות חודשיות קבועות ללא הגבלת זמן',
      recommendation: 'בניית הכנסה קבועה לאורך זמן',
      icon: RefreshCw,
    },
    {
      id: 'matching',
      title: "מאצ'ינג",
      description: 'כל תרומה מוכפלת לפי יחס שתקבעו',
      recommendation: 'מתאים לקמפיינים אינטנסיביים וקצרים',
      icon: Zap,
    },
  ];

  selectType(type: CampaignFundingType): void {
    this.campaignState.patch({ fundingType: type });
  }

  getSelectedTypeLabel(): string {
    return this.campaignTypes.find(item => item.id === this.draft.fundingType)?.title ?? '';
  }
}
