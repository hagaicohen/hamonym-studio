import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Json, MODULE_LABELS, ManagementModelService, ModuleType } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { MANAGEMENT_FIELDS } from '../fields';
import { CollectionComponent } from '../content/collection.component';
import { RewardEditorComponent } from '../content/reward-editor.component';
import { SponsorEditorComponent } from '../content/sponsor-editor.component';
import { UpdateEditorComponent } from '../content/update-editor.component';
import { IncomingFormComponent } from '../content/incoming-form.component';

type ContentType = Extract<ModuleType, 'rewards' | 'sponsors' | 'updates' | 'comments'>;
/** Modules edited on this page (races: "ניהול מירוץ"; ambassadors and donors: "תרומות וגיוס"). */
const CONTENT_TYPES: ContentType[] = (Object.keys(MODULE_LABELS) as ModuleType[]).filter((x): x is ContentType => !['ambassadors', 'donors'].includes(x));

/**
 * "תוכן הקמפיין" (old engine `contentPage` + `moduleForm`): one tab per content module, its
 * visibility switch and its items as a compact collection with an edit dialog (comments: the
 * review list). Like the old markup, the page is rebuilt on every redraw (ManagementShellComponent),
 * from the campaign state as it is then; view, search and sort of the lists survive it.
 */
@Component({
  selector: 'ham-mgmt-content',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS, CollectionComponent, RewardEditorComponent, SponsorEditorComponent, UpdateEditorComponent, IncomingFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './content-page.component.html'
})
export class ContentPageComponent implements OnInit {
  private readonly view = inject(ManagementViewService);
  private readonly model = inject(ManagementModelService);
  readonly types = CONTENT_TYPES;
  readonly labels = MODULE_LABELS;
  active: ContentType = 'rewards';
  items: Json[] = [];

  ngOnInit(): void {
    if (!(CONTENT_TYPES as string[]).includes(this.view.activeModule())) this.view.activeModule.set(CONTENT_TYPES[0]);
    this.active = this.view.activeModule() as ContentType;
    this.items = this.model.partsFor(this.active);
  }
}
