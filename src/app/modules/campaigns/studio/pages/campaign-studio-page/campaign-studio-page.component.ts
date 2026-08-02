import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import { CampaignEditorComponent }       from '../../editor/campaign-editor/campaign-editor.component';
import { CampaignPreviewComponent }      from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioTopbarComponent } from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';
import { TemplatePickerComponent, TemplateSelection } from '../../../builder/template-picker/template-picker.component';
import { CampaignPresetPickerComponent } from '../../../builder/preset-picker/campaign-preset-picker.component';
import { StudioUiService }               from '../../services/studio-ui.service';
import { CampaignApiService }            from '../../../services/campaign-api.service';
import { CampaignStudioStateService, PresetId } from '../../../services/campaign-studio-state.service';
import { AppLoaderService }              from '../../../../../core/services/app-loader.service';

@Component({
  selector: 'app-campaign-studio-page',
  standalone: true,
  imports: [
    CommonModule,
    CampaignStudioTopbarComponent,
    CampaignEditorComponent,
    CampaignPreviewComponent,
    TemplatePickerComponent,
    CampaignPresetPickerComponent,
  ],
  templateUrl: './campaign-studio-page.component.html',
  styleUrls: ['./campaign-studio-page.component.css'],
})
export class CampaignStudioPageComponent implements OnInit {
  private router       = inject(Router);
  private route        = inject(ActivatedRoute);
  private campaignApi  = inject(CampaignApiService);
  private stateService = inject(CampaignStudioStateService);
  private loader       = inject(AppLoaderService);
  ui = inject(StudioUiService);

  showPresetPicker = false;
  showTemplatePicker = false;

  // Set when the campaign fails to load (deleted, or the current user/entity
  // no longer has access — getCampaignById returns null rather than a 404 in
  // that case). Rendering the editor anyway used to silently fall back to
  // CampaignStudioStateService's blank default draft (no id) — indistinguishable
  // from a real campaign to the user, until the first step-save created a
  // brand-new duplicate campaign instead of updating the (nonexistent) one,
  // and the app-loader overlay got stuck forever (see navigateToStep in
  // campaign-editor.component.ts). See docs/DECISIONS.md.
  loadErrorMessage: string | null = null;

  // ?returnStep=4 — set when arriving back from the "create a partner
  // mid-campaign" side-trip to /partners (see partner-link-modal's 'create'
  // tab / §14). Read once on load; CampaignEditorComponent applies it.
  returnStep?: number;

  ngOnInit(): void {
    const returnStepParam = this.route.snapshot.queryParamMap.get('returnStep');
    if (returnStepParam) this.returnStep = parseInt(returnStepParam, 10);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.campaignApi.getById(id).subscribe({
        next: (data) => {
          if (!data?.id) {
            this.loadErrorMessage = 'לא נמצא קמפיין כזה, או שאין לכם גישה אליו.';
            this.loader.hide();
            return;
          }
          this.stateService.loadDraft(data);
          this.loader.hide();
        },
        error: () => {
          this.loadErrorMessage = 'לא ניתן היה לטעון את הקמפיין. נסו שוב.';
          this.loader.hide();
        },
      });
    } else {
      this.stateService.reset();
      this.loader.hide();
      // Preset picker (content: what kind of campaign) comes before the
      // template picker (visual style) — same /campaigns/create flow, no
      // separate route/confirmation screen. See CAMPAIGN_PRESETS_VISION.md §3.
      this.showPresetPicker = true;
    }
  }

  onPresetSelected(presetId: PresetId): void {
    this.stateService.applyPreset(presetId);
    this.showPresetPicker = false;
    this.showTemplatePicker = true;
  }

  onTemplateSelected(selection: TemplateSelection): void {
    const { template, palette } = selection;
    this.stateService.applyTemplate(
      template.createBlocks(palette),
      template.buildTheme(palette),
      template.layoutMode,
      template.id,
      template.heroPlacement,
    );
    this.showTemplatePicker = false;
  }

  onTemplateSkipped(): void {
    this.showTemplatePicker = false;
  }

  goBack(): void { this.router.navigate(['/campaigns']); }
}
