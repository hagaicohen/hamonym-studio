import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  FileText,
  Heart,
  Settings,
  Gift,
  Info,
  CreditCard,
  Check,
  CircleAlert,
  Rocket,
} from 'lucide-angular';
import {
  CampaignStudioStateService,
} from '../../../../campaigns/services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-publish-step',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './campaign-publish-step.component.html',
  styleUrl: './campaign-publish-step.component.css',
})
export class CampaignPublishStepComponent {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  readonly FileText = FileText;
  readonly Heart = Heart;
  readonly Settings = Settings;
  readonly Gift = Gift;
  readonly Info = Info;
  readonly CreditCard = CreditCard;
  readonly Check = Check;
  readonly CircleAlert = CircleAlert;
  readonly Rocket = Rocket;

  private readonly fundingTypeLabels: Record<string, string> = {
    'flexible':       'קמפיין גמיש',
    'all-or-nothing': 'הכל או כלום',
    'recurring':      'הוראות קבע',
    'matching':       "מאצ'ינג",
  };

  get fundingTypeLabel(): string {
    return this.fundingTypeLabels[this.draft.fundingType] ?? '';
  }

  get campaignDays(): number {
    if (!this.draft.startDate || !this.draft.endDate) return 0;
    const diff = new Date(this.draft.endDate).getTime() - new Date(this.draft.startDate).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  get hasHero(): boolean {
    return this.draft.heroType === 'image'
      ? !!this.draft.coverImageUrl
      : !!this.draft.videoUrl;
  }

  get hasStoryBlock(): boolean {
    return this.draft.blocks.some(b =>
      b.type === 'rich-text' && !!(b.data as { content?: string }).content?.replace(/<[^>]*>/g, '').trim()
    );
  }

  get missingFields(): string[] {
    const d = this.draft;
    const missing: string[] = [];
    if (!d.title?.trim())            missing.push('כותרת הקמפיין');
    if (!d.slug?.trim())             missing.push('כתובת הקמפיין');
    if (!d.shortDescription?.trim()) missing.push('כותרת משנה');
    if (!this.hasHero)               missing.push('תמונה / וידאו ראשי');
    if (!d.targetAmount)             missing.push('יעד גיוס');
    return missing;
  }

  get isReady(): boolean {
    return this.missingFields.length === 0;
  }
}
