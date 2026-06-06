import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { CampaignEditorComponent }    from '../../editor/campaign-editor/campaign-editor.component';
import { CampaignPreviewComponent }   from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioTopbarComponent } from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';
import { StudioUiService }            from '../../services/studio-ui.service';

@Component({
  selector: 'app-campaign-studio-page',
  standalone: true,
  imports: [
    CommonModule,
    CampaignStudioTopbarComponent,
    CampaignEditorComponent,
    CampaignPreviewComponent,
  ],
  templateUrl: './campaign-studio-page.component.html',
  styleUrls: ['./campaign-studio-page.component.css'],
})
export class CampaignStudioPageComponent {
  private router = inject(Router);
  ui = inject(StudioUiService);

  goBack(): void { this.router.navigate(['/campaigns']); }
}
