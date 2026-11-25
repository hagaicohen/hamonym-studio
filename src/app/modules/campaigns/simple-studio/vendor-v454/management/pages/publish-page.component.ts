import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReadyBlockComponent } from './readiness-blocks.component';

/** "בדיקה ופרסום": readiness and the (demo-blocked) publishing conditions. */
@Component({
  selector: 'ham-mgmt-publish',
  standalone: true,
  imports: [ReadyBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './publish-page.component.html'
})
export class PublishPageComponent {}
