import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ManagementModelService } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { ManagementControllerService } from '../management-controller.service';
import { ManagementEditService } from '../management-edit.service';
import { ChoiceItem, MANAGEMENT_FIELDS, choiceIcon, writeValue } from '../fields';
import { AmbassadorsFormComponent } from '../content/ambassadors-form.component';
import { IncomingFormComponent } from '../content/incoming-form.component';

/** path, title, detail */
type ExposureItem = [string, string, string];
interface ExposureGroup { icon: string; title: string; desc: string; items: ExposureItem[]; }

/** All visibility controls write to the same campaign state as the visual inspector and preview. */
const EXPOSURE_GROUPS: ExposureGroup[] = [
  { icon: '◴', title: 'נתוני גיוס', desc: 'מידע כספי ומדדי ההתקדמות הנחשפים לציבור', items: [
    ['stats.showRaised', 'הסכום שגויס', 'הסכום המצטבר עד כה'],
    ['stats.showGoal', 'יעד הגיוס', 'סכום היעד הכולל בקמפיין'],
    ['stats.showProgress', 'פס התקדמות ואחוז מהיעד', 'מוצגים רק אם סכום הגיוס והיעד גלויים'],
    ['stats.showDonors', 'מספר התורמים', 'סך התורמים בקמפיין'],
    ['stats.showDays', 'ימים שנותרו', 'הזמן שנותר לסיום הקמפיין']
  ] },
  { icon: '♙', title: 'תורמים ושגרירים', desc: 'שליטה על רשימות ופרטים אישיים', items: [
    ['visibility.donors', 'רשימת תורמים', 'הצגה או הסתרה של רשימת התורמים'],
    ['donors.showAmounts', 'סכומי תרומות אישיות', 'סכום התרומה לצד כל תורם'],
    ['donors.showDedications', 'הקדשות וברכות', 'הטקסטים שמצרפים התורמים'],
    ['visibility.ambassadors', 'רשימת שגרירים', 'הצגה או הסתרה של כרטיסי השגרירים'],
    ['modules.ambassadors.publicAmounts', 'נתוני הגיוס האישיים של שגרירים', 'סכומים, יעדים ומדי התקדמות אישיים']
  ] },
  { icon: '▦', title: 'רכיבים בדף הקמפיין', desc: 'הסתרת רכיב שומרת את התוכן ואת העיצוב שלו', items: [
    ['visibility.donationBox', 'תיבת התרומה', 'בחירת סכום ואפשרויות תרומה'],
    ['visibility.rewards', 'תשורות', 'הטבות ותשורות לתורמים'],
    ['visibility.races', 'מירוצים והרשמה', 'מסלולים ותהליך הרשמה למשתתפים'],
    ['visibility.updates', 'עדכונים', 'חדשות ועדכוני הקמפיין'],
    ['visibility.comments', 'תגובות', 'תגובות הגולשים'],
    ['visibility.sponsors', 'חסויות', 'לוגואים ופרטי נותני החסות'],
    ['visibility.story', 'סיפור הקמפיין', 'תוכן הסיפור והמדיה שלו'],
    ['visibility.share', 'שיתוף', 'כפתורי שיתוף הקמפיין']
  ] },
  { icon: '◉', title: 'פרטי קמפיין', desc: 'המידע המשלים שמופיע ליד הכותרת', items: [
    ['campaignInfo.showManager', 'פרטי מנהל הקמפיין', 'שם ותמונה של מנהל הקמפיין'],
    ['campaignInfo.showLocation', 'מיקום', 'היישוב או האזור'],
    ['campaignInfo.showCategory', 'קטגוריה', 'תחום הפעילות של הקמפיין'],
    ['campaignInfo.showCountdown', 'ספירה לאחור', 'זמן שנותר לקמפיין'],
    ['meta.nonprofitFooterVisible', 'קישור לאתר העמותה', 'מוצג רק לעמותה שיש לה כתובת אתר']
  ] }
];

/**
 * "תרומות וגיוס" (old engine `fundraisingPage`): goal and fundraising model, donation options,
 * ambassadors, donors and data exposure, as collapsible groups. Also shown for the old
 * `funding`/`donations`/`visibility` page keys.
 *
 * v4.41 fix: the old page removed the first panel of the funding group to drop the race
 * settings (shown on the race page), so in a donation campaign — which has no race panel —
 * it removed "יעד ותקופה" instead: the goal and the dates could not be edited there.
 */
