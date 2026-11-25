import { Component, Input, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CampaignBlock, CampaignStudioStateService, CountdownBlockData } from '../../services/campaign-studio-state.service';
import { isoToLocalInput, localInputToIso } from '../../utils/countdown';
import { TextRoleEditorComponent } from '../../../../shared/ui/text-role-editor/text-role-editor.component';
import { StyleRoleEditorComponent, StyleRoleOverride } from '../../../../shared/ui/style-role-editor/style-role-editor.component';
import { TextStyle } from '../../../../shared/models/text-style.model';

type Role = 'sectionTitle' | 'value' | 'label';

// The countdown block's settings. The moment is entered in the editor's local
// time and stored as an absolute instant.
@Component({
  selector: 'app-countdown-editor',
  standalone: true,
  imports: [TranslocoPipe, TextRoleEditorComponent, StyleRoleEditorComponent],
  templateUrl: './countdown-editor.component.html',
  styleUrl: './comments-design-editor.component.css',
})
export class CountdownEditorComponent {
  private readonly state = inject(CampaignStudioStateService);
  @Input({ required: true }) block!: CampaignBlock;
  readonly roles: { role: Role; label: string }[] = [
    { role: 'sectionTitle', label: 'builder.countdown.roleTitle' },
    { role: 'value', label: 'builder.countdown.roleValue' },
    { role: 'label', label: 'builder.countdown.roleLabel' },
  ];
  open = { design: false };

  get data(): CountdownBlockData { return (this.block.data ?? { targetAt: null }) as CountdownBlockData; }
  get localValue(): string { return isoToLocalInput(this.data.targetAt); }
  get timeZone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }

  set(patch: Partial<CountdownBlockData>): void {
    const next: Record<string, unknown> = { ...this.data, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    this.state.updateBlockData(this.block.id, next as unknown as CountdownBlockData);
  }
  setTarget(value: string): void { this.set({ targetAt: localInputToIso(value) }); }
  setSurface(kind: 'section' | 'unit', override: StyleRoleOverride | undefined): void {
    const s = { ...(this.data.surfaceStyles ?? {}) };
    if (override && Object.keys(override).length) s[kind] = override; else delete s[kind];
    this.set({ surfaceStyles: Object.keys(s).length ? s : undefined });
  }
  setText(role: Role, override: Partial<TextStyle> | undefined): void {
    const r = { ...(this.data.textStyles ?? {}) };
    if (override && Object.keys(override).length) r[role] = override; else delete r[role];
    this.set({ textStyles: Object.keys(r).length ? r : undefined });
  }
}
