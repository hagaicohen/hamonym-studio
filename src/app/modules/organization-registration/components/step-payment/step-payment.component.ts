import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';
import { CampaignsRoutingModule } from "../../../campaigns/campaigns-routing.module";

@Component({
  selector: 'app-step-payment',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CampaignsRoutingModule
],
  templateUrl: './step-payment.component.html',
  styleUrls: ['./step-payment.component.css']
})
export class StepPaymentComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  continue =
    new EventEmitter<void>();

  provider = 'cardcom';

  terminalNumber = '';

  apiUsername = '';

  apiPassword = '';

  useExistingTerminal = false;

  isCheckingConnection = false;

  connectionSuccess = false;

  get canContinue(): boolean {

  /* USER CHOSE TO SKIP */

    if (this.useExistingTerminal) {

      return true;

    }

    /* REQUIRE PAYMENT DETAILS */

    return !!(

      this.provider &&
      this.terminalNumber.trim() &&
      this.apiUsername.trim() &&
      this.apiPassword.trim()

    );

  }

  testConnection(): void {

    this.isCheckingConnection = true;

    this.connectionSuccess = false;

    setTimeout(() => {

      this.isCheckingConnection = false;

      this.connectionSuccess = true;

    }, 1200);

  }

}