import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ReadinessItem } from '../management-model.service';
import { PublicationChecksComponent } from './publication-checks.component';

/** Readiness meter with its two actions (old `readyBlock`); shown on the overview and publish pages. */
@Component({
  selector: 'ham-mgmt-ready-block',
  standalone: true,
  imports: [PublicationChecksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `<ham-publication-checks />`
})
export class ReadyBlockComponent {}

/** Readiness checklist rows; each row jumps to the page that completes it (old `checkRows`). */
@Component({
  selector: 'ham-mgmt-check-rows',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `@for (x of rows; track $index) {<button type="button" class="hu-check-row" [class.done]="x.done" [attr.data-hu-page]="x.go"><span class="hu-check-icon">{{ x.done ? '✓' : '!' }}</span><span><strong>{{ x.name }}</strong><small>{{ x.detail }}</small></span><span class="hu-arrow">‹</span></button>}`
})
export class CheckRowsComponent { @Input({ required: true }) rows: ReadinessItem[] = []; }
