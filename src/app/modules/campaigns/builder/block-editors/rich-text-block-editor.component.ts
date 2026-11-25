import {HmTextRoleDirective} from '../../studio/preview/text-role.directive';
import {elementColor} from '../../utils/element-color';
import {LucideAngularModule,AlignLeft,AlignCenter,AlignRight} from 'lucide-angular';
import {SurfaceStyle} from '../../../../shared/models/style-role.model';
import {EditingScope,sectionSurface} from '../../utils/studio-section-style';
import {StudioUiService} from '../../studio/services/studio-ui.service';
import { TextRoleEditorComponent } from '../../../../shared/ui/text-role-editor/text-role-editor.component';
import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignBlock, CampaignStudioStateService, RichTextBlockData } from '../../services/campaign-studio-state.service';
import { RichTextEditorComponent } from '../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { TextStyleEditorComponent } from '../../../../shared/ui/text-style-editor/text-style-editor.component';
import { TextStyle } from '../../../../shared/models/text-style.model';
import { TranslocoPipe } from '@jsverse/transloco';

// Rich-text block editor, shared by Step 9 and the Studio properties panel.
// 'headingStyle' is the heading-style control Step 9 shows right under the
// block's title field; 'content' is the text itself and its line height.
@Component({
  selector: 'app-rich-text-block-editor',
  standalone: true,
  imports: [HmTextRoleDirective, LucideAngularModule, TextRoleEditorComponent, TranslocoPipe, CommonModule, FormsModule, RichTextEditorComponent, TextStyleEditorComponent],
  templateUrl: './rich-text-block-editor.component.html',
  styleUrl: './block-editor.css',
})
export class RichTextBlockEditorComponent {
  @Input({ required: true }) block!: CampaignBlock;
  @Input() part: 'content' | 'headingStyle' | 'writing' | 'style' | 'layout' = 'content';
  private state = inject(CampaignStudioStateService);
  private ui=inject(StudioUiService);
  get textDirection():'rtl'|'ltr'{return this.state.contentLanguage==='he'?'rtl':'ltr';}
  get bodyColor(){return elementColor((this.currentBlock.data as RichTextBlockData).bodyStyle,this.state.contentLanguage);}
  @Input() layoutScope:EditingScope='both';
  readonly paddingSides=['paddingTop','paddingBottom','paddingInlineStart','paddingInlineEnd'] as const;
  get currentBlock(){return this.state.draft.blocks.find(b=>b.id===this.block.id)??this.block;}
  get surface(){return this.layoutScope==='both'?(this.currentBlock.sectionStyle??{}):sectionSurface(this.currentBlock,this.layoutScope==='mobile');}
  setLayoutScope(scope:EditingScope){this.layoutScope=scope;if(scope!=='both')this.ui.setDevice(scope);}
  paddingValue(side:typeof this.paddingSides[number]):number {const mobile=(this.layoutScope==='both'?this.ui.device:this.layoutScope)==='mobile';return this.surface[side]??this.surface.padding??(mobile?(side==='paddingTop'||side==='paddingBottom'?0:4):side==='paddingTop'?8:side==='paddingBottom'?20:24);}
  sliderMax(value:number,base:number){return Math.max(base,value);}
  sliderMin(value:number){return Math.min(0,value);}
  alignmentIcon(align:string){return align==='center'?AlignCenter:(align==='start')===(this.state.contentLanguage==='he')?AlignRight:AlignLeft;}
  alignmentSelected(align:string){const physical=align==='center'?'center':(align==='start')===(this.state.contentLanguage==='he')?'right':'left';return (this.currentBlock.data as RichTextBlockData).bodyStyle?.align===physical;}
  setMinimumHeight(value:number){if(Number.isFinite(value))this.setSurface({minHeight:Math.max(0,value)});}
  setPadding(side:typeof this.paddingSides[number],value:number){const values=Object.fromEntries(this.paddingSides.map(k=>[k,this.paddingValue(k)]));this.setSurface({...values,[side]:Math.max(0,Number(value)||0)});}
  setSurface(patch:Partial<SurfaceStyle>){const devices=(this.layoutScope==='both'?['desktop','mobile']:[this.layoutScope]) as ('desktop'|'mobile')[];this.state.patch({blocks:this.state.draft.blocks.map(b=>{if(b.id!==this.block.id)return b;const responsive={...b.responsive};for(const d of devices){const own={...responsive[d]?.sectionStyle};if(this.layoutScope==='both'){for(const key of Object.keys(patch) as (keyof SurfaceStyle)[])delete own[key];}else Object.assign(own,patch);responsive[d]={...responsive[d],sectionStyle:own};}return {...b,sectionStyle:this.layoutScope==='both'?{...b.sectionStyle,...patch}:b.sectionStyle,responsive};})});}
  setParagraphSpacing(value:number){this.state.updateBlockData(this.block.id,{...this.currentBlock.data,paragraphSpacing:Math.max(0,Math.min(64,Number(value)||0))} as RichTextBlockData);}
  setTextAlign(align:'start'|'center'|'end'){const data=this.currentBlock.data as RichTextBlockData;const physical:TextStyle['align']=align==='center'?'center':(align==='start')===(this.state.contentLanguage==='he')?'right':'left';this.updateBodyStyle({...data.bodyStyle,align:physical});}


  asRichText(data: unknown): RichTextBlockData { return data as RichTextBlockData; }

  updateBodyStyle(style: Partial<TextStyle> | undefined): void {
    this.state.updateBlockData(this.block.id, { ...this.currentBlock.data, bodyStyle: style } as RichTextBlockData);
  }

  updateRichText(id: string, content: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    const prev = block?.data as RichTextBlockData;
    this.state.updateBlockData(id, { ...prev, content } as RichTextBlockData);
  }

  updateRichTextLineHeight(id: string, lineHeight: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    const prev = block?.data as RichTextBlockData;
    this.state.updateBlockData(id, { ...prev, lineHeight, paragraphSpacing:prev.paragraphSpacing??10 } as RichTextBlockData);
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
