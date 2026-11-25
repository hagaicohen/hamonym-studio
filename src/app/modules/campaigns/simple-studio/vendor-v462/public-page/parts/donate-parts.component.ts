import { ChangeDetectionStrategy, Component, Directive, ElementRef, Input, ViewEncapsulation, inject } from '@angular/core';
import { CardData } from '../cards/card-format';
import { DonateIcon, donateIcon, donateStyle } from './part-format';
import { PagePart } from './page-part';

/**
 * The donate button's content (old core `donateLabel`): the text, and the icon (an emoji or an
 * uploaded image) before or after it, separated by one space, as the markup had it.
 */
const LABEL = `@if (icon) {@if (after) {{{ label + ' ' }}}<span class="donate-emoji" [attr.style]="icon.style">@if (icon.image) {<img [attr.src]="icon.image" alt="" style="display:block;width:1em;height:1em;object-fit:contain">} @else {{{ icon.emoji }}}</span>@if (!after) {{{ ' ' + label }}}} @else {{{ after ? label + ' ' : ' ' + label }}}`;

@Directive()
abstract class DonateLabel extends PagePart {
  d!: CardData;
  style = '';
  label = '';
  after = false;
  icon: DonateIcon | null = null;
  constructor() { super(); this.label_(); }
  protected render(): void { this.label_(); }
  private label_(): void {
    const d = this.d = this.parts.campaign['content'].donate;
    this.style = donateStyle(d);
    this.label = String(d['text'] ?? '');
    this.after = d['emojiPosition'] === 'after';
    this.icon = this.resolve(donateIcon(d));
  }
  private resolve(icon: DonateIcon | null): DonateIcon | null { return icon && icon.image ? { ...icon, image: this.parts.safe(icon.image) } : icon; }
}

/** The donate button block (old core `renderPreview`, part `donate`); `[data-donate]` is handled by the preview. */
@Component({
  selector: 'section[ham-donate-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("donate", cls) + (duplicate ? " donate-duplicate" : "")', 'data-part': 'donate' },
  template: `<div class="donate"><button class="donate-button" [attr.style]="style" data-donate="true">${LABEL}</button></div>`
})
export class DonatePartComponent extends DonateLabel {
  @Input() cls = '';
  readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** v4.52 (old `syncDonationCtas`): right after the donation box, the button is a duplicate (`.donate-duplicate`). */
  duplicate = false;
  setDuplicate(on: boolean): void {
    if (this.duplicate === on) return;
    this.duplicate = on;
    this.update();
  }
  protected override render(): void { super.render(); this.duplicate = false; }
}

/**
 * The sticky donate button of a phone (old core `renderPreview`): shown while no other donate action
 * is in view (`syncDonationCtas` toggles `.hidden-cta`).
 */
@Component({
  selector: 'div[ham-sticky-cta]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': '"sticky-cta" + (hidden === true ? " hidden-cta" : "")', id: 'stickyCTA', '[attr.aria-hidden]': 'hidden === null ? null : hidden ? "true" : "false"' },
  template: `<button data-donate="true" [attr.style]="style" [attr.tabindex]="hidden === null ? null : hidden ? -1 : 0">${LABEL}</button>`
})
export class StickyCtaComponent extends DonateLabel {
  readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** v4.52 (old `syncDonationCtas`): hidden while another donate action is in view (and out of the tab order); null until the first sync after a render. */
  hidden: boolean | null = null;
  setHidden(on: boolean): void {
    if (this.hidden === on) return;
    this.hidden = on;
    this.update();
  }
  protected override render(): void { super.render(); this.hidden = null; }
}
