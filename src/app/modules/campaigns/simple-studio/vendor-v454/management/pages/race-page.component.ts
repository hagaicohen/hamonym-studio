import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ManagementModelService } from '../management-model.service';
import { MANAGEMENT_FIELDS, writeValue } from '../fields';
import { RaceSetupComponent } from '../../races/race-setup.component';

/**
 * "ניהול מירוץ" (old engine `racePage` + `raceManagerForm`). In a race campaign the heats and
 * participants are edited by RaceSetupComponent, rendered here directly. Before v4.42 the engine
 * built a full per-route editor collection, which RaceFlowService then hid (`display:none`) and
 * replaced with RaceSetupComponent through a MutationObserver: that hidden editor was never
 * reachable and is gone. Rebuilt on every redraw, like the old markup.
 */
@Component({
  selector: 'ham-mgmt-race',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS, RaceSetupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `@if (race) {
<div class="hu-eyebrow">ניהול הקמפיין / ניהול מירוץ</div><h1 class="hu-page-title">ניהול מירוץ</h1><p class="hu-lead">מקצים, מחירים, הרשמה ומשתתפים — בלי לשנות את מנגנון המירוץ.</p>
<section ham-panel [title]="'מקצים, הרשמה ומשתתפים'" [sub]="'ניהול ממוקד של המירוץ והמשתתפים.'">
  <label ham-switch [title]="'הצג מירוצים והרשמה בקמפיין'" [hint]="'הסתרה אינה מוחקת מסלולים ואת פרטי ההרשמה'" [path]="'visibility.races'"></label>
  <div class="hu-module-intro"><div><strong>מירוצים ומסלולי הרשמה</strong><small>הגדירו כאן מסלול, מחיר, מכסת מקומות והפרטים הנדרשים מכל משתתף. בסטודיו מעצבים את הכרטיסים ואת חוויית ההרשמה.</small></div><button type="button" class="hu-action primary" data-hu-edit="races">עיצוב מירוצים</button></div>
  @if (count) {<div><ham-race-setup /></div>}
  @else {<div class="hu-no-items"><strong>עדיין לא הוגדרו מסלולים</strong><p>הוסיפו מסלול ראשון. תוכלו לבדוק את הרשמת המשתתפים בתצוגת הדמו.</p></div>}
  <div class="hu-row"><button class="hu-action primary" data-hu-add-item="races" type="button">＋ הוסף מסלול הרשמה</button></div><div class="hu-callout hu-warning">כל המסלולים וההרשמות בגרסה זו הם הדמיה מקומית. אין חיוב, שמירת משתתפים בשרת או הקצאת מקומות אמיתית.</div>
</section>
} @else {
<div class="hu-eyebrow">ניהול הקמפיין / ניהול מירוץ</div><h1 class="hu-page-title">ניהול מירוץ</h1><p class="hu-lead">האזור זמין בקמפיין מסוג מירוץ בלבד.</p>
<label class="ham-kind-choice">סוג הקמפיין <select data-ham-campaign-kind aria-label="סוג הקמפיין" [hamDraw]="writeKind"><option value="donation">קמפיין תרומות רגיל</option><option value="race">קמפיין מירוץ</option><option value="simple">דף תרומה פשוט</option></select></label>
}`
})
export class RacePageComponent {
  private readonly model = inject(ManagementModelService);
  readonly race = this.model.campaignKind() === 'race';
  readonly count = this.model.partsFor('races').length;
  readonly writeKind = writeValue(() => this.model.campaignKind());
}
