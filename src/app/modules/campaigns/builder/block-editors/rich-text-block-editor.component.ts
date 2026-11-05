import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignBlock, CampaignStudioStateService, RichTextBlockData } from '../../services/campaign-studio-state.service';
import { RichTextEditorComponent } from '../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { TextStyleEditorComponent } from '../../../../shared/ui/text-style-editor/text-style-editor.component';
import { TextStyle } from '../../../../shared/models/text-style.model';

// Rich-text block editor, shared by Step 9 and the Studio properties panel.
// 'headingStyle' is the heading-style control Step 9 shows right under the
// block's title field; 'content' is the text itself and its line height.
@Component({
  selector: 'app-rich-text-block-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RichTextEditorComponent, TextStyleEditorComponent],
  templateUrl: './rich-text-block-editor.component.html',
  styleUrl: './block-editor.css',
})
export class RichTextBlockEditorComponent {
  @Input({ required: true }) block!: CampaignBlock;
  @Input() part: 'content' | 'headingStyle' = 'content';
  private state = inject(CampaignStudioStateService);

  asRichText(data: unknown): RichTextBlockData { return data as RichTextBlockData; }

  updateRichText(id: string, content: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    const prev = block?.data as RichTextBlockData;
    this.state.updateBlockData(id, { ...prev, content } as RichTextBlockData);
  }

  updateRichTextLineHeight(id: string, lineHeight: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    const prev = block?.data as RichTextBlockData;
    this.state.updateBlockData(id, { ...prev, lineHeight } as RichTextBlockData);
  }

  // Default look matches what .section-heading already renders today for a
  // block with no headingStyle set (empty color = fall back to
  // primaryColor in the preview) — so picking a style here never causes an
  // unexpected jump for an existing heading.
  private readonly DEFAULT_HEADING_STYLE: TextStyle = { align: 'center', color: '', fontSize: 'lg', position: 'top' };

  richTextHeadingStyle(block: CampaignBlock): TextStyle {
    return (block.data as RichTextBlockData).headingStyle ?? this.DEFAULT_HEADING_STYLE;
  }

  updateRichTextHeadingStyle(id: string, style: TextStyle): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    const prev = block?.data as RichTextBlockData;
    this.state.updateBlockData(id, { ...prev, headingStyle: style } as RichTextBlockData);
  }
}
