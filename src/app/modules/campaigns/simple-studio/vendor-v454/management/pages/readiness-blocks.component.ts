import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { ReadinessItem } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';

/** Readiness meter with its two actions (old `readyBlock`); shown on the overview and publish pages. */
@Component({
  selector: 'ham-mgmt-ready-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `@let r = view.readiness();
<div class="hu-stat"><div><strong data-hu-percent>{{ r.pct }}%</strong><small> הושלמו</small></div><small>{{ r.done }} מתוך {{ r.total }} תנאי תוכן</small></div><div class="hu-bar"><span data-hu-meter [style.width.%]="r.pct"></span></div><div class="hu-hint">תוכן הדגמה אינו נחשב למוכנות. תנאי מערכת והרשאות נבדקים בנפרד.</div><div style="margin-top:13px" class="hu-row"><button class="hu-action" data-hu-drawer>הצג חוסרים ובדיקות</button><button class="hu-action primary" data-hu-page="publish">בדיקה ופרסום</button></div>`
})
export class ReadyBlockComponent { readonly view = inject(ManagementViewService); }

/** Readiness checklist rows; each row jumps to the page that completes it (old `checkRows`). */
@Component({
  selector: 'ham-mgmt-check-rows',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `@for (x of rows; track $index) {<button type="button" class="hu-check-row" [class.done]="x.done" [attr.data-hu-page]="x.go"><span class="hu-check-icon">{{ x.done ? '✓' : '!' }}</span><span><strong>{{ x.name }}</strong><small>{{ x.detail }}</small></span><span class="hu-arrow">‹</span></button>}`
})
export class CheckRowsComponent { @Input({ required: true }) rows: ReadinessItem[] = []; }
