import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, FileClock, ChevronLeft } from 'lucide-angular';

/**
 * Compact list of the user's incomplete organization registrations (entities
 * still in 'draft'). They are not organizations yet, so they never appear in
 * organization lists or the context selector; each links back to the wizard.
 */
@Component({
  selector: 'app-incomplete-registrations',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './incomplete-registrations.component.html',
  styleUrl: './incomplete-registrations.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncompleteRegistrationsComponent {
  @Input() drafts: any[] = [];

  readonly FileClock = FileClock;
  readonly ChevronLeft = ChevronLeft;

  name(draft: any): string {
    return draft.legal_name || draft.display_name || 'ללא שם';
  }

  date(draft: any): string {
    if (!draft.updated_at) return '';
    const d = new Date(draft.updated_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
}
