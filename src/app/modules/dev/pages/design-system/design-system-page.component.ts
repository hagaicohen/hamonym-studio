import { Component } from '@angular/core';
import { LucideAngularModule, Handshake, HandCoins, Users, Megaphone, Inbox, SearchX } from 'lucide-angular';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../../../../shared/ui/design-system/icons';
import { ENTITY_CATEGORIES } from '../../../../shared/config/entity-categories';
import { CategorySelectorComponent } from '../../../../shared/ui/category-picker/category-selector.component';

/* Local design-system showcase. Registered only in non-production builds and
   behind devOnlyGuard; reads no data and calls no API. */
@Component({
  selector: 'app-design-system-page',
  standalone: true,
  imports: [LucideAngularModule, EmptyStateComponent, CategorySelectorComponent],
  templateUrl: './design-system-page.component.html',
  styleUrl: './design-system-page.component.css',
})
export class DesignSystemPageComponent {
  readonly Handshake = Handshake;
  readonly HandCoins = HandCoins;
  readonly Users = Users;
  readonly Megaphone = Megaphone;
  readonly Inbox = Inbox;
  readonly SearchX = SearchX;
  readonly stroke = HM_ICON_STROKE;

  readonly iconSizes = Object.entries(HM_ICON_SIZE).map(([name, px]) => ({ name, px }));
  readonly brand = ['50', '100', '200', '300', '400', '600', '700', '800'];
  readonly semantic = ['success', 'warning', 'danger', 'info'];
  readonly spaces = ['1', '2', '3', '4', '5', '6', '8', '10', '12'];
  readonly type = [
    { token: '2xl', weight: 'bold' }, { token: 'xl', weight: 'bold' }, { token: 'lg', weight: 'bold' },
    { token: 'base', weight: 'semibold' }, { token: 'md', weight: 'regular' }, { token: 'sm', weight: 'regular' },
    { token: 'xs', weight: 'medium' },
  ];
  readonly radii = ['sm', 'md', 'lg', 'full'];
  readonly shadows = ['sm', 'md', 'lg'];

  readonly categories = ENTITY_CATEGORIES;
  selectedCategories: string[] = ['education', 'mental-health'];
}
