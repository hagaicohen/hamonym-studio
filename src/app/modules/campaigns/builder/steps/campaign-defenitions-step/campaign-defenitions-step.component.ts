import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Settings } from 'lucide-angular';
import { CampaignStudioStateService } from '../../../../campaigns/services/campaign-studio-state.service';

type ActiveTab = 'terminal' | 'tracking' | 'advanced';
type TerminalState = 'connected' | 'missing' | 'invalid';
type ConnectionState = 'idle' | 'loading' | 'success' | 'failed';

@Component({
  selector: 'app-campaign-defenitions-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-defenitions-step.component.html',
  styleUrl: './campaign-defenitions-step.component.css',
})
export class CampaignDefenitionsStepComponent {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  readonly Settings = Settings;

  /*
  |--------------------------------------------------------------------------
  | DEMO
  |--------------------------------------------------------------------------
  */

  activeTab: ActiveTab = 'terminal';
  terminalState: TerminalState = 'connected';
  connectionResultDemo: 'success' | 'failed' = 'success';

  /*
  |--------------------------------------------------------------------------
  | TERMINAL (read from entity — display only)
  |--------------------------------------------------------------------------
  */

  providerName = 'CardCom';
  terminalNumber = '123456';

  /*
  |--------------------------------------------------------------------------
  | CONNECTION
  |--------------------------------------------------------------------------
  */

  connectionState: ConnectionState = 'idle';

  sync(): void { this.campaignState.sync(); }

  /*
  |--------------------------------------------------------------------------
  | TABS
  |--------------------------------------------------------------------------
  */

  setTab(tab: ActiveTab): void {
    this.activeTab = tab;
  }

  /*
  |--------------------------------------------------------------------------
  | DEMO STATES
  |--------------------------------------------------------------------------
  */

  setTerminalState(state: TerminalState): void {
    this.terminalState = state;
    this.connectionState = 'idle';
  }

  setConnectionDemoResult(result: 'success' | 'failed'): void {
    this.connectionResultDemo = result;
    this.connectionState = 'idle';
  }

  /*
  |--------------------------------------------------------------------------
  | CONNECTION TEST
  |--------------------------------------------------------------------------
  */

  checkConnection(): void {
    if (this.connectionState === 'loading') return;
    this.connectionState = 'loading';
    setTimeout(() => {
      this.connectionState = this.connectionResultDemo === 'success' ? 'success' : 'failed';
      setTimeout(() => { this.connectionState = 'idle'; }, 2500);
    }, 2000);
  }

  get canCheckConnection(): boolean {
    return this.terminalState !== 'missing';
  }
}
