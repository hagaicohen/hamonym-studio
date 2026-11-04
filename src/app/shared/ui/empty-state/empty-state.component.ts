import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../design-system/icons';

/** Shared empty state: line icon, title, optional description and actions (projected). */
@Component({
  selector: 'hm-empty-state',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input({ required: true }) icon!: LucideIconData;
  @Input({ required: true }) title!: string;
  @Input() description = '';
  @Input() size: 'default' | 'compact' = 'default';
  @Input() headingLevel: 2 | 3 | 4 = 2;

  readonly stroke = HM_ICON_STROKE;

  get iconSize(): number {
    return this.size === 'compact' ? HM_ICON_SIZE.md : HM_ICON_SIZE.lg;
  }
}
