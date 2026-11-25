import { Component, EventEmitter, Input, Output, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { STUDIO_SLUG, StudioSlugCheck } from '../../studio-slug';

/** Campaign URL slug. Spaces become dashes when the field loses focus. */
@Component({selector:'ham-wizard-slug',standalone:true,templateUrl:'./wizard-slug.component.html',styleUrls:['./wizard-slug.component.css','./wizard-validation.css']})
export class WizardSlugComponent implements OnChanges, OnDestroy {
 readonly integration = inject(STUDIO_SLUG, { optional: true });
 readonly result = signal<StudioSlugCheck | undefined>(undefined);
 readonly checking = signal(false);
 private timer?: ReturnType<typeof setTimeout>;
 private revision = 0;
 @Input() slug = '';
 @Input() simple = false;
 @Output() slugChange = new EventEmitter<string>();
 ngOnChanges(): void { this.schedule(this.slug); }
 ngOnDestroy(): void { clearTimeout(this.timer); this.revision++; }
 edit(value: string): void { this.slugChange.emit(value); this.schedule(value); }
 private schedule(value: string): void {
   clearTimeout(this.timer);
   const revision = ++this.revision;
   this.result.set(undefined);
   if (!this.integration) return;
   this.checking.set(true);
   this.timer = setTimeout(async () => {
     try {
       const result = await this.integration!.check(value);
       if (revision === this.revision) this.result.set(result);
     } catch {
       if (revision === this.revision) this.result.set({ available: false, message: 'לא ניתן לבדוק את הכתובת כרגע. יש לנסות שוב לפני השמירה.' });
     } finally { if (revision === this.revision) this.checking.set(false); }
   }, 350);
 }
 onChange(input: HTMLInputElement): void {
   input.value = String(input.value || '').trim().replace(/\s+/g, '-');
   this.edit(input.value);
 }
}
