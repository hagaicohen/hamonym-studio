import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CampaignStudioStateService,
  RegistrationOption,
} from '../../../../campaigns/services/campaign-studio-state.service';
import { getPreset } from '../../presets/campaign-presets';

// Registration Options step — a race/event participant category or price
// tier (e.g. "10 ק"מ VIP", "תורם כבוד - מבוגר"). Deliberately separate from
// the Offerings step (gifts) and not a Page Builder block — Registration is
// an Action (like Donate), not content. No enable toggle: "is registration
// on for this campaign?" is simply registrationOptions.length > 0.
// See DECISIONS.md (2026-07-16).
@Component({
  selector: 'app-campaign-registration-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-registration-step.component.html',
  styleUrl: './campaign-registration-step.component.css',
})
export class CampaignRegistrationStepComponent {
  protected state = inject(CampaignStudioStateService);

  get draft() { return this.state.draft; }
  get stepCopy() { return getPreset(this.draft.layout.preset); }

  // ── Option form state ──
  editingOptionId: string | null = null;
  priceInput = '';
  option: RegistrationOption = this.empty();
  showAdvanced = false;

  get isEditing(): boolean { return this.editingOptionId !== null; }
  get isFormValid(): boolean { return !!this.option.title.trim() && this.option.price > 0; }

  // Saving here is a purely local, synchronous state.patch() — no network
  // round-trip. Without an artificial minimum spinner duration, clicking
  // "שמור" gives no feedback at all before the form silently resets, which
  // read as "the button doesn't do anything" (see DECISIONS.md, the
  // registration-step save investigation). The new card also lands in the
  // list BELOW the form/preview, out of view — briefly highlighting and
  // scrolling to it after save makes it obvious something was actually added.
  private readonly SAVE_SPINNER_MS = 450;
  private readonly HIGHLIGHT_MS = 1600;
  isSaving = false;
  lastSavedOptionId: string | null = null;

  save(): void {
    if (!this.isFormValid || this.isSaving) return;
    this.isSaving = true;
    setTimeout(() => {
      let savedId: string;
      if (this.isEditing) {
        savedId = this.editingOptionId!;
        const registrationOptions = this.draft.registrationOptions.map(o =>
          o.id === savedId ? { ...this.option, id: savedId } : o
        );
        this.state.patch({ registrationOptions });
      } else {
        savedId = Date.now().toString();
        const registrationOptions = [...this.draft.registrationOptions, { ...this.option, id: savedId }];
        this.state.patch({ registrationOptions });
      }
      this.reset();
      this.isSaving = false;
      this.lastSavedOptionId = savedId;
      setTimeout(() => {
        document.getElementById('rgo-card-' + savedId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      setTimeout(() => {
        if (this.lastSavedOptionId === savedId) this.lastSavedOptionId = null;
      }, this.HIGHLIGHT_MS);
    }, this.SAVE_SPINNER_MS);
  }

  clearForm(): void { this.reset(); }

  editOption(o: RegistrationOption): void {
    this.editingOptionId = o.id;
    this.option = { ...o };
    this.priceInput = o.price ? o.price.toLocaleString('he-IL') : '';
    setTimeout(() => document.querySelector('.rgo-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  deleteOption(id: string): void {
    if (id === this.editingOptionId) this.reset();
    this.state.patch({ registrationOptions: this.draft.registrationOptions.filter(o => o.id !== id) });
  }

  duplicateOption(o: RegistrationOption): void {
    const copy = { ...o, id: Date.now().toString() };
    const idx = this.draft.registrationOptions.findIndex(x => x.id === o.id);
    const registrationOptions = [...this.draft.registrationOptions];
    registrationOptions.splice(idx + 1, 0, copy);
    this.state.patch({ registrationOptions });
    this.editOption(copy);
  }

  onPriceInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    const n = Number(raw || 0);
    this.option.price = n;
    this.priceInput = n ? n.toLocaleString('he-IL') : '';
  }

  // title/description/key deliberately use the same manual [value]+(input)
  // pattern as price above, instead of [(ngModel)] — ngModel on these fields
  // was leaving the DOM showing stale text after save() reset the form (the
  // underlying option.title correctly went back to '', but the <input>
  // element itself kept displaying the just-saved value, making it look
  // like Save silently did nothing / the form was stuck). Manual binding
  // sidesteps whatever ngModel timing quirk caused that.
  onTitleInput(event: Event): void {
    this.option.title = (event.target as HTMLInputElement).value;
  }

  onDescriptionInput(event: Event): void {
    this.option.description = (event.target as HTMLTextAreaElement).value;
  }

  onKeyInput(event: Event): void {
    this.option.key = (event.target as HTMLInputElement).value;
  }

  private empty(): RegistrationOption {
    return { id: '', key: '', title: '', description: '', price: 0 };
  }

  private reset(): void {
    this.editingOptionId = null;
    this.priceInput = '';
    const empty = this.empty();
    this.option.id = empty.id;
    this.option.key = empty.key;
    this.option.title = empty.title;
    this.option.description = empty.description;
    this.option.price = empty.price;
  }
}
