import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule, Monitor, Smartphone, Maximize2, Minimize2, ArrowRight, House, Eye, UserPlus, Trash2, Save, Check, LoaderCircle } from 'lucide-angular';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioStateService, createInitialPartnerDraft } from '../../../services/campaign-studio-state.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';
import { StudioUiService, DeviceMode } from '../../services/studio-ui.service';

// Phase 3 — Page Builder Owner Context. Minimal host page proving the SAME
// Builder/Renderer (CampaignPageBuilderStepComponent / CampaignPreviewComponent)
// work unmodified against a Partner entity's own draft instead of a
// campaign's — see docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md. No stepper, no
// topbar, no publish flow (those are Campaign-specific and stay that way);
// just the block editor + live preview + a save button.
@Component({
  selector: 'app-partner-builder-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, CampaignPageBuilderStepComponent, CampaignPreviewComponent],
  templateUrl: './partner-builder-page.component.html',
  styleUrl: './partner-builder-page.component.css',
})
export class PartnerBuilderPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private entitiesService = inject(EntitiesService);
  private campaignPartnersService = inject(CampaignPartnersService);
  state = inject(CampaignStudioStateService);
  ui = inject(StudioUiService);

  readonly Monitor = Monitor;
  readonly Smartphone = Smartphone;
  readonly Maximize2 = Maximize2;
  readonly Minimize2 = Minimize2;
  readonly ArrowRight = ArrowRight;
  readonly House = House;
  readonly Eye = Eye;
  readonly UserPlus = UserPlus;
  readonly Trash2 = Trash2;
  readonly Save = Save;
  readonly Check = Check;
  readonly LoaderCircle = LoaderCircle;

  entityId = '';
  loading = true;
  saving = false;
  saved = false;
  loadError: string | null = null;
  displayName = '';

  // "Campaigns using this Partner" — Scenario 0 / "Partner First". A newly
  // created Partner starts with zero (§11: independent existence is a valid
  // normal state, not an edge case).
  usingCampaigns: { campaignId: string; campaignTitle: string; campaignStatus: string; visible: boolean }[] = [];

  // §14 — arrived here from the "המשך ליצירת שותף" redirect in
  // partner-link-modal. When present, a persistent bar offers to link this
  // Partner to the reward that's waiting and return to the campaign.
  returnCampaignId: string | null = null;
  returnRewardId: string | null = null;
  returnStep: string | null = null;
  returningToCampaign = false;
  returnError = '';

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.returnCampaignId = qp.get('returnCampaignId');
    this.returnRewardId = qp.get('returnRewardId');
    this.returnStep = qp.get('returnStep');

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError = 'לא נמצא מזהה שותף.';
      this.loading = false;
      return;
    }
    this.entityId = id;

    this.entitiesService.getEntityById(id).subscribe({
      next: entity => {
        this.displayName = entity.display_name || '';
        this.entitiesService.getDraft(id).subscribe({
          next: draft => {
            const initial = createInitialPartnerDraft(id, entity.display_name || '');
            this.state.loadDraft({ ...initial, blocks: draft.blocks || [], layout: { ...initial.layout, ...(draft.layout || {}) } });
            this.loading = false;
          },
          error: () => { this.loadError = 'לא ניתן היה לטעון את דף השותף.'; this.loading = false; },
        });
      },
      error: () => { this.loadError = 'לא נמצא שותף כזה, או שאין לכם גישה אליו.'; this.loading = false; },
    });

    this.campaignPartnersService.listForPartner(id).subscribe({
      next: res => { this.usingCampaigns = res.campaigns; },
    });
  }

  setDevice(mode: DeviceMode): void { this.ui.setDevice(mode); }
  toggleFullscreen(): void { this.ui.setFullscreen(!this.ui.isFullscreen); }

  // ── Draggable editor/preview split — the editor panel was a fixed 480px,
  // no way for the user to trade space between it and the preview. Dragging
  // the divider updates editorWidth directly; editor sits on the right (RTL:
  // first DOM child), so its width is measured from the divider to the
  // window's right edge, i.e. window.innerWidth - clientX. ──
  editorWidth = 480;
  private resizing = false;

  startResize(event: MouseEvent): void {
    this.resizing = true;
    event.preventDefault();
  }

  onResizeMove(event: MouseEvent): void {
    if (!this.resizing) return;
    this.editorWidth = Math.min(900, Math.max(320, window.innerWidth - event.clientX));
  }

  stopResize(): void {
    this.resizing = false;
  }

  save(): void {
    this.saving = true;
    this.saved = false;
    this.entitiesService.updateDraft(this.entityId, {
      blocks: this.state.draft.blocks,
      layout: this.state.draft.layout,
    }).subscribe({
      next: () => { this.saving = false; this.saved = true; },
      error: () => { this.saving = false; },
    });
  }

  // Saves the current draft first, then links — never link ahead of a save
  // that could still fail, and never navigate away before the block content
  // has actually persisted.
  returnAndLink(): void {
    if (!this.returnCampaignId || this.returningToCampaign) return;
    this.returningToCampaign = true;
    this.returnError = '';
    this.entitiesService.updateDraft(this.entityId, {
      blocks: this.state.draft.blocks,
      layout: this.state.draft.layout,
    }).subscribe({
      next: () => {
        this.campaignPartnersService.create(this.returnCampaignId!, {
          partnerEntityId: this.entityId,
          rewardId: this.returnRewardId || null,
        }).subscribe({
          next: () => {
            this.router.navigate(['/campaigns', this.returnCampaignId, 'edit'], {
              queryParams: this.returnStep ? { returnStep: this.returnStep } : undefined,
            });
          },
          error: err => {
            this.returningToCampaign = false;
            this.returnError = err?.error?.error || 'שגיאה בחיבור השותף לקמפיין';
          },
        });
      },
      error: () => {
        this.returningToCampaign = false;
        this.returnError = 'שגיאה בשמירת דף השותף';
      },
    });
  }

  // ── Invite (Phase 4, Epic 3) ──
  showInviteForm = false;
  inviteEmail = '';
  inviteSending = false;
  inviteSent = false;
  inviteError = '';

  sendInvite(): void {
    if (!this.inviteEmail.trim()) return;
    this.inviteSending = true;
    this.inviteError = '';
    this.entitiesService.createInvite(this.entityId, this.inviteEmail.trim()).subscribe({
      next: () => { this.inviteSending = false; this.inviteSent = true; },
      error: err => { this.inviteSending = false; this.inviteError = err?.error?.error || 'שגיאה בשליחת ההזמנה'; },
    });
  }

  // ── Delete Partner (soft delete — entities.service.js#softDeleteEntity,
  // the same self-service "delete my entity" endpoint used for
  // organizations). Type-to-confirm, same pattern as
  // entity-settings.component.ts's org-delete modal. ──
  showDeleteModal = false;
  deleteConfirmText = '';
  isDeleting = false;
  deleteError = '';

  get deleteConfirmValid(): boolean {
    return this.deleteConfirmText.trim() === this.displayName.trim() && this.displayName.trim().length > 0;
  }

  openDeleteModal(): void {
    this.deleteConfirmText = '';
    this.deleteError = '';
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
  }

  confirmDelete(): void {
    if (!this.deleteConfirmValid || this.isDeleting) return;
    this.isDeleting = true;
    this.entitiesService.deleteEntity(this.entityId).subscribe({
      next: () => {
        this.router.navigate(['/partners']);
      },
      error: err => {
        this.isDeleting = false;
        this.deleteError = err?.error?.error || 'שגיאה במחיקת השותף';
      },
    });
  }
}
