// entity-settings.component.ts

import { Component, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';

import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs';

import { ActivatedRoute, Router } from '@angular/router';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { LucideAngularModule, Building2 } from 'lucide-angular';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

import { CurrentContextService } from '../../../../core/services/current-context.service';

import { CAMPAIGN_TYPES } from '../../../organization-registration/constants/campaign-types';

import { ENTITY_CONFIGS } from '../../../organization-registration/config/entity-config';

import { environment } from '../../../../../environments/environment';

import { EntityBasicInfoSectionViewComponent } from '../view/entity-basic-info-section-view/entity-basic-info-section-view.component';

import { EntityBasicInfoSectionEditComponent } from '../edit/entity-basic-info-section-edit/entity-basic-info-section-edit.component';

import { EntityProfileSectionViewComponent } from '../view/entity-profile-section-view/entity-profile-section-view.component';

import { EntityProfileSectionEditComponent } from '../edit/entity-profile-section-edit/entity-profile-section-edit.component';

import { EntityGoalsSectionViewComponent } from '../view/entity-goals-section-view/entity-goals-section-view.component';

import { EntityGoalsSectionEditComponent } from '../edit/entity-goals-section-edit/entity-goals-section-edit.component';

import { EntityPaymentSectionViewComponent } from '../view/entity-payment-section-view/entity-payment-section-view.component';

import { EntityPaymentSectionEditComponent } from '../edit/entity-payment-section-edit/entity-payment-section-edit.component';

import { EntityBillingSectionViewComponent } from '../view/entity-billing-section-view/entity-billing-section-view.component';

import { EntityBillingSectionEditComponent } from '../edit/entity-billing-section-edit/entity-billing-section-edit.component';

import { EntitiesService } from '../../../../core/services/entities.service';

import { BillingService } from '../../../organization-registration/services/billing.service';

import { ApprovalStatusCardComponent } from '../approval-status-card/approval-status-card.component';

import { SectionSaveState } from '../../models/section-save-state.model';
import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-entity-settings',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    LoadingOverlayComponent,

    EntityBasicInfoSectionViewComponent,
    EntityBasicInfoSectionEditComponent,

    EntityProfileSectionViewComponent,
    EntityProfileSectionEditComponent,

    EntityGoalsSectionViewComponent,
    EntityGoalsSectionEditComponent,

    EntityPaymentSectionViewComponent,
    EntityPaymentSectionEditComponent,

    EntityBillingSectionViewComponent,
    EntityBillingSectionEditComponent,

    ApprovalStatusCardComponent,
  ],

  templateUrl: './entity-settings.component.html',

  styleUrls: ['./entity-settings.component.css'],
})
export class EntitySettingsComponent implements OnInit, OnDestroy {
  constructor() {}

  readonly Building2 = Building2;

  private currentEntityService = inject(CurrentEntityService);

  private currentContextService = inject(CurrentContextService);

  private entitiesService = inject(EntitiesService);

  private billingService = inject(BillingService);

  private route = inject(ActivatedRoute);

  private router = inject(Router);

  @ViewChild(EntityBillingSectionEditComponent)
  billingSection?: EntityBillingSectionEditComponent;

  editMode = false;

  editingSection: string | null = null;

  // Sections left mid-edit with unsaved changes (switched away without
  // saving) — draftEntity is NOT reset when that happens (see startEdit),
  // so nothing typed is lost, but the section's own card needs to show it
  // still has pending changes. Highlighted directly on that card instead of
  // a page-level banner.
  dirtySections = new Set<string>();

  saveError = '';
  showInlineError = false;

  saveState: SectionSaveState = {
    isSaving: false,

    saveCompleted: false,

    saveFailed: false,
  };

  entity: any = null;

  draftEntity: any = null;

  // Real entity_masav_details row for this entity (or null) -- fetched once
  // so the read-only billing card shows accurate MASAV status from first
  // paint, not just while the edit drawer is open. Kept current afterwards
  // by entity-billing-section-edit's masavConfigChange output.
  masavConfig: any = null;

  campaignTypes = CAMPAIGN_TYPES;

  ENTITY_CONFIGS = ENTITY_CONFIGS;

  apiUrl = environment.apiUrl;

