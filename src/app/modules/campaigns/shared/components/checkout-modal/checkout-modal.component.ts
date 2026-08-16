import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CampaignDraft, Offering, RegistrationOption,
  DonorFieldsConfig, DEFAULT_DONOR_FIELDS,
} from '../../../services/campaign-studio-state.service';
import { DonationService } from '../../../services/donation.service';
import { AnalyticsService } from '../../../../../core/services/analytics.service';

// One entry in the Registration participant repeater. Deliberately just
// these 3 fields (name/option/shirtSize) — no Schema/Rules engine, each
// participant picks exactly one Registration Option. See DECISIONS.md
// (2026-07-15, 2.4 Multi-Participant Registration; 2026-07-16, Registration
// Options data-model split).
export interface ParticipantForm {
  name: string;
  optionId: string;
  shirtSize: string;
}

// A registration the visitor filled in and closed without paying yet —
// remembered by the parent (campaign-preview) across modal open/close
// cycles, since a closed modal instance is destroyed and would otherwise
// lose it. Re-opening checkout in donation mode later shows this as an
// already-locked-in line and folds it into that one payment. See
// DECISIONS.md (2026-07-17: register-then-donate-later flow).
export interface PendingRegistration {
  participants: ParticipantForm[];
  total: number;
}

@Component({
  selector: 'app-checkout-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checkout-modal.component.html',
  styleUrls: ['./checkout-modal.component.css'],
})
export class CheckoutModalComponent implements OnInit {
  @Input() draft!: CampaignDraft;
  @Input() amount = 0;
  @Input() cartOfferings: Offering[] = [];
  @Input() checkoutMode: 'donation' | 'registration' = 'donation';
  // Set by campaign-preview when the visitor picked the "חודשית" tab —
  // forwarded to POST /api/donations as-is, no logic here.
  @Input() recurring = false;
  @Input() initialOptionId: string | null = null;
  @Input() entityLogoUrl: string | null = null;
  @Input() entityName = '';
  // Donation mode only — a registration from an earlier, separately-closed
  // checkout that should combine into this same payment.
  @Input() pendingRegistration: PendingRegistration | null = null;

  @Output() closed = new EventEmitter<void>();
  // Fired when a registration checkout is closed (not submitted) with at
  // least one valid participant — the parent remembers it so a later
  // donation checkout can pick it back up.
  @Output() participantsSaved = new EventEmitter<PendingRegistration>();
  // Fired by "נקה טופס" — the parent drops whatever it was remembering too,
  // otherwise a cleared-then-closed form would leave a stale registration
  // behind that the visitor never actually asked to keep.
  @Output() cleared = new EventEmitter<void>();

  private donationService = inject(DonationService);
  private analytics       = inject(AnalyticsService);

  readonly SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  name        = '';
  email       = '';
  phone       = '';
  address     = '';
  postalCode  = '';
  idNumber    = '';
  submitted   = false;
  loading     = false;
  errorMsg    = '';

  participants: ParticipantForm[] = [];

  get donorFields(): DonorFieldsConfig {
    return { ...DEFAULT_DONOR_FIELDS, ...(this.draft?.donorFields ?? {}) };
  }

  get registrationOptions(): RegistrationOption[] {
    return this.draft?.registrationOptions ?? [];
  }

  // Falls back to a generic label/icon if the entity manager hasn't set one
  // — see CampaignDraft.registrationFieldLabel (DECISIONS.md, 2026-07-16).
  get registrationFieldLabel(): string {
    const icon = this.draft?.registrationFieldIcon || '👤';
    const label = this.draft?.registrationFieldLabel || 'קטגוריה';
    return `${icon} ${label}`;
  }

  optionFor(id: string): RegistrationOption | undefined {
    return this.registrationOptions.find(o => o.id === id);
  }

  get registrationTotal(): number {
    return this.participants.reduce((sum, p) => sum + (this.optionFor(p.optionId)?.price || 0), 0);
  }

  get effectiveAmount(): number {
    if (this.checkoutMode === 'registration') return this.registrationTotal;
    return this.amount + (this.pendingRegistration?.total ?? 0);
  }

  get hasAnyValidParticipant(): boolean {
    return this.participants.some(p => p.name.trim().length > 1 && !!p.optionId);
  }

  get formattedAmount(): string {
    return '₪' + this.effectiveAmount.toLocaleString('he-IL');
  }

  get isRegistrationCheckout(): boolean {
    return this.checkoutMode === 'registration';
  }

  get formTitle(): string {
    return this.isRegistrationCheckout ? 'פרטי הרשמה' : 'פרטי תורם';
  }

  get formSubtitle(): string {
    return this.isRegistrationCheckout ? 'הוסיפו את המשתתפים ופרטי התשלום' : 'הזינו את פרטיכם להמשך ביצוע התרומה';
  }

