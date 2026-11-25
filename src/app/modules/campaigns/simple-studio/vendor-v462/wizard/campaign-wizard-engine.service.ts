import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, createComponent, inject } from '@angular/core';
import { WizardService } from './wizard.service';
import { WizardComponent } from './wizard.component';
import { WizardContext } from './wizard.types';
import { WorkspaceResizeService } from '../layout/workspace-resize.service';
import { EditorService } from '../core/editor.service';

import { studioAdopt } from '../core/studio-session';

/**
 * Opens the first-run wizard for an unfinished campaign; the toolbar's reset reopens it (`open`).
 */
@Injectable({ providedIn: 'root' })
export class CampaignWizardEngineService {
  private readonly wizard = inject(WizardService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly resize = inject(WorkspaceResizeService);
  private readonly editor = inject(EditorService);
  private started = false;
  private view?: ComponentRef<WizardComponent>;

  start(): void {
    if (this.started) return;
    this.wizard.attach(this.editor.context as WizardContext);
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
    document.body.appendChild(studioAdopt(ref.location.nativeElement));
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
