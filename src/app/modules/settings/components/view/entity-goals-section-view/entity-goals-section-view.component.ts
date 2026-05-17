import {
  Component,
  Input
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

@Component({
  selector: 'app-entity-goals-section-view',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl:
    './entity-goals-section-view.component.html',

  styleUrls: [
    './entity-goals-section-view.component.css'
  ]
})
export class EntityGoalsSectionViewComponent {

  @Input()
  entity: any;

}