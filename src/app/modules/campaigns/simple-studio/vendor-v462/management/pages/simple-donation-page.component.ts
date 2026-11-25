import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ManagementModelService } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { MediaStoreService } from '../../media/media-store.service';
import { ChoiceItem, MANAGEMENT_FIELDS, clearFile } from '../fields';

interface Picture { type: 'logo' | 'hero'; title: string; current: string; src: string; ref: string | null; }
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

/**
 * The whole management screen of a simple donation page (old engine `simpleDonationManagePage`).
 * Uploading and removing the logo/hero image are handled by the shared `data-hu-simple-upload`
 * / `data-hu-simple-remove` commands.
 */
@Component({
  selector: 'ham-mgmt-simple-donation',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './simple-donation-page.component.html'
})
export class SimpleDonationPageComponent {
  readonly view = inject(ManagementViewService);
  readonly clearFile = clearFile;
  private readonly model = inject(ManagementModelService);
  readonly media = inject(MediaStoreService);

  readonly monthlyChoices: ChoiceItem[] = [
    ['until-cancel', 'עד לביטול', 'תרומה חודשית מתחדשת.', 'infinity'],
    ['fixed', 'מספר חיובים קבוע', 'סיום לאחר מספר חודשים.', 'calendar']
  ];

  /** Everything the template shows, read once per redraw. */
  readonly vm = computed(() => {
    this.view.revision();
    const hero = this.model.context.readState()['content'].hero || {}, d = this.model.nget('donations') || {};
    return {
      pictures: [this.picture('logo', 'לוגו', hero.orgLogo), this.picture('hero', 'תמונת Hero', hero.image)],
      suggested: !!this.model.get('donations.suggestedAmounts'),
      monthlyEnabled: !!d.monthlyEnabled,
      monthlyFixed: d.monthlyPeriod === 'fixed',
      oneTime: [...(this.model.get('donations.oneTime') || [])] as number[],
      monthly: [...(this.model.get('donations.monthly') || [])] as number[]
    };
  });

  /** Same `src`/`data-ham-media-ref` as the old `mediaAttrs`. */
  private picture(type: Picture['type'], title: string, value: unknown): Picture {
    const current = String(value || '');
    const pending = current.startsWith('hamonymmedia:');
    const ready = pending ? (this.media.src(current) || '') : current;
    return { type, title, current, src: /^(https?:\/\/|blob:|data:image\/)/i.test(ready) ? ready : BLANK_GIF, ref: pending ? current : null };
  }
}
