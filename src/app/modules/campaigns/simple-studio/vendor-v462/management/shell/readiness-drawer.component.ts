import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ManagementViewService } from '../management-view.service';
import { PublicationChecksComponent } from '../pages/publication-checks.component';

/** Readiness and publishing drawer, mounted on `div#huOverlay` at the end of <body>. */
@Component({
  selector: 'ham-readiness-drawer',
  standalone: true,
  imports: [PublicationChecksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './readiness-drawer.component.html',
  host: { class: 'hu-overlay', id: 'huOverlay', '[hidden]': '!view.drawerOpen()' }
})
export class ReadinessDrawerComponent { readonly view = inject(ManagementViewService); }
