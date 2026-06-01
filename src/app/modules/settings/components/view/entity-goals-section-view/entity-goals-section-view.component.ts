import { Component, Input, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, TrendingUp } from 'lucide-angular';

@Component({
  selector: 'app-entity-goals-section-view',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './entity-goals-section-view.component.html',

  styleUrls: ['./entity-goals-section-view.component.css'],
})
export class EntityGoalsSectionViewComponent {
  @Input()
  entity: any;

  @Output() edit = new EventEmitter<void>();

  readonly TrendingUp = TrendingUp;
}
