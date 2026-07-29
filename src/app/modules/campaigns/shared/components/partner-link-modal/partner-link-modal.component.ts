import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { CampaignPartnersService, CampaignPartner } from '../../../services/campaign-partners.service';

interface PartnerResult {
  id: string;
  display_name: string;
  logo_url: string | null;
  website: string | null;
}

// Phase 4 — Partner Management, Epics 1+2+4 (Creation / Discovery / Campaign
// Linking) in one small modal: search existing Partners, or create a new
// one on the spot, then immediately link it to the reward via
// CampaignPartner. See docs/PARTNER_DOMAIN_MODEL_ADR.md §10-11.
@Component({
  selector: 'app-partner-link-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './partner-link-modal.component.html',
  styleUrl: './partner-link-modal.component.css',
})
export class PartnerLinkModalComponent implements OnInit {
  @Input() campaignId!: string;
  @Input() rewardId!: string;
  @Input() rewardTitle = '';
  @Output() linked = new EventEmitter<CampaignPartner>();
  @Output() closed = new EventEmitter<void>();

  private entitiesService = inject(EntitiesService);
  private campaignPartnersService = inject(CampaignPartnersService);

  mode: 'search' | 'create' = 'search';
  query = '';
  results: PartnerResult[] = [];
  searching = false;
  searched = false;
  linking = false;
  error = '';

  newPartner = { display_name: '', website: '', contact_email: '', contact_phone: '' };

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    this.searching = true;
    this.entitiesService.searchPartners(this.query).subscribe({
      next: res => { this.results = res.partners; this.searching = false; this.searched = true; },
      error: () => { this.searching = false; this.searched = true; },
    });
  }

  selectExisting(partner: PartnerResult): void {
    this.linking = true;
    this.error = '';
    this.campaignPartnersService.create(this.campaignId, { partnerEntityId: partner.id, rewardId: this.rewardId }).subscribe({
      next: res => { this.linking = false; this.linked.emit(res.partner); },
      error: err => { this.linking = false; this.error = err?.error?.error || 'שגיאה בחיבור השותף'; },
    });
  }

  createAndLink(): void {
    if (!this.newPartner.display_name.trim()) return;
    this.linking = true;
    this.error = '';
    this.entitiesService.createEntity({
      display_name: this.newPartner.display_name.trim(),
      website: this.newPartner.website.trim() || undefined,
      contact_email: this.newPartner.contact_email.trim() || undefined,
      contact_phone: this.newPartner.contact_phone.trim() || undefined,
    }).subscribe({
      next: res => {
        const entityId = res.entity.id;
        this.entitiesService.addRole(entityId, 'partner').subscribe({
          next: () => {
            this.campaignPartnersService.create(this.campaignId, { partnerEntityId: entityId, rewardId: this.rewardId }).subscribe({
              next: linkRes => { this.linking = false; this.linked.emit(linkRes.partner); },
              error: err => { this.linking = false; this.error = err?.error?.error || 'שגיאה בחיבור השותף'; },
            });
          },
          error: () => { this.linking = false; this.error = 'שגיאה ביצירת השותף'; },
        });
      },
      error: () => { this.linking = false; this.error = 'שגיאה ביצירת השותף'; },
    });
  }

  close(): void { this.closed.emit(); }
}
