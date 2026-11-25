import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PublicationChecksComponent } from './publication-checks.component';

/** Publication is supplied by the HAMONYM host, using its authenticated APIs. */
@Component({
  selector: 'ham-mgmt-publish',
  standalone: true,
  imports: [PublicationChecksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './publish-page.component.html'
})
export class PublishPageComponent {}
