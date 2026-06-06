import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Monitor, Smartphone, X, Maximize2, Minimize2, ArrowRight,
} from 'lucide-angular';
import { StudioUiService, DeviceMode } from '../../services/studio-ui.service';

type SaveState = 'idle' | 'saving' | 'saved';

@Component({
  selector: 'app-campaign-studio-topbar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './campaign-studio-topbar.component.html',
  styleUrls: ['./campaign-studio-topbar.component.css'],
})
export class CampaignStudioTopbarComponent {
  readonly Monitor    = Monitor;
  readonly Smartphone = Smartphone;
  readonly X          = X;
  readonly Maximize2  = Maximize2;
  readonly Minimize2  = Minimize2;
  readonly ArrowRight = ArrowRight;

  ui = inject(StudioUiService);
  saveState: SaveState = 'idle';

  closeStudio(): void { history.back(); }
  setDevice(mode: DeviceMode): void { this.ui.setDevice(mode); }
  toggleFullscreen(): void { this.ui.setFullscreen(!this.ui.isFullscreen); }
  exitFullscreen(): void { this.ui.setFullscreen(false); }

  saveDraft(): void {
    if (this.saveState !== 'idle') return;
    this.saveState = 'saving';
    setTimeout(() => {
      this.saveState = 'saved';
      setTimeout(() => { this.saveState = 'idle'; }, 2000);
    }, 1000);
  }
}
