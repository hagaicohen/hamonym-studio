import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrganizationCheck } from '../../utils/organization-health';

@Component({
  selector: 'app-organization-checklist',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="completion" dir="rtl">
      <div *ngIf="showScore" class="score" [class.good]="score >= 80" [class.bad]="score < 50">
        <strong>{{ score }}%</strong><span>השלמת פרטי עמותה</span>
      </div>
      <ul class="checks" aria-label="רשימת השלמת פרטי עמותה">
        <li *ngFor="let check of checks">
          <span class="checkmark" [class.complete]="check.ok" aria-hidden="true">{{ check.ok ? '✓' : '−' }}</span>
          <span><span class="sr-only">{{ check.ok ? 'הושלם: ' : 'להשלמה: ' }}</span>{{ check.label }}<small *ngIf="check.detail">{{ check.detail }}</small></span>
        </li>
      </ul>
    </div>`,
  styles: [`
    :host { display: block; }
    .completion { display: flex; align-items: center; gap: 24px; }
    .checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; flex: 1; }
    li { display: flex; align-items: flex-start; gap: 10px; color: #1e293b; font-size: 14px; }
    .checkmark { width: 16px; height: 16px; flex: 0 0 16px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 4px; color: #64748b; font-size: 12px; margin-top: 2px; }
    .checkmark.complete { color: #15803d; border-color: #86efac; background: #f0fdf4; }
    small { display: block; color: #64748b; font-size: 12px; line-height: 1.6; margin-top: 3px; }
    .score { box-sizing: border-box; width: 100px; height: 100px; flex-shrink: 0; border: 6px solid #f59e0b; border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; padding: 8px; text-align: center; color: #b45309; }
    .score.good { border-color: #0ea65a; color: #0ea65a; }.score.bad { border-color: #ef4444; color: #ef4444; }
    .score strong { font-size: 20px; line-height: 1.2; }.score span { display: block; width: 100%; max-width: 72px; font-size: 10px; line-height: 1.4; color: #94a3b8; font-weight: 600; text-align: center; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    @media(max-width: 480px) { .completion { flex-direction: column; align-items: stretch; gap: 16px; }.score { align-self: center; } }
  `],
})
export class OrganizationChecklistComponent {
  @Input() checks: OrganizationCheck[] = [];
  @Input() showScore = false;
  get score(): number { return this.checks.length ? Math.round(this.checks.filter(check => check.ok).length / this.checks.length * 100) : 0; }
}
