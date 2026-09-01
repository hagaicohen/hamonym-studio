import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  BillingProvisioningService,
  UnprovisionedEntity,
} from '../../services/billing-provisioning.service';

// Pre-filled only -- the backend never substitutes these itself (billing_accounts.fee_rate/
// vat_rate are NOT NULL with no DEFAULT on purpose). Every create() call still sends the
// values explicitly, whatever the admin leaves or changes in the form.
const SUGGESTED_FEE_RATE = 0.03;
const SUGGESTED_VAT_RATE = 0.18;

@Component({
  selector: 'app-platform-billing-accounts-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-billing-accounts-page.component.html',
  styleUrl: './platform-billing-accounts-page.component.css',
})
export class PlatformBillingAccountsPageComponent implements OnInit {
  private service = inject(BillingProvisioningService);
  private route = inject(ActivatedRoute);

  loading = true;
  error: string | null = null;
  entities: UnprovisionedEntity[] = [];

  openEntityId: string | null = null;
  feeRatePercent = SUGGESTED_FEE_RATE * 100;
  vatRatePercent = SUGGESTED_VAT_RATE * 100;
  collectionMethod: 'card' | 'masav' = 'card';
  notes = '';

  submitting = false;
  submitError: string | null = null;
  justProvisionedId: string | null = null;

  // Deep-link from Billing Ops' "הגדר חשבון חיוב" action (a blocked entity
  // with real donation activity but no billing_account) -- pre-opens this
  // exact entity's provisioning form so the operator doesn't have to find
  // it again in the list. Purely a UX convenience: never auto-submits, and
  // has no effect if the entity isn't (or is no longer) in the
  // unprovisioned list.
  private highlightEntityId: string | null = null;

  ngOnInit(): void {
    this.highlightEntityId = this.route.snapshot.queryParamMap.get('entityId');
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.error = null;
    this.service.getUnprovisioned().subscribe({
      next: (res) => {
        this.entities = res.entities;
        this.loading = false;
        if (this.highlightEntityId) {
          const match = this.entities.find((e) => e.id === this.highlightEntityId);
          if (match) this.openProvision(match);
          this.highlightEntityId = null;
        }
      },
      error: () => {
        this.error = 'שגיאה בטעינת רשימת הישויות';
        this.loading = false;
      },
    });
  }

  billingMethodLabel(method: string | null): string {
    if (method === 'masav') return 'מס״ב (מוצהר)';
    if (method === 'credit-card') return 'כרטיס אשראי (מוצהר)';
    return '—';
  }

  openProvision(entity: UnprovisionedEntity): void {
    this.openEntityId = entity.id;
    this.feeRatePercent = SUGGESTED_FEE_RATE * 100;
    this.vatRatePercent = SUGGESTED_VAT_RATE * 100;
    this.collectionMethod = entity.declared_billing_method === 'masav' ? 'masav' : 'card';
    this.notes = '';
    this.submitError = null;
  }

  cancelProvision(): void {
    this.openEntityId = null;
  }

  confirmProvision(entity: UnprovisionedEntity): void {
    if (this.submitting) return;
    this.submitting = true;
    this.submitError = null;

    this.service
      .create({
        entityId: entity.id,
        feeRate: this.feeRatePercent / 100,
        vatRate: this.vatRatePercent / 100,
        preferredCollectionMethod: this.collectionMethod,
        notes: this.notes || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.openEntityId = null;
          this.justProvisionedId = entity.id;
          this.load(); // re-fetch from the server -- never assume locally
        },
        error: (err) => {
          this.submitting = false;
          this.submitError = err?.error?.error || 'יצירת חשבון החיוב נכשלה';
        },
      });
  }
}
