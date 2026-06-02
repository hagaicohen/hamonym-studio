import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type ActiveTab =
  | 'terminal'
  | 'tracking'
  | 'advanced';

type TerminalState =
  | 'connected'
  | 'missing'
  | 'invalid';

type ConnectionState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'failed';

@Component({
  selector: 'app-campaign-defenitions-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl:
    './campaign-defenitions-step.component.html',
  styleUrl:
    './campaign-defenitions-step.component.css'
})
export class CampaignDefenitionsStepComponent {

  /*
  |--------------------------------------------------------------------------
  | DEMO
  |--------------------------------------------------------------------------
  |
  | שנה ערכים כאן כדי לבדוק מצבים שונים
  |
  */

  activeTab: ActiveTab =
    'terminal';

  terminalState:
    TerminalState =
    'connected';

  connectionResultDemo:
    'success'
    | 'failed' =
    'success';

  /*
  |--------------------------------------------------------------------------
  | TERMINAL
  |--------------------------------------------------------------------------
  */

  providerName =
    'CardCom';

  terminalNumber =
    '123456';

  /*
  |--------------------------------------------------------------------------
  | CONNECTION
  |--------------------------------------------------------------------------
  */

  connectionState:
    ConnectionState =
    'idle';

  /*
  |--------------------------------------------------------------------------
  | TRACKING
  |--------------------------------------------------------------------------
  */

  googleAnalyticsId =
    'G-XXXXXXXXXX';

  facebookPixelId =
    '';

  googleAdsId =
    '';

  hotjarSiteId =
    '';

  /*
  |--------------------------------------------------------------------------
  | ADVANCED
  |--------------------------------------------------------------------------
  */

  personalCampaignsEnabled =
    false;

  /*
  |--------------------------------------------------------------------------
  | TABS
  |--------------------------------------------------------------------------
  */

  setTab(
    tab: ActiveTab
  ): void {

    this.activeTab =
      tab;
  }

  /*
  |--------------------------------------------------------------------------
  | DEMO STATES
  |--------------------------------------------------------------------------
  */

  setTerminalState(
    state: TerminalState
  ): void {

    this.terminalState =
      state;

    this.connectionState =
      'idle';
  }

  setConnectionDemoResult(
    result:
      'success'
      | 'failed'
  ): void {

    this.connectionResultDemo =
      result;

    this.connectionState =
      'idle';
  }

  /*
  |--------------------------------------------------------------------------
  | CONNECTION TEST
  |--------------------------------------------------------------------------
  */

  checkConnection(): void {

    if (
      this.connectionState ===
      'loading'
    ) {

      return;
    }

    this.connectionState =
      'loading';

    setTimeout(() => {

      if (
        this.connectionResultDemo ===
        'success'
      ) {

        this.connectionState =
          'success';

      }

      else {

        this.connectionState =
          'failed';

      }

      setTimeout(() => {

        this.connectionState =
          'idle';

      }, 2500);

    }, 2000);

  }

  /*
  |--------------------------------------------------------------------------
  | HELPERS
  |--------------------------------------------------------------------------
  */

  get canCheckConnection():
    boolean {

    return (
      this.terminalState !==
      'missing'
    );
  }

}