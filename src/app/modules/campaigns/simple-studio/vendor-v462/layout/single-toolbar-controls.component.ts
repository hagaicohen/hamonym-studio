import { Component, inject } from '@angular/core';
import { V209ToolbarComponent } from './v209-toolbar.component';
import { StudioToolbarService } from './studio-toolbar.service';

/** The editor toolbar's preview group (`.ham-single-toolbar`): the device slider and layout menu (v209), the device
 * buttons, the template button and the two "open in browser" buttons. Part of AppComponent's template. */
@Component({
  selector: '[ham-single-toolbar-controls]', standalone: true, imports: [V209ToolbarComponent],
  templateUrl: './single-toolbar-controls.component.html',
  styleUrls: ['./single-toolbar-controls.component.css']
})
export class SingleToolbarControlsComponent {
  readonly toolbar = inject(StudioToolbarService);
  get device(): 'desktop' | 'mobile' { return this.toolbar.device(); }
  chooseDevice(device: 'desktop' | 'mobile'): void { this.toolbar.setDevice(device); }
  chooseTemplate(): void { this.toolbar.openTemplates(!this.toolbar.isDonation()); }
  openPublic(): void { this.toolbar.openPublic(false); }
}
