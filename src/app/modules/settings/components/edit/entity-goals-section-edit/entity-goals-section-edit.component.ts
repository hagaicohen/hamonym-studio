import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-entity-goals-section-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entity-goals-section-edit.component.html',

  styleUrls: ['./entity-goals-section-edit.component.css'],
})
export class EntityGoalsSectionEditComponent {

  @Input()
  entity: any;

  @Output()
  entityChange = new EventEmitter<any>();

  // =====================================================
  // DISPLAY VALUES
  // =====================================================

  monthlyGoalDisplay = '';

  yearlyGoalDisplay = '';

  ngOnChanges(): void {

    this.monthlyGoalDisplay =
      this.formatMoney(
        this.entity?.monthly_goal
      );

    this.yearlyGoalDisplay =
      this.formatMoney(
        this.entity?.yearly_goal
      );

  }

  // =====================================================
  // UPDATE FIELD
  // =====================================================

  updateField(
    field: string,
    value: any
  ): void {

    this.entityChange.emit({

      [field]: value,

    });

  }

  // =====================================================
  // MONEY INPUT
  // =====================================================

  onMoneyInput(
    field:
      'monthly_goal' |
      'yearly_goal',

    value: string,

  ): void {

    const cleanedValue =

      value.replace(/\D/g, '');

    const numericValue =

      Number(cleanedValue);

    const formattedValue =

      cleanedValue
        ? numericValue.toLocaleString('en-US')
        : '';

    // DISPLAY VALUE

    if (
      field === 'monthly_goal'
    ) {

      this.monthlyGoalDisplay =
        formattedValue;

    }

    if (
      field === 'yearly_goal'
    ) {

      this.yearlyGoalDisplay =
        formattedValue;

    }

    // REAL VALUE

    this.updateField(

      field,

      cleanedValue
        ? numericValue
        : null

    );

  }

  // =====================================================
  // FORMAT
  // =====================================================

  formatMoney(value: any): string {

    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {

      return '';

    }

    return Number(value)
      .toLocaleString('en-US');

  }

  // =====================================================
  // VALIDATION
  // =====================================================

  get hasGoals(): boolean {

    return !!(

      this.entity?.monthly_goal &&

      this.entity?.yearly_goal

    );

  }

}