@Component({
  selector: 'ham-mgmt-fundraising',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS, AmbassadorsFormComponent, IncomingFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  styleUrls: ['../fields/no-end-switch.css'],
  templateUrl: './fundraising-page.component.html'
})
export class FundraisingPageComponent {
  readonly view = inject(ManagementViewService);
  readonly controller = inject(ManagementControllerService);
  private readonly model = inject(ManagementModelService);
  private readonly edit = inject(ManagementEditService);
  setNoEndDate(checked: boolean): void {
    this.edit.snapshot();
    this.edit.commit('funding.duration', checked ? 'ongoing' : 'one-time', { rebuild: true });
  }

  readonly coinsHeading = `${choiceIcon('coins')} <span>הגדרות מאצ׳ינג</span>`;
  readonly durationChoices: ChoiceItem[] = [
    ['one-time', 'קמפיין חד־פעמי', 'לתקופת גיוס מוגדרת, עם מועד סיום.', 'calendar'],
    ['ongoing', 'קמפיין מתמשך', 'פעילות גיוס מתמשכת, ללא חובת תאריך סיום.', 'infinity']
  ];
  readonly modelChoices: ChoiceItem[] = [
    ['flexible', 'גיוס גמיש', 'סכומי התרומות אינם מותנים בהגעה ליעד.', 'wallet'],
    ['all-or-nothing', 'הכול או כלום', 'הצלחת הגיוס מותנית בהגעה ליעד שנקבע.', 'target']
  ];
  readonly matchingChoices: ChoiceItem[] = [
    [false, 'ללא מאצ׳ינג', 'התרומות אינן מוכפלות.', 'single'],
    [true, 'מאצ׳ינג פעיל', 'מגדירים יחס הכפלה ותקרת השתתפות.', 'match']
  ];
  readonly monthlyChoices: ChoiceItem[] = [
    ['until-cancel', 'עד לביטול', 'חיוב חודשי מתחדש עד שהתורם מבטל.', 'infinity'],
    ['fixed', 'מספר חיובים קבוע', 'התרומה מסתיימת לאחר מספר חודשים.', 'calendar']
  ];

  /**
   * Everything the template shows, read from the campaign state once per redraw (the old markup
   * changed only at a redraw). Plain values only: the settings objects are mutated in place.
   */
  readonly vm = computed(() => {
    this.view.revision();
    const get = (p: string) => this.model.get(p);
    const fd = this.model.nget('funding') || {}, d = this.model.nget('donations') || {};
    const options: number[] = [...(d.installmentOptions || [1, 2, 3, 4, 5, 6])];
    const groups = EXPOSURE_GROUPS.map(g => ({ ...g, rows: g.items.map(([path, title, detail]) => {
      const dependent = path === 'stats.showProgress' && (!get('stats.showGoal') || !get('stats.showRaised'));
      return { path, title, dependent, note: dependent ? 'יוצג רק כאשר הסכום שגויס והיעד גלויים' : detail };
    }) }));
    const all = EXPOSURE_GROUPS.flatMap(g => g.items);
    return {
      matching: !!fd.matching,
      noEndDate: fd.duration === 'ongoing',
      suggested: !!get('donations.suggestedAmounts'),
      monthlyEnabled: !!d.monthlyEnabled,
      monthlyFixed: d.monthlyPeriod === 'fixed',
      installments: !!d.installments,
      amounts: { oneTime: [...(get('donations.oneTime') || [])] as number[], monthly: [...(get('donations.monthly') || [])] as number[] },
      installmentOptions: options,
      groups,
      exposureOn: all.filter(([p]) => get(p)).length,
      exposureTotal: all.length,
      goalShown: !!get('stats.showGoal')
    };
  });

  /** Key that changes at every redraw: the ambassadors and donors blocks are re-created then. */
  readonly redraws = computed(() => [this.view.revision()]);

  private nextInstallment(): number {
    const options: number[] = this.model.nget('donations')?.installmentOptions || [1, 2, 3, 4, 5, 6];
    return Math.min(99, Math.max(...options, 0) + 1);
  }

  /** The add-installment input was rebuilt with the next free number on every redraw. */
  readonly writeNextInstallment = writeValue(() => this.nextInstallment());
  readonly writeExposure = (el: HTMLInputElement): void => { el.checked = !!this.model.get(el.dataset['huPath'] || ''); };
}
