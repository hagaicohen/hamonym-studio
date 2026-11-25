import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WizardService } from './wizard.service';
import { Category } from './wizard.types';

interface CategoryResult { category: Category; chosen: boolean; icon: SafeHtml; subs: Array<{ value: string; chosen: boolean }>; }

/** Main category search and selection (up to 18 results; subtopics shown while searching). */
@Component({selector:'ham-wizard-category-search',standalone:true,templateUrl:'./wizard-category-search.component.html',styleUrl:'./wizard-category-search.component.css'})
export class WizardCategorySearchComponent {
  private readonly wizard = inject(WizardService);
  private readonly sanitizer = inject(DomSanitizer);
  @Output() changed = new EventEmitter<void>();
  readonly term = signal('');
  private readonly version = signal(0);

  readonly results = computed<CategoryResult[]>(() => {
    this.version();
    const term = this.term().trim().toLocaleLowerCase('he-IL');
    const selected = this.wizard.chosenCategory();
    const sub = this.wizard.state().content.campaignInfo.subcategory;
    return this.wizard.categoryCatalog()
      .filter(x => !term || [x.label, ...x.sub].some(y => y.toLocaleLowerCase('he-IL').includes(term)))
      .slice(0, 18)
      .map(x => {
        const chosen = selected?.id === x.id;
        return {
          category: x, chosen,
          // Icon markup is a static local SVG from the category catalog.
          icon: this.sanitizer.bypassSecurityTrustHtml(this.wizard.categoryIcon(x.icon)),
          subs: term ? x.sub.filter(s => s.toLocaleLowerCase('he-IL').includes(term)).map(value => ({ value, chosen: chosen && sub === value })) : []
        };
      });
  });

  readonly status = computed(() => {
    this.version();
    const selected = this.wizard.chosenCategory();
    const sub = this.wizard.state().content.campaignInfo.subcategory;
    return selected ? '✓ נבחר: ' + (sub ? sub + ' · ' : '') + selected.label : 'לא נבחר תחום ראשי';
  });

  choose(id: string, sub?: string): void {
    this.wizard.chooseCategory(id, sub);
    this.refresh();
    this.changed.emit();
  }

  refresh(): void { this.version.update(v => v + 1); }
}
