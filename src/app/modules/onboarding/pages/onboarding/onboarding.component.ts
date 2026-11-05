import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Landmark, Megaphone, BriefcaseBusiness, HandHeart } from 'lucide-angular';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../../../../shared/ui/design-system/icons';
import { Router } from '@angular/router';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.css'],
})
export class OnboardingComponent {
  selectedType = '';
  readonly iconSize = HM_ICON_SIZE.lg;
  readonly iconStroke = HM_ICON_STROKE;
  readonly icons = { organization: Landmark, campaigner: Megaphone, business: BriefcaseBusiness, donor: HandHeart };

  constructor(private router: Router) {}

  selectType(type: string): void {
    this.selectedType = type;
  }

  continue(): void {
    if (!this.selectedType) {
      return;
    }

    console.log(this.selectedType);

    if (
      this.selectedType === 'organization' ||
      this.selectedType === 'fundraiser'
    ) {
      localStorage.setItem('selectedRole', this.selectedType);

      this.router.navigate(['/campaigns']);

      return;
    }

    this.router.navigate(['/dashboard']);
  }
}
