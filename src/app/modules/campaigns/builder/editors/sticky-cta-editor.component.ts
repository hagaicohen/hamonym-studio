import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { CampaignDraft, CampaignStudioStateService, StickyCtaConfig } from '../../services/campaign-studio-state.service';

// The sticky donate bar (layout.stickyCta): when it shows, its button text and
// colors. Its button opens the same checkout as the page's own donate button.
@Component({
  selector: 'app-sticky-cta-editor',
  standalone: true,
  imports: [AsyncPipe, TranslocoPipe],
  templateUrl: './sticky-cta-editor.component.html',
  styleUrl: './comments-design-editor.component.css',
})
export class StickyCtaEditorComponent {
  private readonly state = inject(CampaignStudioStateService);
  readonly draft$ = this.state.draft$;
  readonly modes = [
    { value: 'scroll', label: 'builder.stickyCta.mode_scroll' },
    { value: 'always', label: 'builder.stickyCta.mode_always' },
    { value: 'inline', label: 'builder.stickyCta.mode_inline' },
    { value: 'hidden', label: 'builder.stickyCta.mode_hidden' },
  ] as const;
  readonly colors = [
    { key: 'background', label: 'builder.stickyCta.background', fallback: '#0f172a' },
    { key: 'textColor', label: 'builder.stickyCta.textColor', fallback: '#ffffff' },
    { key: 'buttonColor', label: 'builder.stickyCta.buttonColor', fallback: '#583cd6' },
  ] as const;

  cfg(draft: CampaignDraft): StickyCtaConfig { return draft.layout.stickyCta ?? {}; }

  setColor(key: 'background' | 'textColor' | 'buttonColor', value: string | undefined): void { this.set({ [key]: value }); }

  set(patch: Partial<StickyCtaConfig>): void {
    const layout = this.state.draft.layout;
    const next: Record<string, unknown> = { ...(layout.stickyCta ?? {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '' || (k === 'mode' && next[k] === 'scroll')) delete next[k];
    const updated = { ...layout };
    if (Object.keys(next).length) updated.stickyCta = next as StickyCtaConfig; else delete updated.stickyCta;
    this.state.patch({ layout: updated });
  }
}
