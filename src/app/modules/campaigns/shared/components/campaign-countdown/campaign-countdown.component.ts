import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';
import { HmPublicTextPipe, campaignLang } from '../../../../../core/i18n/content-language';
import { HmTextRoleDirective } from '../../../studio/preview/text-role.directive';
import { CampaignBlock, CountdownBlockData } from '../../../services/campaign-studio-state.service';
import { CountdownParts, countdownParts } from '../../../utils/countdown';
import { elementColor } from '../../../utils/element-color';

// The countdown block. It ticks outside Angular and re-renders only its own
// view once a second, so the rest of the page is never re-checked by the timer
// (expiry and hiding live in the template for the same reason).
@Component({
  selector: 'app-campaign-countdown',
  standalone: true,
  imports: [HmPublicTextPipe, HmTextRoleDirective],
  templateUrl: './campaign-countdown.component.html',
  styleUrl: './campaign-countdown.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-countdown-style]': "data.style ?? 'boxes'",
    '[class.cd--center]': "(data.align ?? 'center') === 'center'",
    '[style.--cd-accent]': 'data.accentColor || campaignColor',
    '[style.--cd-section-bg]': 'data.surfaceStyles?.section?.background || null',
    '[style.--cd-section-border]': 'data.surfaceStyles?.section?.borderColor || null',
    '[style.--cd-section-radius]': 'px(data.surfaceStyles?.section?.borderRadius)',
    '[style.--cd-unit-bg]': 'data.surfaceStyles?.unit?.background || null',
    '[style.--cd-unit-border]': 'data.surfaceStyles?.unit?.borderColor || null',
    '[style.--cd-unit-radius]': 'px(data.surfaceStyles?.unit?.borderRadius)',
  },
})
export class CampaignCountdownComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) block!: CampaignBlock;
  @Input() campaignColor = '#583cd6';
  // Editor: an unset or finished countdown still shows (with a hint), never hides.
  @Input() editing = false;

  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly lang = campaignLang();
  parts: CountdownParts | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  get data(): CountdownBlockData { return (this.block?.data ?? { targetAt: null }) as CountdownBlockData; }
  get hidden(): boolean { return !this.editing && (!this.parts || (this.parts.expired && !!this.data.hideWhenExpired)); }

  ngOnChanges(): void {
    this.tick();
    this.stop();
    if (this.parts && !this.parts.expired) {
      this.zone.runOutsideAngular(() => { this.timer = setInterval(() => this.tick(true), 1000); });
    }
  }

  ngOnDestroy(): void { this.stop(); }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(render = false): void {
    this.parts = countdownParts(this.data.targetAt, Date.now());
    if (this.parts?.expired) this.stop();
    if (render) this.cdr.detectChanges();
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }
  px(n: number | undefined): string | null { return typeof n === 'number' ? `${n}px` : null; }
  role(r: 'sectionTitle' | 'value' | 'label') { return this.data.textStyles?.[r]; }
  roleColor(r: 'sectionTitle' | 'value' | 'label'): string | null { return elementColor(this.role(r), this.lang()) ?? null; }


}
