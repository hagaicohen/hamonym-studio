import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { AmbassadorService } from '../../../services/ambassador.service';

// Personal ambassador link picker (2026-10-01) -- shared across every flow
// that creates/edits an ambassador (self-registration modal, admin CRUD
// page, Ambassador Studio self-edit). One component, one debounce/
// availability-check implementation, instead of four separate copies.
// User-facing concept only: "הקישור האישי שלך" -- never the words slug/
// route/URL identifier in the UI itself (product requirement).
//
// Mirrors the EXISTING campaign-slug availability pattern (campaign-basic
// -step.component.ts#onSlugChange: 800ms debounce, normalize client-side,
// ask the server, never silently auto-resolve a conflict) rather than
// inventing a new one.
@Component({
  selector: 'app-ambassador-slug-field',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ambassador-slug-field.component.html',
  styleUrl: './ambassador-slug-field.component.css',
})
export class AmbassadorSlugFieldComponent implements OnChanges, OnDestroy {
  private ambassadorSvc = inject(AmbassadorService);
  private doc = inject(DOCUMENT);

  @Input({ required: true }) campaignSlug!: string;
  // Used ONLY to compute the initial suggested default when `value` arrives
  // empty -- never re-applied after the user has typed anything of their
  // own, so editing the name afterward never silently resets their choice.
  @Input() nameForDefault = '';
  @Input() value = '';
  // Set when editing an EXISTING ambassador, so the availability check
  // correctly ignores a conflict against the ambassador's own current row
  // (same (campaign_id, slug) scope as the DB constraint).
  @Input() excludeAmbassadorId?: string;

  @Output() valueChange = new EventEmitter<string>();
  // True only once a normalized, available slug is held -- parent forms use
  // this to gate submit, exactly like the existing campaign-slug field gates
  // the publish flow on `slugAvailable`.
  @Output() availabilityChange = new EventEmitter<boolean>();

  status: 'idle' | 'checking' | 'available' | 'taken' | 'too-short' | 'error' = 'idle';
  private userEditedOnce = false;
  private input$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor() {
    this.input$
      .pipe(
        debounceTime(600),
        distinctUntilChanged(),
        switchMap(candidate => {
          const normalized = this.normalize(candidate);
          if (normalized.length < 2) {
            this.status = 'too-short';
            this.availabilityChange.emit(false);
            // Still push the normalized (possibly empty) value up, same as
            // the campaign-slug field does while typing -- the PARENT form's
            // own submit gate is what actually blocks on availability, not
            // withholding the value here.
            this.value = normalized;
            this.valueChange.emit(normalized);
            return [];
          }
          this.value = normalized;
          this.valueChange.emit(normalized);
          this.status = 'checking';
          return this.ambassadorSvc.checkSlugAvailable(this.campaignSlug, normalized, this.excludeAmbassadorId);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(result => {
        this.status = result.failed ? 'error' : result.available ? 'available' : 'taken';
        this.availabilityChange.emit(result.available);
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Editing an EXISTING ambassador: a non-empty value arriving on the
    // very first change is already a saved, presumably-valid slug -- show
    // it as confirmed without an extra round trip. Any value the user types
    // afterward goes through the normal debounced check in onInput().
    if (changes['value']?.firstChange && this.value && this.status === 'idle') {
      this.status = 'available';
      this.availabilityChange.emit(true);
      return;
    }
    // Compute the initial suggested default exactly once, the moment a real
    // name first becomes available and the ambassador hasn't typed anything
    // yet -- never again afterward (userEditedOnce), so this never fights a
    // manager's own in-progress edit.
    if (!this.userEditedOnce && !this.value && this.nameForDefault?.trim()) {
      const suggested = this.normalize(this.nameForDefault);
      if (suggested) {
        this.value = suggested;
        this.valueChange.emit(suggested);
        this.input$.next(suggested);
      }
    }
  }

  onInput(raw: string): void {
    this.userEditedOnce = true;
    this.input$.next(raw);
  }

  get publicUrl(): string {
    const slugPart = this.value || '…';
    return `${this.doc.location.origin}/campaigns/${this.campaignSlug}/${slugPart}`;
  }

  // Same charset the existing campaign-slug mechanism already allows and
  // already routes correctly (Hebrew included) -- not a new convention, see
  // ambassadors.service.js#normalizeSlug on the backend (identical rule,
  // kept as two small copies rather than a cross-boundary shared module,
  // same existing pattern as the campaign-slug check).
  private normalize(raw: string): string {
    return (raw || '').trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9א-ת-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
