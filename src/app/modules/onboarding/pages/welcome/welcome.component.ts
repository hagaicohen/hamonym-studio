import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Building2, HandHeart, Megaphone, ChevronLeft } from 'lucide-angular';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../../../../shared/ui/design-system/icons';
import { Router } from '@angular/router';
import { TopbarComponent } from '../../../../core/layout/topbar/topbar.component';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, TopbarComponent, LucideAngularModule],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.css'],
})
export class WelcomeComponent {
  private router = inject(Router);
  private auth = inject(AuthService);
  get authenticated(): boolean { return !!this.auth.getToken(); }
  get fullName(): string { return this.authenticated ? this.auth.currentUser()?.full_name || this._loadUserName() : ''; }
  get userName(): string { return this.fullName.split(' ')[0]; }

  readonly iconSize = HM_ICON_SIZE.lg;
  readonly arrowSize = HM_ICON_SIZE.md;
  readonly iconStroke = HM_ICON_STROKE;
  readonly ChevronLeft = ChevronLeft;

  readonly cards = [
    {
      id: 'org',
      icon: Building2,
      title: 'הקמת עמותה / ארגון',
      description: 'פתח עמותה או ארגון כדי לגייס תרומות',
      route: '/organization-registration',
    },
    {
      id: 'donate',
      icon: HandHeart,
      title: 'מציאת קמפיין לתרומה',
      description: 'חפש פרויקטים ועמותות לתמיכה',
      route: '/campaigns/discover',
    },
    {
      id: 'ambassador',
      icon: Megaphone,
      title: 'הצטרפות כשגריר',
      description: 'גייס תרומות עבור קמפיין קיים',
      route: '/campaigns/discover',
      queryParams: { mode: 'ambassador' },
    },
  ] as const;

  select(card: (typeof this.cards)[number]): void {
    this.router.navigate([card.route], {
      queryParams: 'queryParams' in card ? card.queryParams : {},
    });
  }

  private _loadUserName(): string {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw)?.full_name ?? '' : '';
    } catch {
      return '';
    }
  }
}
