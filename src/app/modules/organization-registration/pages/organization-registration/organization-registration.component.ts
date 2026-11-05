import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, Save, Trash2, Plus, Pencil } from 'lucide-angular';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../../../../shared/ui/design-system/icons';
import { CommonModule } from '@angular/common';

import { StepEntityComponent } from '../../components/step-entity/step-entity.component';
import { StepProfileComponent } from '../../components/step-profile/step-profile.component';
import { StepGoalsComponent } from '../../components/step-goals/step-goals.component';
import { StepPaymentComponent } from '../../components/step-payment/step-payment.component';
import { StepReviewComponent } from '../../components/step-review/step-review.component';
import { StepBillingMethodComponent } from '../../components/step-billing-method/step-billing-method.component';
import {
  OrganizationRegistrationState,
  OrganizationRegistrationStateService,
  buildPayload,
  resumeStep,
} from '../../services/organization-registration-state.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { ActivatedRoute } from '@angular/router';

// The part of the wizard state a draft save would persist, plus pending files.
function snapshot(state: OrganizationRegistrationState): string {
  return JSON.stringify([buildPayload(state), !!state.certificateFile, !!state.section46File, !!state.logoFile]);
}

const DRAFT_DELETE_ERRORS: Record<string, string> = {
  NOT_DRAFT_CREATOR: 'רק מי שיצר את הטיוטה יכול למחוק אותה.',
  NOT_A_DRAFT: 'הארגון כבר נשלח לבדיקה ולא ניתן למחוק אותו כטיוטה.',
  DRAFT_HAS_CAMPAIGNS: 'לטיוטה זו יש קמפיינים ולכן לא ניתן למחוק אותה.',
  DRAFT_NOT_FOUND: 'הטיוטה לא נמצאה. ייתכן שכבר נמחקה.',
};

@Component({
  selector: 'app-organization-registration',
  standalone: true,
  providers: [OrganizationRegistrationStateService],
  imports: [
    CommonModule,
    StepEntityComponent,
    StepProfileComponent,
    StepGoalsComponent,
    StepPaymentComponent,
    StepReviewComponent,
    StepBillingMethodComponent,
    LucideAngularModule,
  ],
  templateUrl: './organization-registration.component.html',
  styleUrls: ['./organization-registration.component.css'],
})
export class OrganizationRegistrationComponent implements OnInit {
  readonly Save = Save;
  readonly Trash2 = Trash2;
  readonly Plus = Plus;
  readonly Pencil = Pencil;
  readonly iconSize = HM_ICON_SIZE.sm;
  readonly iconStroke = HM_ICON_STROKE;

  protected stateService = inject(OrganizationRegistrationStateService);
  private entitiesService = inject(EntitiesService);
  private route = inject(ActivatedRoute);

  currentStep = 1;

  // This user's saved registration drafts, newest first. Nothing is loaded
  // silently: the wizard starts as a new registration until one is resumed.
  drafts = signal<any[]>([]);
  draftToDelete = signal<any | null>(null);
  deletingDraft = signal(false);
  draftDeleteError = signal('');
  loadingDraftId = signal<string | null>(null);
  // A resume/new request held back because the open registration has unsaved edits.
  pendingSwitch = signal<{ kind: 'resume'; id: string } | { kind: 'new' } | null>(null);

  @ViewChild('deleteDialog') deleteDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('switchDialog') switchDialog?: ElementRef<HTMLDialogElement>;

  savingDraft = signal(false);
  draftSaved = signal(false);
  draftSaveError = signal('');

  // What the open registration looked like when it was last loaded or saved.
  private savedSnapshot = signal('');
  readonly isDirty = computed(() => snapshot(this.stateService.state()) !== this.savedSnapshot());
  readonly currentId = computed(() => this.stateService.state().entityId);

  ngOnInit(): void {
    this.markClean();
    // Explicit creation never resumes another organization. State is scoped to
    // this wizard instance, including all existing child steps.
    if (this.route.snapshot.queryParamMap.get('mode') === 'new') return;
    if (this.stateService.state().entityId) return;

    // "השלם רישום" links here with ?draft=<id>: open exactly that draft.
    const requested = this.route.snapshot.queryParamMap.get('draft');

    this.entitiesService.getMyEntities().subscribe({
      next: (res) => {
        const drafts = (res.entities || []).filter((e: any) => e.status === 'draft');
        drafts.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        this.drafts.set(drafts);
        if (!requested) return;
        if (drafts.some((d: any) => d.id === requested)) this.switchTo({ kind: 'resume', id: requested });
        else this.draftSaveError.set('הטיוטה המבוקשת לא נמצאה, או שהרישום שלה כבר נשלח.');
      },
    });
  }

