import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SectionTreeService, TreeRow } from './section-tree.service';

/**
 * `#sectionList`: the campaign's blocks in the device's order, with selection, visibility, ↑ / ↓, drag and drop and
 * the large-editor button. Markup, classes and `data-*` attributes are the ones the core's HTML strings produced.
 */
@Component({
  selector: '[ham-section-tree]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Default,
  template: `@if (tree.view; as v) {@if (v.simple) {<div class="section-item active" data-select="hero" (click)="tree.select('hero')"><span class="section-icon">🎨</span><span class="section-label">עיצוב דף תרומה פשוט<small>פריסה · צבעים · גופנים · כפתורים</small></span><ng-container *ngTemplateOutlet="studio; context: { $implicit: 'hero', name: 'תמונת פתיחה' }"></ng-container></div>} @else {<div [attr.class]="'section-item general-design ' + (v.themeActive ? 'active' : '')" data-select="theme" (click)="tree.select('theme')"><span class="section-icon">🎨</span><span class="section-label">עיצוב כללי<small>ערכות צבעים · פונטים · צבעי מותג</small></span><ng-container *ngTemplateOutlet="studio; context: { $implicit: 'theme', name: 'הקמפיין' }"></ng-container></div><div class="section-divider"></div><div class="main-order-note">סדר הרכיבים עבור <strong>{{ v.device === 'mobile' ? 'מובייל' : 'דסקטופ' }}</strong> · גררו או השתמשו בחצים</div>@for (r of v.rows; track r.id) {<div [attr.class]="rowClass(r)" [attr.data-select]="r.id" [attr.data-order-id]="r.id" [attr.aria-disabled]="r.locked + ''" [attr.title]="r.locked ? 'לא זמין בדף תרומה פשוט' : ''" [attr.draggable]="r.movable && !r.locked ? 'true' : null" (click)="tree.select(r.id)" (dragstart)="tree.dragStart($event, r)" (dragover)="tree.dragOver($event, r)" (drop)="tree.drop($event, r)" (dragend)="tree.dragEnd()"><span class="section-icon">{{ r.icon }}</span><span class="section-label">{{ r.name }}<small>{{ r.sub }}</small></span><span class="main-order-controls">@if (r.movable && !r.locked) {<span class="main-drag-handle" title="גרור לשינוי סדר" aria-hidden="true">⠿</span><button type="button" data-main-move="up" [attr.data-main-id]="r.id" title="העבר למעלה" [attr.aria-label]="'העבר ' + r.name + ' למעלה'" [disabled]="r.first" (click)="tree.move($event, r.id, 'up')">↑</button><button type="button" data-main-move="down" [attr.data-main-id]="r.id" title="העבר למטה" [attr.aria-label]="'העבר ' + r.name + ' למטה'" [disabled]="r.last" (click)="tree.move($event, r.id, 'down')">↓</button>} @else {<span class="main-fixed-hint" title="רכיב קבוע במבנה התבנית">קבוע</span>}</span><button [attr.class]="'visibility ' + (r.visible ? '' : 'off')" [attr.data-visibility]="r.id" [disabled]="r.locked" [attr.aria-disabled]="r.locked ? 'true' : null" [attr.title]="r.locked ? 'לא זמין בדף תרומה פשוט' : 'הצג או הסתר'" (click)="tree.toggleVisibility($event, r.id)">{{ r.visible ? '◉' : '◌' }}</button>@if (!r.locked) {<ng-container *ngTemplateOutlet="studio; context: { $implicit: r.id, name: r.name }"></ng-container>}</div>}}}
<ng-template #studio let-id let-name="name"><button type="button" class="ham-tree-studio-button" [attr.data-ham-tree-studio]="id" [attr.aria-label]="'עריכת ' + name + ' בחלון גדול'" [attr.title]="'פותח חלון גדול עם אפשרויות העריכה של ' + name" (click)="tree.openEditor($event, id)">✎ עריכה בחלון גדול</button></ng-template>`,
  imports: [NgTemplateOutlet]
})
export class SectionTreeComponent {
  readonly tree = inject(SectionTreeService);
  constructor() { this.tree.register(inject(ChangeDetectorRef)); }
  rowClass(r: TreeRow): string {
    let cls = `section-item main-order-item ${r.locked ? 'ham-simple-disabled' : ''} ${r.active ? 'active' : ''} ${r.movable ? 'reorderable' : 'order-fixed'}`;
    if (this.tree.dragId === r.id) cls += ' dragging';
    if (this.tree.dropId === r.id) cls += ' drop-target';
    return cls;
  }
}
