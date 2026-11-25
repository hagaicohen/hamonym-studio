import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, createComponent, inject } from '@angular/core';
import { WizardService } from './wizard.service';
import { WizardComponent } from './wizard.component';
import { WizardContext } from './wizard.types';
import { WorkspaceResizeService } from '../layout/workspace-resize.service';

type WizardWindow = Window & { hamAngularWizardContext?: WizardContext; hamOpenEntryWizard?: () => void };

/**
 * Opens the first-run wizard for an unfinished campaign. The core's
 * "reset campaign" action reopens it through window.hamOpenEntryWizard.
 */
@Injectable({ providedIn: 'root' })
export class CampaignWizardEngineService {
  private readonly wizard = inject(WizardService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly resize = inject(WorkspaceResizeService);
  private started = false;
  private view?: ComponentRef<WizardComponent>;

  start(): void {
    if (this.started) return;
    const win = window as WizardWindow;
    const context = win.hamAngularWizardContext;
    if (!context?.readState) throw new Error('Campaign wizard context missing');
    this.wizard.attach(context);
    win.hamOpenEntryWizard = () => this.open();
    this.started = true;
    this.open();
  }

  open(): void {
    this.close();
    // A reset may already have removed the previous host element.
    document.getElementById('hwWizard')?.remove();
    if (!this.wizard.prepare()) return;
    const ref = createComponent(WizardComponent, { environmentInjector: this.injector });
    ref.instance.finished.subscribe(asExistingDemo => {
      this.close();
      this.wizard.afterFinish(asExistingDemo);
    });
    document.body.appendChild(ref.location.nativeElement);
    this.appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    this.view = ref;
    this.resize.setupWizard();
  }

  private close(): void {
    if (!this.view || this.view.hostView.destroyed) { this.view = undefined; return; }
    this.appRef.detachView(this.view.hostView);
    this.view.destroy();
    this.view = undefined;
  }
}
