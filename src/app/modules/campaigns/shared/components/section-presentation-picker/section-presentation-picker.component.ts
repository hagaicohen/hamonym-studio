import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionPresentation } from '../../../builder/styles/campaign-styles';

// Section Presentation (2026-10-03) -- one small, reusable visual picker for
// all four list-type sections (Rewards/Donors/Ambassadors/Updates), instead
// of each Builder step growing its own bespoke control for the same concept.
// Mirrors the Opening Composition picker's own shape (campaign-page-builder
// -step.component.html's "מבנה הפתיחה" section): small cards with a visual
// thumbnail + label, an active state, a "recommended for this Style" badge,
// and a reset-to-Style-default action -- same product pattern (Style
// recommends, user may override), same interaction language, so a manager
// who already learned one picker instantly understands the other.
@Component({
  selector: 'app-section-presentation-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './section-presentation-picker.component.html',
  styleUrl: './section-presentation-picker.component.css',
})
export class SectionPresentationPickerComponent {
  @Input() label = 'תצוגת הרשימה';
  @Input() hint = '';
  // The options this section supports -- 'cards'/'list' for Donors/
  // Ambassadors/Updates, plus 'image' for Rewards only (see the product
  // decision in campaign-styles.ts: 'image' is never a Style recommendation,
  // explicit-choice-only, which is why it's just another option here rather
  // than special-cased).
  @Input() options: { value: SectionPresentation; label: string }[] = [
    { value: 'cards', label: 'כרטיסים' },
    { value: 'list', label: 'רשימה' },
  ];
  // The campaign's own EXPLICIT choice for this section, or undefined if it
  // has never been set (i.e. "follow the Campaign Style's recommendation").
  // Never the resolved/effective value -- the parent passes that separately
  // via `recommended` purely to label a card, never to decide which is active.
  @Input() value: SectionPresentation | undefined;
  // What's currently recommended for this section's placement (Sidebar
  // always recommends 'list'; Main defers to the Campaign Style, or 'cards'
  // with no Style -- see resolveSectionPresentation) -- used only to show
  // the "מומלץ" badge and, when `value` is undefined, to highlight which
  // card is actually in effect right now.
  @Input() recommended: SectionPresentation = 'cards';

  @Output() valueChange = new EventEmitter<SectionPresentation>();
  @Output() reset = new EventEmitter<void>();

  isActive(option: SectionPresentation): boolean {
    return (this.value ?? this.recommended) === option;
  }

  select(option: SectionPresentation): void {
    this.valueChange.emit(option);
  }

  onReset(): void {
    this.reset.emit();
  }
}
