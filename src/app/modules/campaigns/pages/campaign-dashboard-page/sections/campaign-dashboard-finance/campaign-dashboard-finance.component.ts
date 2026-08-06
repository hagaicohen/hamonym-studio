import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// Still Mock (2026-08-06) — Finance was never a Builder capability, this
// Migration never covered it, and the donations backend it needs isn't
// connected yet. Restyled per the reference mockup into two side-by-side
// cards: a financial summary (still mock numbers, same as before) and an
// Analytics preview. Analytics is deliberately NOT populated with a fake
// trend/percentage — that needs real historical donation data this app
// doesn't have yet — it's an honest "coming soon" placeholder instead.
@Component({
  selector: 'app-campaign-dashboard-finance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-dashboard-finance.component.html',
  styleUrl: './campaign-dashboard-finance.component.css',
})
export class CampaignDashboardFinanceComponent {}
