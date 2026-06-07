import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  LucideAngularModule,
  Monitor, Smartphone, X, Maximize2, Minimize2, ArrowRight,
} from 'lucide-angular';
import { StudioUiService, DeviceMode } from '../../services/studio-ui.service';
import { CampaignApiService }         from '../../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CurrentEntityService }       from '../../../../../core/services/current-entity.service';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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

  ui             = inject(StudioUiService);
  campaignState  = inject(CampaignStudioStateService);
  private api    = inject(CampaignApiService);
  private entity = inject(CurrentEntityService);
  private router = inject(Router);

  saveState: SaveState = 'idle';

  get title(): string {
    return this.campaignState.draft.title?.trim() || 'קמפיין חדש';
  }

  closeStudio(): void { history.back(); }
  setDevice(mode: DeviceMode): void { this.ui.setDevice(mode); }
  toggleFullscreen(): void { this.ui.setFullscreen(!this.ui.isFullscreen); }
  exitFullscreen(): void { this.ui.setFullscreen(false); }

  saveDraft(): void {
    if (this.saveState !== 'idle') return;
    this.saveState = 'saving';

    const draft = this.campaignState.draft;
    const entityId = this.entity.currentEntity()?.id;

    if (!draft.id && !entityId) {
      this.saveState = 'error';
      setTimeout(() => { this.saveState = 'idle'; }, 3000);
      return;
    }

    const save$ = draft.id
      ? this.api.update(draft.id, draft)
      : this.api.create(entityId, draft);

    save$.subscribe({
      next: (res) => {
        if (!draft.id && res?.id) {
          this.campaignState.patch({ id: res.id });
          this.router.navigate(['/campaigns', res.id, 'edit'], { replaceUrl: true });
        }
        this.saveState = 'saved';
        setTimeout(() => { this.saveState = 'idle'; }, 2000);
      },
      error: () => {
        this.saveState = 'error';
        setTimeout(() => { this.saveState = 'idle'; }, 3000);
      },
    });
  }
}
