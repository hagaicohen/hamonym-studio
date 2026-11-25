import { PagePart } from '../parts/page-part';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { CampaignStateService } from '../../core/campaign-state.service';
import { CardData, cardDate, money } from './card-format';

/**
 * The race block of a race campaign (old core `hamSingleRaceCardMarkup`): one button with the
 * race's name, date and lowest price, which opens the registration dialog
 * (`[data-ham-race-open]`, handled by RaceRegistrationService). It reads the campaign's routes.
 */
@Component({
  selector: 'section[ham-race-card]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ham-race-one', 'aria-label': 'הרשמה למירוץ' },
  template: `<button class="ham-race-one-action" type="button" data-ham-race-open><span class="ham-race-one-symbol" aria-hidden="true">🏃</span><span class="ham-race-one-details"><strong>{{ title }}</strong><small>{{ details }}</small></span><span class="ham-race-one-cta">לפרטים ולהרשמה ←</span></button>`
})
export class RaceCardComponent extends PagePart {
  private readonly state = inject(CampaignStateService);
  private campaign!: CardData;
  private items: CardData[] = [];
  private first: CardData = {};
  title = '';

  constructor() { super(); this.render(); }
  /** The campaign as it is (v4.53: again on each page render). */
  protected render(): void {
    this.campaign = this.state.current as CardData;
    this.items = this.campaign['management']?.modules?.races?.items || [];
    this.first = this.items[0] || {};
    this.title = this.first['raceName'] || this.campaign['management']?.raceName || this.campaign['content']?.hero?.title || 'מירוץ הקמפיין';
  }

  /** "5 במרץ 2026 · החל מ־₪120": the date (or "הרשמה למירוץ") and the lowest route price. */
  get details(): string {
    const date = this.first['date'] || this.campaign['management']?.raceDate || '';
    const costs = this.items.map(item => Number(item['price'])).filter(x => Number.isFinite(x) && x >= 0);
    return (date ? cardDate({ date }) : 'הרשמה למירוץ') + (costs.length ? ' · החל מ־' + money(Math.min(...costs)) : '');
  }
}
