import { Component } from '@angular/core';

import {
  LucideAngularModule,
  Check,
  LoaderCircle,
  Monitor,
  Save,
  Smartphone,
  X,
} from 'lucide-angular';

type SaveState = 'idle' | 'saving' | 'saved';

@Component({
  selector: 'app-campaign-studio-topbar',

  standalone: true,

  imports: [LucideAngularModule],

  templateUrl: './campaign-studio-topbar.component.html',

  styleUrls: ['./campaign-studio-topbar.component.css'],
})
export class CampaignStudioTopbarComponent {
  readonly Monitor = Monitor;

  readonly Smartphone = Smartphone;

  readonly X = X;

  readonly Save = Save;

  readonly Check = Check;

  readonly LoaderCircle = LoaderCircle;

  isMobilePreview = false;

  saveState: SaveState = 'idle';

  closeStudio(): void {
    history.back();
  }

  setDesktop(): void {
    this.isMobilePreview = false;
  }

  setMobile(): void {
    this.isMobilePreview = true;
  }

  saveDraft(): void {
    if (this.saveState !== 'idle') {
      return;
    }

    this.saveState = 'saving';

    setTimeout(() => {
      this.saveState = 'saved';

      setTimeout(() => {
        this.saveState = 'idle';
      }, 2000);
    }, 1000);
  }
}
