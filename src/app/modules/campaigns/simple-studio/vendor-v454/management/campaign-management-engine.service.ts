import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, Type, createComponent, inject } from '@angular/core';
import { initializeLegacyManagement } from './management-engine';
import { ManagementContext, ManagementModelService } from './management-model.service';
import { ManagementViewService } from './management-view.service';
import { ManagementEditService } from './management-edit.service';
import { ManagementCommandsService } from './management-commands.service';
import { ManagementShellComponent } from './shell/management-shell.component';
import { ReadinessDrawerComponent } from './shell/readiness-drawer.component';
import { RewardPreviewService } from './content/reward-preview.component';
import { CalendarService } from './calendar/calendar.service';
import { ManagementInputService } from './management-input.service';

/** Starts the management screen: typed data layer, Angular frame and pages, then the remaining engine. */
@Injectable({ providedIn: 'root' })
export class CampaignManagementEngineService {
  private readonly model = inject(ManagementModelService);
  private readonly view = inject(ManagementViewService);
  private readonly commands = inject(ManagementCommandsService);
  private readonly edit = inject(ManagementEditService);
  private readonly rewardPreview = inject(RewardPreviewService);
  private readonly calendar = inject(CalendarService);
  private readonly input = inject(ManagementInputService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly refs: ComponentRef<unknown>[] = [];
  private started = false;

  start(): void {
    if (this.started) return;
    const context = (window as Window & { hamAngularMediaContext?: ManagementContext }).hamAngularMediaContext;
    if (!context?.readState) throw new Error('Management requires initialized campaign context');
    this.model.attach(context);
    // The engine calls mountShell at the exact point where it used to insert the frame markup,
    // so start-up ordering (host context, first render) is unchanged.
    initializeLegacyManagement(context, this.model, this.view, this.edit, () => this.mountShell(), () => this.calendar.start(), () => this.input.start());
    this.started = true;
  }

  private mountShell(): void {
    const workspace = document.querySelector('.workspace');
    if (!workspace) throw new Error('Management requires the studio workspace');
    const aside = document.createElement('aside');
    workspace.prepend(aside);
    this.mount(ManagementShellComponent, aside);
    const overlay = document.createElement('div');
    document.body.append(overlay);
    this.mount(ReadinessDrawerComponent, overlay);
    this.commands.start();
    this.rewardPreview.start();
  }

  private mount<T>(component: Type<T>, host: Element): void {
    const ref = createComponent(component, { environmentInjector: this.injector, hostElement: host });
    this.appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    this.refs.push(ref);
  }
}
