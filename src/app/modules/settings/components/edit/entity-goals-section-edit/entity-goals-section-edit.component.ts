import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

@Component({
  selector: 'app-entity-goals-section-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl:
    './entity-goals-section-edit.component.html',

  styleUrls: [
    './entity-goals-section-edit.component.css'
  ]
})
export class EntityGoalsSectionEditComponent {

  @Input()
  entity: any;

  @Output()
  entityChange =
    new EventEmitter<any>();

  updateField(
    field: string,
    value: any
  ): void {

    this.entityChange.emit({
      [field]: value
    });
  }

  onMoneyInput(
    field:
      'monthly_goal' |
      'yearly_goal',

    value: string
  ): void {

    const numericValue =
      value.replace(/\D/g, '');

    const formattedValue =
      Number(
        numericValue || 0
      ).toLocaleString('en-US');

    this.updateField(
      field,
      numericValue
        ? formattedValue
        : ''
    );
  }

  get hasGoals(): boolean {

    return !!(

      this.entity?.monthly_goal &&
      this.entity?.yearly_goal

    );
  }

}