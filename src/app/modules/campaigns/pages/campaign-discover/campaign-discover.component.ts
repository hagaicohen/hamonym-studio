import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-campaign-discover',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="discover-placeholder">
      <div class="discover-icon">🔍</div>
      <h1>חיפוש קמפיינים</h1>
      <p>עמוד זה בפיתוח — בקרוב תוכלו לחפש ולגלות קמפיינים</p>
    </div>
  `,
  styles: [`
    .discover-placeholder {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: #f8f9ff;
      direction: rtl;
      text-align: center;
      padding: 24px;
    }
    .discover-icon { font-size: 56px; }
    h1 { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
    p { font-size: 15px; color: #94a3b8; margin: 0; }
  `],
})
export class CampaignDiscoverComponent {}
