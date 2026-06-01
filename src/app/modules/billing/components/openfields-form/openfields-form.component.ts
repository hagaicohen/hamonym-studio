// openfields-form.component.ts

import { Component, OnInit, OnDestroy, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { BillingApiService } from '../../services/billing-api.service';

import { BillingService } from '../../../organization-registration/services/billing.service';

import { OrganizationRegistrationStateService } from '../../../organization-registration/services/organization-registration-state.service';

@Component({
  selector: 'app-openfields-form',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './openfields-form.component.html',

  styleUrls: ['./openfields-form.component.css'],
})
export class OpenfieldsFormComponent implements OnInit, OnDestroy {
  private billingApi = inject(BillingApiService);

  private billingService = inject(BillingService);

  private stateService = inject(OrganizationRegistrationStateService);

  lowProfileId = '';

  terminalNumber = '';

  apiName = '';

  isReady = false;

  cvvIframeReady = false;

  /*
    CARD NUMBER REAL IFRAME
    READY STATE
  */

  cardIframeReady = false;

  private transactionStarted = false;

  private boundMessageHandler = this.onMessage.bind(this);

  async ngOnInit(): Promise<void> {
    const config: any = await this.billingApi.initOpenFields().toPromise();

    console.log('OPENFIELDS CONFIG', config);

    this.lowProfileId = config.lowProfileId;

    this.terminalNumber = config.terminalNumber;

    this.apiName = config.apiName;

    console.log('LOW PROFILE CREATED', this.lowProfileId);

    window.addEventListener(
      'message',

      this.boundMessageHandler,
    );

    setTimeout(() => {
      const masterFrame = document.getElementById(
        'CardComMasterFrame',
      ) as HTMLIFrameElement;

      if (!masterFrame?.contentWindow) {
        console.error('MASTER FRAME NOT READY');

        return;
      }

      const iframeMessage = {
        action: 'init',

        cardFieldCSS: `

          body{
            margin:0;
            padding:0;
            background:transparent;
            overflow:hidden;
          }

          .cardNumber{

            width:100%;
            height:54px;

            border:1px solid #dbe2ea;

            border-radius:16px;

            background:#ffffff;

            padding:0 16px;

            margin:0;

            box-sizing:border-box;

            font-size:17px;

            font-family:Arial,sans-serif;

            font-weight:500;

            color:#0f172a;

            direction:rtl;

            text-align:right;

            outline:none;

            line-height:54px;

            background-position:
              left 14px center !important;
          }

          .cardNumber:focus{

            border-color:#2563eb;

            box-shadow:
              0 0 0 4px rgba(37,99,235,.08);
          }

          .cardNumber.invalid{

            border-color:#dc2626;
          }

        `,

        cvvFieldCSS: `

          body{
            margin:0;
            padding:0;
            background:transparent;
            overflow:hidden;
          }

          .cvvField{

            width:100%;
            height:54px;

            border:1px solid #dbe2ea;

            border-radius:16px;

            background:#ffffff;

            padding:0 16px;

            margin:0;

            box-sizing:border-box;

            font-size:17px;

            font-family:Arial,sans-serif;

            font-weight:500;

            color:#0f172a;

            direction:rtl;

            text-align:right;

            outline:none;

            line-height:54px;
          }

          .cvvField:focus{

            border-color:#2563eb;

            box-shadow:
              0 0 0 4px rgba(37,99,235,.08);
          }

          .cvvField.invalid{

            border-color:#dc2626;
          }
        `,

        placeholder: '0000 0000 0000 0000',

        cvvPlaceholder: '123',

        lowProfileCode: this.lowProfileId,
      };

      console.log('INIT OPENFIELDS', iframeMessage);

      masterFrame.contentWindow.postMessage(
        iframeMessage,

        '*',
      );

      this.isReady = true;

      /*
        SHOW REAL CARD FIELD
        ONLY AFTER BOOTSTRAP
      */

      setTimeout(() => {
        this.cardIframeReady = true;

        this.cvvIframeReady = true;
      }, 350);

      console.log('OPENFIELDS READY');
    }, 500);
  }

  async tokenize(): Promise<boolean> {
    if (!this.lowProfileId) {
      console.error('LOW PROFILE NOT READY');

      return false;
    }

    if (this.transactionStarted) {
      console.log('TRANSACTION ALREADY STARTED');

      return false;
    }

    return new Promise((resolve) => {
      const expirationMonth = (
        document.getElementById('expirationMonth') as HTMLInputElement
      )?.value;

      const expirationYear = (
        document.getElementById('expirationYear') as HTMLInputElement
      )?.value;

      const masterFrame = document.getElementById(
        'CardComMasterFrame',
      ) as HTMLIFrameElement;

      if (!masterFrame?.contentWindow) {
        console.error('MASTER FRAME MISSING');

        resolve(false);

        return;
      }

      const timeout = setTimeout(() => {
        console.error('CARDCOM TIMEOUT');

        this.transactionStarted = false;

        window.removeEventListener('message', listener);

        resolve(false);
      }, 15000);

      const listener = (event: MessageEvent) => {
        if (!event?.data) {
          return;
        }

        const msg = event.data;

        console.log('CARDCOM MESSAGE', msg);

        if (msg?.action === 'HandleSubmit') {
          clearTimeout(timeout);

          this.transactionStarted = false;

          window.removeEventListener('message', listener);

          const result = msg.data;

          console.log('CURRENT PATHNAME', window.location.pathname);

          console.log('HANDLE SUBMIT FULL', JSON.stringify(result, null, 2));

          const internalDealNumber =
            result?.InternalDealNumber || result?.TranzactionId || null;

          if (window.location.pathname.includes('/settings/entities/')) {
            const entityId = window.location.pathname.split('/').pop();

            this.billingService
              .createEntityBilling({
                entityId,

                provider: 'cardcom',

                lowProfileId: this.lowProfileId,

                internalDealNumber,

                expMonth: expirationMonth,

                expYear: expirationYear,
              })

              .subscribe({
                next: () => {
                  resolve(true);
                },

                error: (err: any) => {
                  console.error(err);

                  resolve(false);
                },
              });

            return;
          }

          this.stateService.updateState({
            cardcomLowProfileId: this.lowProfileId,

            cardcomInternalDealNumber: internalDealNumber,
          });

          resolve(result?.IsSuccess === true);

          return;
        }

        if (msg?.action === 'HandleEror') {
          clearTimeout(timeout);

          this.transactionStarted = false;

          window.removeEventListener('message', listener);

          console.error('CARDCOM ERROR', msg);

          resolve(false);

          return;
        }
      };

      window.addEventListener('message', listener);

      const payload = {
        action: 'doTransaction',

        lowProfileCode: this.lowProfileId,

        cardOwnerId: '000000000',

        cardOwnerName: 'Hamonym User',

        cardOwnerEmail: 'test@test.com',

        cardOwnerPhone: '0500000000',

        expirationMonth,

        expirationYear,

        numberOfPayments: '1',
      };

      console.log('SEND TO CARDCOM', payload);

      this.transactionStarted = true;

      masterFrame.contentWindow.postMessage(
        payload,

        '*',
      );
    });
  }

  private onMessage(event: MessageEvent): void {
    if (!event?.data) {
      return;
    }

    const data = event.data;

    /*
    console.log(
      'CARDCOM EVENT',
      data
    );
    */
  }

  ngOnDestroy(): void {
    window.removeEventListener(
      'message',

      this.boundMessageHandler,
    );
  }
}
