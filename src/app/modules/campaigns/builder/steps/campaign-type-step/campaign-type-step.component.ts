import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Circle, CircleCheck,
  Target, TrendingUp, Zap, LayoutGrid, Repeat,
} from 'lucide-angular';
import { CampaignStudioStateService, CampaignFundingType, CampaignLifecycle, FUNDING_TYPE_LABELS } from '../../../../campaigns/services/campaign-studio-state.service';

interface CampaignTypeOption {
  id: CampaignFundingType;
  title: string;
  description: string;
  icon: any;
}

interface LifecycleOption {
  id: CampaignLifecycle;
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

  // First decision in this step (per docs/המונים – עדכונים.pdf) — gates the
  // funding-type default below it. Orthogonal field, see CampaignLifecycle.
  readonly lifecycleOptions: LifecycleOption[] = [
    { id: 'one-time', title: 'חד־פעמי', description: 'מטרה מוגדרת עם תאריך התחלה וסיום', icon: Target },
    { id: 'ongoing',  title: 'מתמשך',   description: 'גיוס שוטף ללא תאריך סיום, ביעד חודשי', icon: Repeat },
  ];

  // Race preset is chosen earlier in the flow (campaign-preset-picker, before
  // this step) and is incompatible with 'ongoing' (Doc §2 — "גם מירוץ לא
  // רלבנטי בקמפיין מתמשך"). Explicit user decision: the system must never
  // silently resolve this conflict on the manager's behalf — surface it and
  // let them choose. See showRaceConflict below.
  get isRacePreset(): boolean { return this.draft.layout.preset === 'race'; }

  // True while a conflicting choice is pending explicit resolution — no
  // draft state changes until the manager picks one of the two actions.
  showRaceConflict = false;

  // The reverse question — leaving 'ongoing' for 'one-time' reopens the door
  // to Race (only valid for one-time), so ask explicitly instead of leaving
  // it assumed 'general' forever. Doesn't block the one-time switch itself —
  // that always happens immediately; this is a follow-up question.
  askAboutRace = false;

  selectLifecycle(lifecycle: CampaignLifecycle): void {
    if (lifecycle === 'ongoing' && this.isRacePreset) {
      this.showRaceConflict = true;
      return;
    }
    this.showRaceConflict = false;

    if (lifecycle === 'ongoing') {
      this.askAboutRace = false;
      // Ongoing campaigns ARE standing-order donations, not a default among
      // choices — the funding-model grid below is hidden entirely for this
      // lifecycle (Doc §1), replaced by a fixed explanatory note.
      this.state.patch({ campaignLifecycle: lifecycle, fundingType: 'recurring' as CampaignFundingType });
      return;
    }

    const wasOngoing = this.draft.campaignLifecycle === 'ongoing';
    // Leaving 'ongoing' — 'recurring' isn't a valid choice for a one-time
    // campaign (it's not even offered as a card there), so reset off it.
    this.state.patch(
      this.draft.fundingType === 'recurring'
        ? { campaignLifecycle: lifecycle, fundingType: 'flexible' as CampaignFundingType }
        : { campaignLifecycle: lifecycle }
    );
    this.askAboutRace = wasOngoing;
  }

  // Conflict resolution #1 — explicitly stay one-time (keeps the race preset
  // intact). Just dismisses the panel; campaignLifecycle was never touched.
  keepOneTimeForRace(): void {
    this.showRaceConflict = false;
  }

  // Conflict resolution #2 — explicitly drop the race preset, then complete
  // the switch to ongoing the manager originally asked for.
  dropRaceForOngoing(): void {
    this.state.applyPreset('general');
    this.showRaceConflict = false;
    this.selectLifecycle('ongoing');
  }

  // Reverse-question answers — same "never silently resolve" principle,
  // explicit either way.
  confirmMakeRace(): void {
    this.state.applyPreset('race');
    this.askAboutRace = false;
  }

  dismissRaceQuestion(): void {
    this.askAboutRace = false;
  }

  get isOngoing(): boolean { return this.draft.campaignLifecycle === 'ongoing'; }

  // 'recurring' deliberately excluded — Doc §2: no reason to offer it for a
  // one-time campaign, its own description ("no time limit") already IS the
  // definition of 'ongoing'. Only shown (implicitly, fixed) via the ongoing
  // branch above, never as a selectable card.
  readonly campaignTypes: CampaignTypeOption[] = [
    { id: 'all-or-nothing', title: FUNDING_TYPE_LABELS['all-or-nothing'], description: 'הכסף יועבר רק אם היעד הושג במלואו',      icon: Target     },
    { id: 'flexible',       title: FUNDING_TYPE_LABELS['flexible'],       description: 'כל סכום שיגויס יועבר לעמותה',           icon: TrendingUp  },
    { id: 'matching',       title: FUNDING_TYPE_LABELS['matching'],       description: 'כל תרומה מוכפלת לפי יחס שתקבעו',         icon: Zap        },
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
