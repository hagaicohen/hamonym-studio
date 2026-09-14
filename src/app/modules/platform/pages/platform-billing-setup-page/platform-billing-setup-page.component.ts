import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BillingEntitySetupComponent } from '../../components/billing-entity-setup/billing-entity-setup.component';

// Standalone deep-link page (kept for compatibility, 2026-09-14h drawer
// redesign) -- normal Platform Admin navigation now opens billing setup as
// a drawer directly from "הגדרות עמותות"/"החודש"/"מס״ב" (see
// platform-billing-ops-page.component.ts#openBillingSetup) so the operator
// never loses list context. This page is just a thin route wrapper around
// the exact same BillingEntitySetupComponent the drawer hosts -- no
// business logic lives here anymore, only route-param reading and the
// page-level "back" chrome a full page (but not a drawer) actually needs.
@Component({
  selector: 'app-platform-billing-setup-page',
  standalone: true,
  imports: [CommonModule, RouterModule, BillingEntitySetupComponent],
  templateUrl: './platform-billing-setup-page.component.html',
  styleUrl: './platform-billing-setup-page.component.css',
})
export class PlatformBillingSetupPageComponent implements OnInit {
  private route = inject(ActivatedRoute);

  entityId = '';
  displayName: string | null = null;
  donationCount: number | null = null;
  grossAmount: string | null = null;

  ngOnInit(): void {
    this.entityId = this.route.snapshot.paramMap.get('entityId') || '';
    const qp = this.route.snapshot.queryParamMap;
    this.displayName = qp.get('displayName');
    const dc = qp.get('donationCount');
    const ga = qp.get('grossAmount');
    this.donationCount = dc ? Number(dc) : null;
    this.grossAmount = ga;
  }
}
