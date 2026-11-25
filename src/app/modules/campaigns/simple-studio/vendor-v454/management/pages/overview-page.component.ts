import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ManagementViewService } from '../management-view.service';
import { ReadyBlockComponent } from './readiness-blocks.component';

/** "סקירה": readiness summary and shortcuts. Navigation buttons use the shared data-hu-* commands. */
@Component({
  selector: 'ham-mgmt-overview',
  standalone: true,
  imports: [ReadyBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview-page.component.html'
})
export class OverviewPageComponent { readonly view = inject(ManagementViewService); }
