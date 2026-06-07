import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Circle, CircleCheck,
  Target, TrendingUp, RefreshCw, Zap, LayoutGrid,
} from 'lucide-angular';
import { CampaignStudioStateService, CampaignFundingType } from '../../../../campaigns/services/campaign-studio-state.service';

interface CampaignTypeOption {
  id: CampaignFundingType;
  title: string;
  description: string;
  icon: any;
}

@Component({
  selector: 'app-campaign-type-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-type-step.component.html',
  styleUrls: ['./campaign-type-step.component.css'],
})
export class CampaignTypeStepComponent implements OnInit {
  protected state = inject(CampaignStudioStateService);
  get draft() { return this.state.draft; }

  readonly LayoutGrid    = LayoutGrid;
  readonly Circle        = Circle;
  readonly CircleCheck   = CircleCheck;

  readonly campaignTypes: CampaignTypeOption[] = [
    { id: 'all-or-nothing', title: 'הכל או כלום',   description: 'הכסף יועבר רק אם היעד הושג במלואו',      icon: Target     },
    { id: 'flexible',       title: 'גיוס גמיש',      description: 'כל סכום שיגויס יועבר לעמותה',           icon: TrendingUp  },
    { id: 'recurring',      title: 'הוראות קבע',     description: 'תרומות חודשיות קבועות ללא הגבלת זמן',    icon: RefreshCw  },
    { id: 'matching',       title: "מאצ'ינג",         description: 'כל תרומה מוכפלת לפי יחס שתקבעו',         icon: Zap        },
  ];

  selectType(type: CampaignFundingType): void { this.state.patch({ fundingType: type }); }

  // ── Goals fields ──
  targetAmountDisplay = '';
  targetTouched = false;

  ngOnInit(): void {
    if (this.draft.targetAmount > 0)
      this.targetAmountDisplay = this.draft.targetAmount.toLocaleString('en-US');
  }

  sync(): void { this.state.sync(); }

  allowMoneyChars(event: KeyboardEvent): void {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
    if (!allowed.includes(event.key) && !/^\d$/.test(event.key)) event.preventDefault();
  }

  onTargetChange(value: string): void {
    const num = Number(value.replace(/\D/g, '') || 0);
    this.targetAmountDisplay = num ? num.toLocaleString('en-US') : '';
    this.state.patch({ targetAmount: num });
  }

  isTargetInvalid():   boolean { return this.targetTouched && !this.draft.targetAmount; }
  isDateRangeInvalid():boolean {
    if (!this.draft.startDate || !this.draft.endDate) return false;
    return new Date(this.draft.endDate) < new Date(this.draft.startDate);
  }
  getCampaignDays(): number {
    if (!this.draft.startDate || !this.draft.endDate) return 0;
    return Math.ceil((new Date(this.draft.endDate).getTime() - new Date(this.draft.startDate).getTime()) / 86400000);
  }
  getDonors(amount: number): string { return Math.ceil(this.draft.targetAmount / amount).toLocaleString('en-US'); }
}