  get busy(): boolean {
    return this.savingDraft() || this.stateService.saving() || this.deletingDraft() || !!this.loadingDraftId();
  }

  resumeDraft(id: string): void {
    if (this.busy || id === this.currentId()) return;
    if (this.isDirty()) return this.askSwitch({ kind: 'resume', id });
    this.switchTo({ kind: 'resume', id });
  }

  startNewRegistration(): void {
    if (!this.canStartNew) return;
    if (this.isDirty()) return this.askSwitch({ kind: 'new' });
    this.switchTo({ kind: 'new' });
  }

  // Unguarded: callers have already dealt with busy state and unsaved edits.
  private switchTo(target: { kind: 'resume'; id: string } | { kind: 'new' }): void {
    if (target.kind === 'new') {
      this.stateService.resetState();
      this.afterSwitch();
      return;
    }
    // Load the draft fresh by id; the open registration stays untouched (and
    // the form inert) until it arrives, so a failed load changes nothing.
    this.loadingDraftId.set(target.id);
    this.draftSaveError.set('');
    this.entitiesService.getEntityById(target.id).subscribe({
      next: (entity) => {
        this.loadingDraftId.set(null);
        // Reset first so nothing from the previous registration leaks into the next.
        this.stateService.resetState();
        this.stateService.loadFromEntity(entity);
        this.drafts.update((list) => list.map((d) => (d.id === entity.id ? { ...d, ...entity } : d)));
        this.afterSwitch(resumeStep(entity.onboarding_step));
      },
      error: () => {
        this.loadingDraftId.set(null);
        this.draftSaveError.set('טעינת הטיוטה נכשלה. נסו שוב.');
      },
    });
  }

  loadingName(): string {
    const draft = this.drafts().find((d) => d.id === this.loadingDraftId());
    return draft ? this.draftName(draft) : '';
  }

  private afterSwitch(step = 1): void {
    this.currentStep = step;
    this.draftSaveError.set('');
    this.draftSaved.set(false);
    this.markClean();
  }

  private askSwitch(target: { kind: 'resume'; id: string } | { kind: 'new' }): void {
    this.pendingSwitch.set(target);
    this.switchDialog?.nativeElement.showModal();
  }

  cancelSwitch(): void {
    if (this.busy) return;
    this.closeSwitchDialog();
  }

  private closeSwitchDialog(): void {
    this.switchDialog?.nativeElement.close();
    this.pendingSwitch.set(null);
  }

  discardAndSwitch(): void {
    const target = this.pendingSwitch();
    if (!target || this.busy) return;
    this.closeSwitchDialog();
    this.switchTo(target);
  }

  saveAndSwitch(): void {
    const target = this.pendingSwitch();
    if (!target || this.busy) return;
    // Runs inside the save callback, before the service clears its saving flag.
    this.saveDraft(() => {
      this.closeSwitchDialog();
      this.switchTo(target);
    });
  }

  draftName(draft: any): string {
    return draft.legal_name || draft.display_name || 'ללא שם';
  }

  // A new, never-saved registration joins the list (id null, "בעריכה") once it
  // has a name and a registration number. A draft saved elsewhere in the wizard
  // (e.g. the billing step) that the loaded list doesn't have yet gets its row too.
  get rows(): any[] {
    const id = this.currentId();
    if (!id) return this.showNewRow ? [{ id: null, legal_name: '', updated_at: null }, ...this.drafts()] : this.drafts();
    if (this.drafts().some((d) => d.id === id)) return this.drafts();
    return [{ id, legal_name: '', updated_at: null }, ...this.drafts()];
  }

  get showNewRow(): boolean {
    const s = this.stateService.state();
    return !s.entityId && !!s.organizationName.trim() && !!s.organizationNumber.trim();
  }

  isNewRow(row: any): boolean {
    return !row.id;
  }

  // Only a saved draft can be loading; the unsaved new row has id null too.
  isLoadingRow(row: any): boolean {
    return !!row.id && row.id === this.loadingDraftId();
  }

