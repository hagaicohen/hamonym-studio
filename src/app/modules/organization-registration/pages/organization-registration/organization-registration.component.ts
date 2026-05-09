import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StepEntityComponent } from '../../components/step-entity/step-entity.component';
import { StepProfileComponent } from '../../components/step-profile/step-profile.component';

@Component({
  selector: 'app-organization-registration',
  standalone: true,
  imports: [
    CommonModule,
    StepEntityComponent,
    StepProfileComponent
  ],
  templateUrl: './organization-registration.component.html',
  styleUrls: ['./organization-registration.component.css']
})
export class OrganizationRegistrationComponent {

  currentStep = 1;

  nextStep(): void {

    this.currentStep++;

  }

  previousStep(): void {

    this.currentStep--;

  }

}