import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * MIGRATED TO ANGULAR: original wizard desktop/mobile + layout selector.
 * HTML and existing class names remain aligned with v0.1.301.
 * State writes are forwarded to the legacy wizard through ONE temporary event,
 * since the remaining preview renderer still owns the historical campaign state.
 * BACKEND-WRITE: Future CampaignDraft adapter, NOT a direct API call here.
 */
@Component({
  selector: 'ham-wizard-preview-controls',
  standalone: true,
  templateUrl: './wizard-preview-controls.component.html',
  styleUrl: './wizard-preview-controls.component.css'
})
export class WizardPreviewControlsComponent {
  @Input() device: 'desktop' | 'mobile' = 'mobile';
  @Input() simple = false;
  @Input() heroCard = false;
  @Output() deviceChange = new EventEmitter<'desktop' | 'mobile'>();
  @Output() layoutChange = new EventEmitter<'panorama' | 'heroCard'>();
  menuOpen = false;

  get layoutText(): string {
    return 'פריסה: ' + (this.simple ? 'דף תרומה פשוט' : this.heroCard ? 'כרטיס על ה־Hero' : 'פריסה רגילה');
  }

  chooseDevice(device: 'desktop' | 'mobile'): void {
    if (this.device === device) return;
    this.menuOpen = false;
    this.dispatch('device', device);
  }

  chooseLayout(layout: 'panorama' | 'heroCard'): void {
    if (this.simple) return;
    this.menuOpen = false;
    this.dispatch('layout', layout);
  }

  toggleMenu(): void { if (!this.simple && this.device !== 'mobile') this.menuOpen = !this.menuOpen; }
  closeMenu(): void { this.menuOpen = false; }

  private dispatch(action: 'device' | 'layout', value: string): void {
    if (action === 'device') this.deviceChange.emit(value as 'desktop' | 'mobile');
    else this.layoutChange.emit(value as 'panorama' | 'heroCard');
  }
}