  isCurrent(row: any): boolean {
    return row.id === this.currentId();
  }

  get canStartNew(): boolean {
    return !this.busy && (!!this.currentId() || this.isDirty());
  }

  get switchingFromNew(): boolean {
    return !this.currentId();
  }

  get currentName(): string {
    return this.stateService.state().organizationName.trim() || 'הרשמה חדשה';
  }

  // Save is only ever offered on the open registration's row, so it can only
  // write to state().entityId (or create it once, for a new registration).
  canSaveRow(row: any): boolean {
    return this.isCurrent(row) && this.isDirty() && this.stateService.canSaveDraft && !this.busy;
  }

  saveTitle(row: any): string {
    if (!this.isCurrent(row)) return 'ניתן לשמור רק את הטיוטה שבעריכה';
    if (this.savingDraft()) return 'שומר...';
    if (!this.stateService.canSaveDraft) return 'יש למלא סוג ישות, שם ומספר רישום לפני שמירת טיוטה';
    return this.isDirty() ? 'שמור שינויים' : 'אין שינויים לשמירה';
  }

  private markClean(state: OrganizationRegistrationState = this.stateService.state()): void {
    this.savedSnapshot.set(snapshot(state));
  }

  draftDate(draft: any): string {
    if (!draft.updated_at) return '';
    const date = new Date(draft.updated_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  askDeleteDraft(draft: any): void {
    if (this.busy) return;
    this.draftDeleteError.set('');
    this.draftToDelete.set(draft);
    this.deleteDialog?.nativeElement.showModal();
  }

  cancelDeleteDraft(): void {
    if (this.deletingDraft()) return;
    this.deleteDialog?.nativeElement.close();
    this.draftToDelete.set(null);
  }

  confirmDeleteDraft(): void {
    const draft = this.draftToDelete();
    if (!draft || this.deletingDraft()) return;
    // Never saved: there is nothing on the server, just discard it locally.
    if (!draft.id) {
      this.cancelDeleteDraft();
      this.stateService.resetState();
      this.afterSwitch();
      return;
    }
    this.deletingDraft.set(true);
    this.draftDeleteError.set('');
    this.entitiesService.deleteRegistrationDraft(draft.id).subscribe({
      next: () => {
        this.deletingDraft.set(false);
        this.drafts.update((list) => list.filter((d) => d.id !== draft.id));
        this.cancelDeleteDraft();
        // The open registration was the deleted draft: never save into it again.
        if (draft.id === this.currentId()) {
          this.stateService.resetState();
          this.afterSwitch();
        }
      },
      error: (err) => {
        this.deletingDraft.set(false);
        this.draftDeleteError.set(DRAFT_DELETE_ERRORS[err?.error?.code] || 'מחיקת הטיוטה נכשלה. נסו שוב.');
      },
    });
  }

  saveDraft(onSaved?: () => void): void {
    if (this.busy || !this.stateService.canSaveDraft) return;
    this.savingDraft.set(true);
    this.draftSaveError.set('');
    const sent = this.stateService.state();

    this.stateService.save({ includeBilling: false, onboardingStep: this.currentStep }).subscribe({
      next: (entity) => {
        this.savingDraft.set(false);
        // Uploads clear the pending File fields after a save; edits typed
        // during the request still count as unsaved.
        const now = this.stateService.state();
        this.markClean(JSON.stringify(buildPayload(now)) === JSON.stringify(buildPayload(sent)) ? now : sent);
        this.upsertDraft(entity, now.entityId);
        this.draftSaved.set(true);
        setTimeout(() => this.draftSaved.set(false), 3000);
        onSaved?.();
      },
      error: (err) => {
        this.savingDraft.set(false);
        this.draftSaveError.set(err?.error?.error || 'שמירת הטיוטה נכשלה. נסו שוב.');
      },
    });
  }

  private upsertDraft(entity: any, id: string | null): void {
    if (!id) return;
    const row = { ...entity, id, status: 'draft', updated_at: entity?.updated_at || new Date().toISOString() };
    this.drafts.update((list) => [row, ...list.filter((d) => d.id !== id)]);
  }

  nextStep(): void {
    this.currentStep++;
  }

  previousStep(): void {
    this.currentStep--;
  }
}
