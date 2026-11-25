import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, computed, inject, signal, viewChild } from '@angular/core';
import { WizardService } from './wizard.service';

/** Optional subtopic of the chosen main category (searchable popover list). */
@Component({
  selector: 'ham-wizard-subcategory',
  standalone: true,
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown)': 'onKeydown($event)' },
  styles: [':host{display:contents}'],
  template: `
<div class="hw-field"><span class="hw-label" id="hwSubcategoryLabel">נושא משנה <em>לא חובה</em></span><div #picker class="hw-sub-picker" id="hwSubcategoryPicker">
  <button #trigger type="button" id="hwSubcategoryButton" class="hw-sub-trigger" [class.has-choice]="!!selected()" aria-labelledby="hwSubcategoryLabel hwSubSelected" aria-haspopup="listbox" aria-controls="hwSubcategoryPanel" [attr.aria-expanded]="open()" (click)="setOpen(!open())"><span class="hw-sub-trigger-main"><span class="hw-sub-trigger-icon">☷</span><span id="hwSubSelected">{{ selected() || 'בחרו נושא משנה' }}</span></span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
  <div id="hwSubcategoryPanel" class="hw-sub-popover" [hidden]="!open()"><label class="hw-sub-searchbox"><span aria-hidden="true">⌕</span><input #search type="search" id="hwSubSearch" autocomplete="off" aria-label="חיפוש נושא משנה" placeholder="חיפוש נושא משנה..." (input)="term.set(search.value)"></label>
    <div id="hwSubcategoryChoices" class="hw-sub-list" role="listbox" aria-label="נושאי משנה">
      @for (x of options(); track x) {
        <button type="button" role="option" class="hw-sub-option" [class.is-selected]="x === selected()" [attr.aria-selected]="x === selected()" (click)="choose(x)"><span>{{ x || 'ללא נושא משנה' }}</span>@if (x === selected()) {<b>✓</b>}</button>
      } @empty { <p class="hw-sub-empty">לא נמצאו נושאים מתאימים</p> }
    </div></div></div><small>אם יש נושא משנה, הוא יוצג לבדו במובייל כדי לחסוך מקום.</small></div>`
})
export class WizardSubcategoryComponent implements OnChanges {
  private readonly wizard = inject(WizardService);
  /** Changes whenever the main category may have changed. */
  @Input() version = 0;
  @Output() changed = new EventEmitter<void>();
  readonly open = signal(false);
  readonly term = signal('');
  private readonly values = signal<string[]>([]);
  readonly selected = signal('');
  private readonly picker = viewChild.required<ElementRef<HTMLElement>>('picker');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  readonly options = computed(() => {
    const term = this.term().trim().toLocaleLowerCase('he-IL');
    return ['', ...this.values()].filter(x => !term || (x || 'ללא נושא משנה').toLocaleLowerCase('he-IL').includes(term));
  });

  ngOnChanges(): void { this.sync(); }

  private sync(): void {
    this.values.set(this.wizard.subcategories());
    this.selected.set(this.wizard.state().content.campaignInfo.subcategory || '');
  }

  setOpen(open: boolean): void {
    this.open.set(open);
    if (open) { this.search().nativeElement.value = ''; this.term.set(''); queueMicrotask(() => this.search().nativeElement.focus()); }
  }

  choose(value: string): void {
    this.wizard.writeField('hwSubcategory', value);
    this.setOpen(false);
    this.sync();
    this.trigger().nativeElement.focus();
    this.changed.emit();
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.picker().nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) { this.setOpen(false); this.trigger().nativeElement.focus(); event.preventDefault(); }
    if (event.target === this.trigger().nativeElement && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { this.setOpen(true); event.preventDefault(); }
  }
}
