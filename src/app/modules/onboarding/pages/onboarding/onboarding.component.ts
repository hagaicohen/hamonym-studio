import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.css']
})
export class OnboardingComponent {

  selectedType = '';

  constructor(
    private router: Router
  ) {}

  selectType(type: string): void {

    this.selectedType = type;
  }

  continue(): void {

    if (!this.selectedType) {

      return;
    }

    console.log(
      this.selectedType
    );

    this.router.navigate([
      '/dashboard'
    ]);
  }
}