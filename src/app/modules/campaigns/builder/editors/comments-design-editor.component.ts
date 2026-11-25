import { Component, Input, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CampaignBlock, CampaignStudioStateService, CommentsBlockData, CommentsTextRole } from '../../services/campaign-studio-state.service';
import { COMMENTS_COUNT_OPTIONS, CommentsDesign, commentsDesign, withCommentsDesign } from '../../utils/comments-design';
import { TextRoleEditorComponent } from '../../../../shared/ui/text-role-editor/text-role-editor.component';
import { StyleRoleEditorComponent, StyleRoleOverride } from '../../../../shared/ui/style-role-editor/style-role-editor.component';
import { TextStyle } from '../../../../shared/models/text-style.model';

// How the comments section looks on the page. Only the look and the section's
// own title/description: the comments themselves belong to the campaign and
// are moderated from the campaign dashboard.
@Component({
  selector: 'app-comments-design-editor',
  standalone: true,
  imports: [TranslocoPipe, TextRoleEditorComponent, StyleRoleEditorComponent],
  templateUrl: './comments-design-editor.component.html',
  styleUrl: './comments-design-editor.component.css',
})
export class CommentsDesignEditorComponent {
  private readonly state = inject(CampaignStudioStateService);
  @Input({ required: true }) block!: CampaignBlock;

  readonly styles = [
    { value: 'cards', label: 'builder.commentsDesign.styleCards' },
    { value: 'list', label: 'builder.commentsDesign.styleList' },
    { value: 'carousel', label: 'builder.commentsDesign.styleCarousel' },
  ] as const;
  readonly counts = COMMENTS_COUNT_OPTIONS;
  readonly textRoles: { role: CommentsTextRole; label: string }[] = [
    { role: 'sectionTitle', label: 'builder.commentsDesign.roleTitle' },
    { role: 'subtitle', label: 'builder.commentsDesign.roleDescription' },
    { role: 'commentAuthor', label: 'builder.commentsDesign.roleAuthor' },
    { role: 'commentBody', label: 'builder.commentsDesign.roleBody' },
  ];
  open: Record<'layout' | 'colors' | 'texts', boolean> = { layout: true, colors: false, texts: false };

  get data(): CommentsBlockData { return (this.block.data ?? {}) as CommentsBlockData; }
  get design(): CommentsDesign { return commentsDesign(this.data); }

  set(patch: Partial<CommentsBlockData>): void {
    this.state.updateBlockData(this.block.id, withCommentsDesign(this.data, patch));
  }

  setSurface(kind: 'section' | 'card', override: StyleRoleOverride | undefined): void {
    const surfaces = { ...(this.data.surfaceStyles ?? {}) };
    if (override && Object.keys(override).length) surfaces[kind] = override; else delete surfaces[kind];
    this.set({ surfaceStyles: surfaces });
  }

  setText(role: CommentsTextRole, override: Partial<TextStyle> | undefined): void {
    const roles = { ...(this.data.textStyles ?? {}) };
    if (override && Object.keys(override).length) roles[role] = override; else delete roles[role];
    this.set({ textStyles: roles });
  }

  toggle(section: 'layout' | 'colors' | 'texts'): void { this.open[section] = !this.open[section]; }
}
