import { Router, RouterLink } from '@angular/router';
import { Component, Input, inject } from '@angular/core';
import { Ambassador } from '../../services/ambassador.service';
import { FundraisingMeterComponent } from './fundraising-meter.component';

@Component({
  selector: 'app-public-ambassador-panel',
  standalone: true,
  imports: [FundraisingMeterComponent, RouterLink],
  template: `
    <section aria-label="שגריר הקמפיין">
      <div class="identity">
        @if (ambassador.photoUrl || ambassador.accountPhotoUrl; as photo) {
          <img [src]="photo" alt="" />
        } @else { <span class="initials" aria-hidden="true">{{ initials }}</span> }
        <div class="bio">
          <h2>{{ ambassador.fullName }}</h2>
          <small>{{ ambassador.personalTitle || 'שגריר הקמפיין' }}</small>
          <p>{{ ambassador.personalMessage?.trim() || 'בואו לתרום דרכי ולעזור לנו להגיע ליעד!' }}</p>
        </div>
      </div>
      @if (showAmounts) {
        <app-fundraising-meter class="personal-stats" [raised]="ambassador.raisedTotal"
          [goal]="ambassador.goalAmount || 0" [personalDonorCount]="ambassador.donorCount" personal />
      }
      <div class="actions">
        <a class="campaign-link" [routerLink]="campaignRoute"><span aria-hidden="true">←</span> לדף הקמפיין הראשי</a>
        @if (editAction) { <button type="button" (click)="editAction()"><span aria-hidden="true">✎</span> עריכת הדף שלי</button> }
      </div>
    </section>
  `,
  styles: [`
    :host { display:block; inline-size:100%; min-inline-size:0; box-sizing:border-box; margin-block-start:12px; }
    section {
      display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1.25fr) minmax(100px,.6fr); gap:18px;
      align-items:center; padding:18px 20px; background:#fff; color:#1b292e;
      border:1px solid #dce5df; border-radius:12px;
    }
    section:not(:has(.personal-stats)) { grid-template-columns:minmax(0,1fr) auto; }
    .identity { display:flex; align-items:flex-start; gap:10px; min-width:0; overflow-wrap:anywhere; }
    img,.initials { width:56px; height:56px; flex:none; object-fit:cover; border-radius:50%; }
    .initials { display:grid; place-items:center; color:var(--fundraising-accent,currentColor); background:color-mix(in srgb,var(--fundraising-accent,currentColor) 10%,white); }
    h2 { margin:0 0 3px; font-size:18px; line-height:1.3; font-weight:800; }
    small { font-size:12px; color:#526761; }
    p { margin:4px 0 0; font-size:13px; line-height:1.5; }
    .personal-stats { min-width:0; border-inline-start:1px solid #dce5df; padding-inline-start:16px; }
    .actions { display:flex; flex-direction:column; align-items:stretch; gap:8px; min-width:0; text-align:center; }
    .campaign-link {
      border:1px solid color-mix(in srgb,var(--fundraising-accent,currentColor) 50%,white);
      border-radius:7px; color:var(--fundraising-accent,currentColor); font-size:12px;
      padding:8px; text-decoration:none; line-height:1.3;
    }
    button { border:0; border-radius:5px; background:none; color:#526761; font:inherit; font-size:12px; cursor:pointer; padding:3px; }
    @media(max-width:767px) {
      section,section:not(:has(.personal-stats)) { grid-template-columns:minmax(0,1fr); gap:14px; padding:16px; }
      .personal-stats { border-inline-start:0; padding-inline-start:0; }
      .personal-stats,.actions { border-block-start:1px solid #dce5df; padding-block-start:12px; }
      .actions { flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; }
    }
    :host(.compact) section { gap:10px; padding:12px; }
    :host(.compact) img, :host(.compact) .initials { width:36px; height:36px; }
  `],
})
export class PublicAmbassadorPanelComponent {
  @Input({required:true}) ambassador!: Ambassador;
  @Input({required:true}) campaignUrl!: string;
  private readonly router = inject(Router);
  get campaignRoute() { return this.router.parseUrl(this.campaignUrl); }
  @Input() showAmounts = true;
  @Input() editAction?: () => void;
  get initials(): string {
    return this.ambassador.fullName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('');
  }
}
