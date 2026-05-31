import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { CampaignEditorComponent }
from '../../editor/campaign-editor/campaign-editor.component';

import { CampaignPreviewComponent }
from '../../preview/campaign-preview/campaign-preview.component';

import { CampaignStudioTopbarComponent }
from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';

@Component({
  selector: 'app-campaign-studio-page',

  standalone: true,

  imports: [

    CampaignStudioTopbarComponent,

    CampaignEditorComponent,

    CampaignPreviewComponent,

  ],

  templateUrl:
    './campaign-studio-page.component.html',

  styleUrls: [
    './campaign-studio-page.component.scss',
  ],
})
export class CampaignStudioPageComponent {

  constructor(
    private router: Router
  ) {}

  goBack(): void {

    this.router.navigate([
      '/campaigns'
    ]);

  }

}