import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import { CampaignEditorComponent }    from '../../editor/campaign-editor/campaign-editor.component';
import { CampaignPreviewComponent }   from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioTopbarComponent } from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';
import { StudioUiService }            from '../../services/studio-ui.service';
import { CampaignApiService }         from '../../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { AppLoaderService }           from '../../../../../core/services/app-loader.service';

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
export class CampaignStudioPageComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private campaignApi = inject(CampaignApiService);
  private stateService = inject(CampaignStudioStateService);
  private loader = inject(AppLoaderService);
  ui = inject(StudioUiService);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.campaignApi.getById(id).subscribe({
        next: (data) => { this.stateService.loadDraft(data); this.loader.hide(); },
        error: ()     => { this.loader.hide(); },
      });
    } else {
      this.stateService.reset();
      this.loader.hide();
    }
  }

  goBack(): void { this.router.navigate(['/campaigns']); }
}