  loadingEntity = false;
  loadError = '';
  private scopeVersion = 0;
  private scopeChanged = new Subject<void>();
  private routeSubscription?: Subscription;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const version = ++this.scopeVersion;
      this.scopeChanged.next();
      this.entity = this.draftEntity = null;
      this.masavConfig = null;
      this.editMode = false;
      this.editingSection = null;
      this.dirtySections.clear();
      this.saveError = this.loadError = this.visibilityError = this.deleteError = '';
      this.deleteConfirmOpen = false;
      this.isDeletingEntity = this.isTogglingVisibility = this.isCheckingBillingConnection = false;
      this.saveState = {isSaving: false, saveCompleted: false, saveFailed: false};
      const id = params.get('id') || this.currentEntityService.currentEntity()?.id;
      if (!id) { this.loadingEntity = false; this.loadError = 'לא נבחרה עמותה'; return; }
      this.loadingEntity = true;
      this.entitiesService.getEntityById(id).pipe(takeUntil(this.scopeChanged)).subscribe({
        next: result => {
          if (version !== this.scopeVersion) return;
          const entity = result.entity || result;
          if (entity.id !== id) { this.loadingEntity = false; this.loadError = 'נתוני העמותה אינם תואמים לכתובת המבוקשת'; return; }
          this.entity = entity;
          this.draftEntity = structuredClone(entity);
          this.loadingEntity = false;
          this.loadMasavConfig();
          if (this.route.snapshot.queryParamMap.get('edit') === 'true') this.startEdit();
        },
        error: err => {
          if (version !== this.scopeVersion) return;
          this.loadingEntity = false;
          this.loadError = err?.error?.error || 'לא ניתן לטעון את העמותה או שאין הרשאה לצפות בה';
        },
      });
    });
  }

  ngOnDestroy(): void {
    ++this.scopeVersion;
    this.scopeChanged.next();
    this.scopeChanged.complete();
    this.routeSubscription?.unsubscribe();
  }

  private syncActiveEntity(entity: any): void {
    const active = this.currentContextService.active();
    const activeId = active ? (active.role === 'entity-manager' ? active.context?.id : null) : this.currentEntityService.currentEntity()?.id;
    if (activeId === entity.id) this.currentEntityService.setEntity(entity);
  }

  onReviewSubmitted(entity:any): void {
    if (entity.id !== this.entity?.id) return;
    this.entity = structuredClone(entity);
    this.draftEntity = structuredClone(entity);
    this.syncActiveEntity(entity);
  }

  private loadMasavConfig(): void {
    if (!this.entity?.id) return;
    const version = this.scopeVersion;
    this.billingService.getMasavConfig(this.entity.id).pipe(takeUntil(this.scopeChanged)).subscribe({
      next: (res: any) => { if (version === this.scopeVersion) this.masavConfig = res.config; },
      error: () => {},
    });
  }

  onEntityChange(partial: any): void {
    if (!this.entity || (partial?.id && partial.id !== this.entity.id)) return;
    this.draftEntity = {
      ...this.draftEntity,

      ...partial,
    };
  }

  private hasUnsavedChanges(): boolean {
    return JSON.stringify(this.draftEntity) !== JSON.stringify(this.entity);
  }

  private failUpload(message: string): void {
    this.saveError = message;
    this.saveState = {isSaving:false, saveCompleted:false, saveFailed:true};
  }

  startEdit(section?: string): void {
    if (!this.entity || this.loadingEntity) return;
    this.saveError = '';

    if (
      this.editMode &&
      section &&
      section !== this.editingSection &&
      this.hasUnsavedChanges()
    ) {
      // Switching to a different section while the current one still has
      // unsaved edits — keep draftEntity as-is instead of resetting it from
      // the last-saved entity, so nothing typed is lost. It'll ride along
      // and get saved the next time ANY section's save button is pressed
      // (saveAll() always saves the whole draftEntity). Mark the section
      // being left so its card shows a "not saved yet" highlight.
      if (this.editingSection) this.dirtySections.add(this.editingSection);
      this.editingSection = section;
      return;
    }

    if (section) this.dirtySections.delete(section);
    this.draftEntity = structuredClone(this.entity);

    this.editMode = true;

    this.editingSection = section || null;
  }

  cancelEdit(): void {
    this.saveError = '';
    this.dirtySections.clear();

    this.draftEntity = structuredClone(this.entity);

    this.editMode = false;

    this.editingSection = null;
  }

  async saveAll(): Promise<void> {
    this.saveError = '';

    this.showInlineError = false;

    this.saveState.saveCompleted = false;

    if (!this.draftEntity?.id || this.saveState.isSaving) {
      return;
    }

    const version = this.scopeVersion;
    let draft = structuredClone(this.draftEntity);
    const original = structuredClone(this.entity);
    const entityId = original.id;
    if (draft.id !== entityId) return;
    this.saveState.isSaving = true;

    const billingComponent = document.querySelector(
      'app-entity-billing-section-edit',
    );

    const isReplacingCard = billingComponent?.querySelector(
      'app-openfields-form',
    );

    if (isReplacingCard && this.billingSection?.openfieldsForm) {
      const tokenized = await this.billingSection.openfieldsForm.tokenize();
      if (version !== this.scopeVersion) return;
      // Tokenization may emit updated fields through the existing child output.
      draft = structuredClone(this.draftEntity);
      if (draft.id !== entityId) return;

      if (!tokenized) {
        this.saveError = 'שמירת כרטיס האשראי נכשלה';

        this.showInlineError = true;

        this.saveState.isSaving = false;

        setTimeout(() => {
            if (version !== this.scopeVersion) return;
          this.showInlineError = false;
        }, 2500);

        return;
      }
    }

    /*
    IMPORTANT:
    explicit tax document delete flow
  */

    const hadTaxDocument = !!original?.tax_document_name;
    const removedTaxDocument = hadTaxDocument && !draft?.tax_document_name;
    if (removedTaxDocument) {
      try {
        await firstValueFrom(this.entitiesService.removeTaxDocument(draft.id));
        if (version !== this.scopeVersion) return;
      } catch (err) {
        if (version !== this.scopeVersion) return;
        console.error(err);
        this.failUpload('הסרת אישור המס נכשלה. יש לנסות שוב לפני הגשה.');
        return;
      }
    }

    const hadAssociationCert = !!original?.association_certificate_name;
    const removedAssociationCert = hadAssociationCert && !draft?.association_certificate_name;
    if (removedAssociationCert) {
      try {
        await firstValueFrom(this.entitiesService.removeAssociationDocument(draft.id));
        if (version !== this.scopeVersion) return;
      } catch (err) {
        if (version !== this.scopeVersion) return;
        console.error(err);
        this.failUpload('הסרת תעודת ההתאגדות נכשלה. יש לנסות שוב לפני הגשה.');
        return;
      }
    }

    /*
    IMPORTANT:
    a newly selected document is stashed as a raw File on draftEntity by the
    edit sub-component (for an immediate filename preview) but was never
    actually uploaded — do that here, then drop the File so it isn't resent
    on a later unrelated save.
  */

    const newTaxDocumentFile = draft?.tax_document_file;
    if (newTaxDocumentFile instanceof File) {
      try {
        await firstValueFrom(this.entitiesService.uploadTaxDocument(draft.id, newTaxDocumentFile));
        if (version !== this.scopeVersion) return;
      } catch (err) {
        if (version !== this.scopeVersion) return;
        console.error(err);
        this.failUpload('העלאת אישור המס נכשלה. הקובץ נשמר בטופס לניסיון נוסף.');
        return;
      }
      draft.tax_document_file = null;
    }

    const newAssociationCertFile = draft?.association_certificate_file;
    if (newAssociationCertFile instanceof File) {
      try {
        await firstValueFrom(this.entitiesService.uploadAssociationDocument(draft.id, newAssociationCertFile));
        if (version !== this.scopeVersion) return;
      } catch (err) {
        if (version !== this.scopeVersion) return;
        console.error(err);
        this.failUpload('העלאת תעודת ההתאגדות נכשלה. הקובץ נשמר בטופס לניסיון נוסף.');
        return;
      }
      draft.association_certificate_file = null;
    }

    const newLogoFile = draft?.logo_file;
    if (newLogoFile instanceof File) {
      try {
        const res: any = await firstValueFrom(this.entitiesService.uploadLogo(draft.id, newLogoFile));
        if (version !== this.scopeVersion) return;
        draft.logo_url = res?.result?.logo_url || draft.logo_url;
      } catch (err) {
        if (version !== this.scopeVersion) return;
        console.error(err);
        this.failUpload('העלאת הלוגו נכשלה. הקובץ נשמר בטופס לניסיון נוסף.');
        return;
      }
      draft.logo_file = null;
    }

    const optimisticEntity = structuredClone(draft);

    /*
    IMPORTANT:
    preserve billing method UI state
  */

    if (this.editingSection === 'billing') {
      optimisticEntity.billing_method = draft.billing_method;
    }

    this.entity = optimisticEntity;

    // Active context is refreshed only after a successful authorized save.

    if (draft?.billing_card_number) {
      draft.billing_card_last4 = draft.billing_card_number
        .replace(/\s/g, '')
        .slice(-4);
    }

    const payload = {
      ...draft,

      /*
      IMPORTANT:
      switching to MASAV
      must clear old credit card data
    */

      ...(draft?.billing_method === 'masav'
        ? {
            billing_last4: null,

            exp_month: null,

            exp_year: null,

            billing_provider: null,
          }
        : {}),

      logo_data: undefined,
      logo_file: undefined,

      association_certificate_data: undefined,

      tax_document_data: undefined,
    };

    this.entitiesService
      .updateEntity(
        draft.id,

        payload,
      )

      .pipe(takeUntil(this.scopeChanged)).subscribe({
        next: (updatedEntity) => {
          if (version !== this.scopeVersion) return;
          this.saveState.isSaving = false;

          this.saveState.saveFailed = false;

          // saveAll() always persists the whole draftEntity in one PATCH,
          // so a save from any single section's button saves every pending
          // change, not just that section's — clear all the highlights.
          this.dirtySections.clear();

          this.saveState.saveCompleted = true;

          /*
          IMPORTANT:
          preserve billing UI state
          after backend response
        */

          const mergedEntity = {
            ...updatedEntity,

            billing_method: draft?.billing_method,
          };

          this.entity = structuredClone(mergedEntity);

          this.draftEntity = structuredClone(mergedEntity);

          this.syncActiveEntity(mergedEntity);

          setTimeout(() => {
            if (version !== this.scopeVersion) return;
            this.saveState.saveCompleted = false;

            this.editMode = false;

            this.editingSection = null;
          }, 1500);

          this.entitiesService
            .getEntityById(updatedEntity.id)

            .pipe(takeUntil(this.scopeChanged)).subscribe({
              next: (fullEntity: any) => {
                if (version !== this.scopeVersion) return;
                const entity = fullEntity.entity || fullEntity;

                this.entity = structuredClone(entity);

                this.draftEntity = structuredClone(entity);

                this.syncActiveEntity(entity);
              },

              error: (err) => {
          if (version !== this.scopeVersion) return;
                console.error(err);
              },
            });
        },

        error: (err) => {
          if (version !== this.scopeVersion) return;
          console.error(err);

          this.saveState.isSaving = false;

          this.saveState.saveCompleted = false;

          this.saveState.saveFailed = true;

          /*
          IMPORTANT:
          keep billing edit mode open
          after failed save
        */

          if (this.editingSection === 'billing') {
            this.draftEntity = {
              ...draft,

              billing_method: draft?.billing_method || 'credit-card',
            };
          }

          setTimeout(() => {
            if (version !== this.scopeVersion) return;
            this.saveState.saveFailed = false;
          }, 2000);
        },
      });
  }

  get entityTypeLabel(): string {
    const entityType = this.draftEntity
      ?.entity_type as keyof typeof ENTITY_CONFIGS;

    return this.ENTITY_CONFIGS[entityType]?.labels?.entity || 'יישות';
  }

  isCheckingBillingConnection = false;

  testBillingConnection(): void {
    if (!this.draftEntity?.id) return;
    const version = this.scopeVersion;
    const start = Date.now();

    this.isCheckingBillingConnection = true;

    this.draftEntity = {
      ...this.draftEntity,

      cardcom_last_error: null,
    };

    this.entitiesService.http
      .post<any>(
        `${environment.apiUrl}/api/payment/cardcom/test-connection`,

        {
          entityId: this.draftEntity.id,

          terminalNumber: this.draftEntity.cardcom_terminal_number,

          apiName: this.draftEntity.cardcom_api_username,

          apiPassword: this.draftEntity.cardcom_api_password_encrypted,

          environment: 'sandbox',
        },
      )
      .pipe(takeUntil(this.scopeChanged)).subscribe({
        next: (res) => {
          if (version !== this.scopeVersion) return;
          const elapsed = Date.now() - start;

          const remaining = Math.max(0, 2000 - elapsed);

          setTimeout(() => {
            if (version !== this.scopeVersion) return;
            this.isCheckingBillingConnection = false;

            this.draftEntity = {
              ...this.draftEntity,

              cardcom_connection_status: res.success ? 'success' : 'failed',

              cardcom_last_verified_at: new Date(),

              cardcom_last_error: res.success
                ? null
                : res.message || res.error?.Description || 'בדיקת החיבור נכשלה',
            };
          }, remaining);
        },

        error: (err) => {
        if (version !== this.scopeVersion) return;
          const elapsed = Date.now() - start;

          const remaining = Math.max(0, 2000 - elapsed);

          setTimeout(() => {
            if (version !== this.scopeVersion) return;
            this.isCheckingBillingConnection = false;

            this.draftEntity = {
              ...this.draftEntity,

              cardcom_connection_status: 'failed',

              cardcom_last_verified_at: new Date(),

              cardcom_last_error:
                err?.error?.message ||
                err?.error?.error?.Description ||
                'שגיאת שרת',
            };
          }, remaining);
        },
      });
  }

  // ── HIDE / UNHIDE ENTITY ──
  isTogglingVisibility = false;
  visibilityError = '';

  toggleEntityVisibility(): void {
    if (this.isTogglingVisibility || !this.draftEntity?.id) return;

    const version = this.scopeVersion;
    const nextHidden = !this.draftEntity.is_hidden;
    this.isTogglingVisibility = true;
    this.visibilityError = '';

    this.entitiesService.setVisibility(this.draftEntity.id, nextHidden).pipe(takeUntil(this.scopeChanged)).subscribe({
      next: () => {
        if (version !== this.scopeVersion) return;
        this.isTogglingVisibility = false;
        this.draftEntity = { ...this.draftEntity, is_hidden: nextHidden };
        this.entity = { ...this.entity, is_hidden: nextHidden };
        this.syncActiveEntity(this.entity);
      },
      error: (err) => {
        if (version !== this.scopeVersion) return;
        this.isTogglingVisibility = false;
        this.visibilityError = err?.error?.error || 'שגיאה בעדכון הנראות';
      },
    });
  }

  // ── DELETE ENTITY (soft) ──
  deleteConfirmOpen = false;
  deleteConfirmText = '';
  isDeletingEntity = false;
  deleteError = '';

  get deleteConfirmValid(): boolean {
    return this.deleteConfirmText.trim() === this.entityName.trim();
  }

  // display_name is only filled in step 2 of the registration wizard — an
  // entity that only completed step 1 would otherwise show a blank name
  // (and, worse, let the delete-confirmation input pass while empty).
  get entityName(): string {
    return this.draftEntity?.display_name || this.draftEntity?.legal_name || 'ללא שם';
  }

  openDeleteEntityModal(): void {
    this.deleteConfirmText = '';
    this.deleteError = '';
    this.deleteConfirmOpen = true;
  }

  closeDeleteEntityModal(): void {
    this.deleteConfirmOpen = false;
  }

  confirmDeleteEntity(): void {
    if (!this.deleteConfirmValid || this.isDeletingEntity || !this.draftEntity?.id) return;

    const version = this.scopeVersion;
    this.isDeletingEntity = true;
    const entityId = this.draftEntity.id;
    this.entitiesService.deleteEntity(entityId).pipe(takeUntil(this.scopeChanged)).subscribe({
      next: () => {
        if (version !== this.scopeVersion) return;
        this.currentContextService.removeEntityContext(entityId);
        if (this.currentEntityService.currentEntity()?.id === entityId) this.currentEntityService.clear();
        // 2026-09-28 — the entities list moved from /settings to its own
        // /entities route (MyOrganizationsPageComponent); this is the one
        // internal link that pointed back to it.
        this.router.navigate(['/entities']);
      },
      error: (err) => {
        if (version !== this.scopeVersion) return;
        this.isDeletingEntity = false;
        this.deleteError = err?.error?.error || 'שגיאה במחיקת העמותה';
      },
    });
  }
}
