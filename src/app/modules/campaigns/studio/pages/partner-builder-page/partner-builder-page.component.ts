import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioStateService, createInitialPartnerDraft } from '../../../services/campaign-studio-state.service';
import { EntitiesService } from '../../../../../core/services/entities.service';

// Phase 3 — Page Builder Owner Context. Minimal host page proving the SAME
// Builder/Renderer (CampaignPageBuilderStepComponent / CampaignPreviewComponent)
// work unmodified against a Partner entity's own draft instead of a
// campaign's — see docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md. No stepper, no
// topbar, no publish flow (those are Campaign-specific and stay that way);
// just the block editor + live preview + a save button.
@Component({
  selector: 'app-partner-builder-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CampaignPageBuilderStepComponent, CampaignPreviewComponent],
  templateUrl: './partner-builder-page.component.html',
  styleUrl: './partner-builder-page.component.css',
})
export class PartnerBuilderPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private entitiesService = inject(EntitiesService);
  state = inject(CampaignStudioStateService);

  entityId = '';
  loading = true;
  saving = false;
  saved = false;
  loadError: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError = 'לא נמצא מזהה שותף.';
      this.loading = false;
      return;
    }
    this.entityId = id;

    this.entitiesService.getEntityById(id).subscribe({
      next: entity => {
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
}
