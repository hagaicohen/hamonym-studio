import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { CategorySelectorComponent } from '../../../../../shared/ui/category-picker/category-selector.component';
import { WizardService } from './wizard.service';


/** Main category search and selection (up to 18 results; subtopics shown while searching). */
@Component({selector:'ham-wizard-category-search',standalone:true,imports:[CategorySelectorComponent],templateUrl:'./wizard-category-search.component.html',styleUrl:'./wizard-category-search.component.css'})
export class WizardCategorySearchComponent {
  private readonly wizard = inject(WizardService);

  @Output() changed = new EventEmitter<void>();
  private readonly version = signal(0);
  readonly categories = computed(() => { this.version(); return this.wizard.categoryCatalog(); });
  readonly selectedIds = computed(() => { this.version(); const selected = this.wizard.chosenCategory(); return selected ? [selected.id] : []; });
  readonly subcategory = computed(() => { this.version(); return this.wizard.state().content.campaignInfo.subcategory || ''; });

  choose(id: string, sub?: string): void {
    this.wizard.chooseCategory(id, sub);
    this.refresh();
    this.changed.emit();
  }

  refresh(): void { this.version.update(v => v + 1); }
}