  addParticipant(): void {
    const initial = this.registrationOptions.find(o => o.id === this.initialOptionId);
    this.participants.push({ name: '', optionId: initial?.id ?? this.registrationOptions[0]?.id ?? '', shirtSize: '' });
    // The list scrolls independently (.participants-list) so the modal itself
    // doesn't grow with every participant — without this, a newly-added card
    // past the visible area is easy to miss entirely.
    setTimeout(() => {
      const rows = document.querySelectorAll('.participant-row');
      // 'nearest' (not 'end') — scrolls only as far as needed to reveal the
      // new card, instead of always snapping its bottom to the list's bottom
      // edge, which used to shove the previous card's own fields out of view.
      rows[rows.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  removeParticipant(index: number): void {
    this.participants.splice(index, 1);
  }

  get participantsValid(): boolean {
    if (!this.isRegistrationCheckout) return true;
    return this.participants.length > 0
      && this.participants.every(p => p.name.trim().length > 1 && !!p.optionId);
  }

  get isValid(): boolean {
    const df = this.donorFields;
    return this.participantsValid
      && this.name.trim().length > 1
      && this.isValidEmail
      && this.phone.trim().length >= 9
      && (!df.showAddress    || this.address.trim().length > 2)
      && (!df.showPostalCode || this.postalCode.trim().length >= 4)
      && (!df.showIdNumber   || this.isValidId);
  }

  get idDigits(): string {
    return this.idNumber.replace(/\D/g, '');
  }

  get isValidId(): boolean {
    const raw = this.idDigits;
    // Israeli IDs are 5–9 digits; shorter = not a real ID
    if (raw.length < 5 || raw.length > 9) return false;
    const digits = raw.padStart(9, '0');
    let total = 0;
    for (let i = 0; i < 9; i++) {
      let n = parseInt(digits[i]) * ((i % 2) + 1);
      if (n > 9) n -= 9;
      total += n;
    }
    return total % 10 === 0;
  }

  get idLiveState(): 'idle' | 'valid' | 'invalid' {
    if (this.idDigits.length === 0) return 'idle';
    if (this.idDigits.length < 5)  return 'idle';   // still typing
    return this.isValidId ? 'valid' : 'invalid';
  }

  get isValidEmail(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
    if (this.checkoutMode === 'registration') {
      // Reopening after an earlier close-without-paying restores exactly
      // what was filled in, instead of starting over from one blank row —
      // see close()/participantsSaved and DECISIONS.md (2026-07-17).
      if (this.pendingRegistration?.participants.length) {
        this.participants = this.pendingRegistration.participants.map(p => ({ ...p }));
        return;
      }
      // Starts empty — a participant is only ever added by an explicit
      // "+ הוסף משתתף" click (addParticipant), never auto-seeded on open.
      // See DECISIONS.md (2026-07-17).
      this.participants = [];
    }
  }

  // "נקה טופס" — start the registration over from scratch (no participants),
  // and tell the parent to forget whatever it remembered too (see `cleared`).
  clearForm(): void {
    this.participants = [];
    this.pendingRegistration = null;
    this.cleared.emit();
  }

  close(): void {
    document.body.style.overflow = '';
    if (this.isRegistrationCheckout && this.hasAnyValidParticipant) {
      this.participantsSaved.emit({
        participants: this.participants.filter(p => p.name.trim().length > 1 && !!p.optionId),
        total: this.registrationTotal,
      });
    }
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('checkout-overlay')) {
      this.close();
    }
  }

  removePendingRegistration(): void {
    this.pendingRegistration = null;
  }

  private captureUtmParams(): Record<string, string> | undefined {
    const search = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
    const params: Record<string, string> = {};
    for (const key of keys) {
      const value = search.get(key);
      if (value) params[key.replace('utm_', '')] = value;
    }
    return Object.keys(params).length > 0 ? params : undefined;
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.isValid || this.loading) return;

    if (!this.draft?.id) {
      this.errorMsg = 'לא ניתן לעבד תשלום — הקמפיין אינו פעיל';
      return;
    }

    this.loading  = true;
    this.errorMsg = '';

    // One reward line per participant when registering (even if two
    // participants picked the same option) so Cardcom line items and the
    // total match; the plain cart-offerings snapshot otherwise. A pending
    // registration carried over from an earlier, separately-closed checkout
    // adds its own participant lines on top of the donation's own cart.
    const rewards = this.isRegistrationCheckout
      ? this.participants.map(p => {
          const o = this.optionFor(p.optionId);
          return { title: o?.title ?? '', minimumAmount: o?.price ?? 0 };
        })
      : [
          ...this.cartOfferings.map(o => ({
            id:            o.id,
            title:         o.title,
            minimumAmount: o.minimumAmount ?? 0,
          })),
          ...(this.pendingRegistration?.participants.map(p => {
            const o = this.optionFor(p.optionId);
            return { title: o?.title ?? '', minimumAmount: o?.price ?? 0 };
          }) ?? []),
        ];

    // participants — "who's registered," backend re-derives the option
    // title/price from the DB (registration_options), not trusted from here.
    // See DECISIONS.md (2026-07-16).
    const participantSource = this.isRegistrationCheckout
      ? this.participants
      : this.pendingRegistration?.participants;
    const participants = participantSource
      ? participantSource.map(p => ({
          name: p.name.trim(),
          registrationOptionId: p.optionId || undefined,
          shirtSize: p.shirtSize || undefined,
        }))
      : undefined;

    const df = this.donorFields;
    this.donationService.create({
      campaignId: this.draft.id,
      donor: {
        name:       this.name.trim(),
        email:      this.email.trim(),
        phone:      this.phone.trim(),
        idNumber:   df.showIdNumber   ? this.idNumber.replace(/\D/g, '')  : '',
        address:    df.showAddress    ? this.address.trim()                : '',
        postalCode: df.showPostalCode ? this.postalCode.trim()             : '',
      },
      amount: this.effectiveAmount,
      rewards,
      participants,
      utmParams: this.captureUtmParams(),
      recurring: this.recurring || undefined,
    }).subscribe({
      next: (res) => {
        document.body.style.overflow = '';
        this.analytics.trackEventThenNavigate('donation_started', {
          value:         this.effectiveAmount,
          currency:      'ILS',
          campaign_name: this.draft.title,
          campaign_id:   this.draft.id,
        }, res.url);
      },
      error: (err) => {
        this.loading  = false;
        this.errorMsg = err?.error?.error || 'שגיאה בעיבוד הבקשה, נסו שנית';
      },
    });
  }
}
