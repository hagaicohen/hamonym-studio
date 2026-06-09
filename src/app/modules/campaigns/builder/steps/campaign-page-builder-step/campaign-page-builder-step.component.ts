import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Layers } from 'lucide-angular';
import {
  CampaignStudioStateService,
  CampaignBlock,
  BlockType,
  RichTextBlockData,
  ImageBlockData,
  VideoBlockData,
  GalleryBlockData,
  SplitBlockData,
  ContainerBlockData,
  StatsBlockData,
  StatItem,
  DonationWidgetBlockData,
  CtaBlockData,
  DividerBlockData,
  UpdatesBlockData,
  CampaignDraft,
  CampaignTheme,
} from '../../../services/campaign-studio-state.service';
import { RichTextEditorComponent } from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { TextStyle, CtaConfig } from '../../../../../shared/models/text-style.model';
import { UploadService } from '../../../../../core/services/upload.service';
import { TemplatePickerComponent } from '../../template-picker/template-picker.component';
import { CampaignTemplate } from '../../templates/campaign-templates';

const BLOCK_LABELS: Record<BlockType, string> = {
  'rich-text':   'טקסט',
  'image':       'תמונה',
  'video':       'וידאו',
  'gallery':     'גלריה',
  'split':       'עמודות',
  'cta':         'קריאה לפעולה',
  'divider':     'מרווח / קו',
  'container':       'מסגרת',
  'stats':           'פס נתונים',
  'donation-widget': 'תיבת תרומה',
  'rewards':         'תשורות',
  'sponsors':    'חסויות',
  'ambassadors': 'שגרירים',
  'donors':      'תורמים',
  'updates':     'עדכונים',
};

const BLOCK_ICONS: Record<BlockType, string> = {
  'rich-text':   '✍️',
  'image':       '🖼️',
  'video':       '🎬',
  'gallery':     '📸',
  'split':       '⬛⬜',
  'cta':         '🟢',
  'divider':     '↕',
  'container':       '▣',
  'stats':           '📊',
  'donation-widget': '💳',
  'rewards':         '🎁',
  'sponsors':    '🤝',
  'ambassadors': '⭐',
  'donors':      '💛',
  'updates':     '📢',
};

const SINGLE_INSTANCE: BlockType[] = ['rewards', 'sponsors', 'ambassadors', 'donors', 'updates'];

// Block groups for the picker UI
export const BLOCK_GROUPS: { label: string; types: BlockType[] }[] = [
  { label: 'תוכן',    types: ['rich-text', 'image', 'video', 'gallery'] },
  { label: 'פריסה',   types: ['container'] },
  { label: 'גיוס',    types: ['donation-widget', 'cta', 'rewards'] },
  { label: 'נתונים',  types: ['stats', 'donors'] },
  { label: 'קהילה',   types: ['sponsors', 'ambassadors', 'updates'] },
  { label: 'עיצוב',   types: ['divider'] },
];

const ADDABLE_BLOCKS: BlockType[] = [
  'rich-text', 'image', 'video', 'gallery', 'container',
  'stats', 'donation-widget', 'cta', 'divider',
  'rewards', 'sponsors', 'ambassadors', 'donors', 'updates',
];

@Component({
  selector: 'app-campaign-page-builder-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RichTextEditorComponent, TextStyleEditorComponent, ColorPickerComponent, TemplatePickerComponent],
  templateUrl: './campaign-page-builder-step.component.html',
  styleUrl: './campaign-page-builder-step.component.css',
})
export class CampaignPageBuilderStepComponent implements OnInit {
  private state         = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);

  readonly LayersIcon = Layers;
  draft$ = this.state.draft$;

  showBlockPicker = false;
  showTemplatePicker = false;
  editingBlockId: string | null = null;

  ngOnInit(): void {
    // Auto-migrate old CSS-hack sidebar campaigns to proper nested containers
    this.state.migrateSidebarToContainers();
  }

  readonly addableBlocks = ADDABLE_BLOCKS;
  readonly blockGroups = BLOCK_GROUPS;
  readonly blockLabels = BLOCK_LABELS;
  readonly blockIcons = BLOCK_ICONS;

  sortedBlocks(blocks: CampaignBlock[]): CampaignBlock[] {
    return [...blocks].sort((a, b) => a.order - b.order);
  }

  trackById(_: number, block: CampaignBlock): string { return block.id; }

  labelableBlocks(blocks: CampaignBlock[], currentId: string): CampaignBlock[] {
    return blocks.filter(b => b.id !== currentId && b.label?.trim());
  }

  isAlreadyAdded(type: BlockType, blocks: CampaignBlock[]): boolean {
    return SINGLE_INSTANCE.includes(type) && blocks.some(b => b.type === type);
  }

  addBlock(type: BlockType, blocks: CampaignBlock[]): void {
    if (this.isAlreadyAdded(type, blocks)) return;
    this.state.addBlock(type);
    this.showBlockPicker = false;
  }

  // ── Hierarchy helpers ──────────────────────────────────────────

  private childIdSet(blocks: CampaignBlock[]): Set<string> {
    return new Set(
      blocks.filter(b => b.type === 'container')
        .flatMap(b => (b.data as ContainerBlockData).childBlockIds)
    );
  }

  topLevelBlocks(blocks: CampaignBlock[]): CampaignBlock[] {
    const childIds = this.childIdSet(blocks);
    return blocks.filter(b => !childIds.has(b.id)).sort((a, b) => a.order - b.order);
  }

  containerChildren(block: CampaignBlock, blocks: CampaignBlock[]): CampaignBlock[] {
    if (block.type !== 'container') return [];
    const ids = (block.data as ContainerBlockData).childBlockIds;
    return ids.map(id => blocks.find(b => b.id === id))
      .filter((b): b is CampaignBlock => !!b)
      .sort((a, b) => a.order - b.order);
  }

  scopeBlocksFor(parentBlock: CampaignBlock | null, blocks: CampaignBlock[]): CampaignBlock[] {
    return parentBlock ? this.containerChildren(parentBlock, blocks) : this.topLevelBlocks(blocks);
  }

  moveInScope(id: string, parentBlock: CampaignBlock | null, blocks: CampaignBlock[], dir: -1 | 1): void {
    const scopeIds = this.scopeBlocksFor(parentBlock, blocks).map(b => b.id);
    if (dir < 0) {
      this.state.moveBlockUpInScope(id, scopeIds);
    } else {
      this.state.moveBlockDownInScope(id, scopeIds);
    }
  }

  isFirstInScopeOf(block: CampaignBlock, parentBlock: CampaignBlock | null, blocks: CampaignBlock[]): boolean {
    const scope = this.scopeBlocksFor(parentBlock, blocks);
    return scope[0]?.id === block.id;
  }

  isLastInScopeOf(block: CampaignBlock, parentBlock: CampaignBlock | null, blocks: CampaignBlock[]): boolean {
    const scope = this.scopeBlocksFor(parentBlock, blocks);
    return scope[scope.length - 1]?.id === block.id;
  }

  showContainerPickerId: string | null = null;

  addBlockInsideContainer(containerId: string, type: BlockType, blocks: CampaignBlock[]): void {
    if (this.isAlreadyAdded(type, blocks)) return;
    this.state.addBlockToContainer(containerId, type);
    this.showContainerPickerId = null;
  }

  onTemplateSelected(template: CampaignTemplate): void {
    this.state.applyTemplate(template.createBlocks(), template.themeOverride, template.layoutMode, template.id);
    this.showTemplatePicker = false;
  }

  onTemplateSkipped(): void {
    this.showTemplatePicker = false;
  }

  removeBlock(id: string): void {
    if (this.editingBlockId === id) this.editingBlockId = null;
    this.state.removeBlock(id);
  }

  toggleVisibility(id: string): void { this.state.toggleBlockVisibility(id); }

  toggleEdit(id: string): void {
    this.editingBlockId = this.editingBlockId === id ? null : id;
  }

  updateLabel(id: string, label: string): void {
    const blocks = this.state.draft.blocks.map(b => b.id === id ? { ...b, label } : b);
    this.state.patch({ blocks });
  }

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

  updateImageField(id: string, field: keyof ImageBlockData, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as ImageBlockData);
  }

  onImageFileSelected(id: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadService.upload(file, 'campaigns/blocks').subscribe({
      next: url => this.updateImageField(id, 'url', url),
    });
  }

  updateVideoUrl(id: string, url: string): void {
    this.state.updateBlockData(id, { url } as VideoBlockData);
  }

  // Gallery
  addGalleryItem(id: string, url: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as GalleryBlockData;
    this.state.updateBlockData(id, { items: [...data.items, { url, caption: '' }] } as GalleryBlockData);
  }

  onGalleryFileSelected(id: string, event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (!files) return;
    Array.from(files).forEach(file => {
      this.uploadService.upload(file, 'campaigns/gallery').subscribe({
        next: url => this.addGalleryItem(id, url),
      });
    });
  }

  removeGalleryItem(id: string, index: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as GalleryBlockData;
    const items = data.items.filter((_, i) => i !== index);
    this.state.updateBlockData(id, { items } as GalleryBlockData);
  }

  moveGalleryItem(id: string, index: number, dir: -1 | 1): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const items = [...(block.data as GalleryBlockData).items];
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.state.updateBlockData(id, { items } as GalleryBlockData);
  }

  updateGalleryCaption(id: string, index: number, caption: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const items = [...(block.data as GalleryBlockData).items];
    items[index] = { ...items[index], caption };
    this.state.updateBlockData(id, { ...(block.data as GalleryBlockData), items } as GalleryBlockData);
  }

  updateGalleryStyle(id: string, field: keyof GalleryBlockData, value: unknown): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as GalleryBlockData);
  }

  // Split
  updateSplitField(id: string, field: keyof SplitBlockData, value: string | number | null): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as SplitBlockData);
  }

  // CTA
  updateCtaField(id: string, field: keyof Pick<CtaBlockData, 'title' | 'text' | 'backgroundColor'>, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as CtaBlockData);
  }

  updateCtaTextStyle(id: string, style: TextStyle): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, textStyle: style } as CtaBlockData);
  }

  updateCtaConfig(id: string, cfg: CtaConfig): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, ctaConfig: cfg } as CtaBlockData);
  }

  // Container
  updateContainerField(id: string, field: keyof ContainerBlockData, value: string | number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as ContainerBlockData);
  }

  toggleContainerChild(id: string, childId: string, blocks: CampaignBlock[]): void {
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as ContainerBlockData;
    const exists = data.childBlockIds.includes(childId);
    const childBlockIds = exists
      ? data.childBlockIds.filter(c => c !== childId)
      : [...data.childBlockIds, childId];
    this.state.updateBlockData(id, { ...data, childBlockIds } as ContainerBlockData);
  }

  onCampaignBgImageSelected(event: Event, draft: any): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadService.upload(file, 'campaigns/backgrounds').subscribe({
      next: url => this.updateCampaignBgImage(url, draft),
    });
  }

  updateCampaignBgImage(url: string, draft: any): void {
    this.state.patch({ layout: { ...draft.layout, backgroundImageUrl: url } });
  }

  onContainerBgImageSelected(id: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadService.upload(file, 'campaigns/backgrounds').subscribe({
      next: url => this.updateContainerField(id, 'backgroundImageUrl', url),
    });
  }

  // Per-block spacing
  updateSpacing(id: string, field: 'spacingTop' | 'spacingBottom', value: number): void {
    const blocks = this.state.draft.blocks.map(b =>
      b.id === id ? { ...b, [field]: value } : b
    );
    this.state.patch({ blocks });
  }

  // Stats
  readonly statLabels: Record<string, string> = {
    target: 'יעד הגיוס', raised: 'גויס עד כה', percent: 'אחוז הגיוס',
    supporters: 'תומכים', start_date: 'תחילת הקמפיין',
    end_date: 'תאריך סיום', days_remaining: 'ימים נותרו', ambassadors: 'שגרירים',
  };

  readonly statIcons: Record<string, string> = {
    target: '🎯', raised: '💰', percent: '📈', supporters: '👥',
    start_date: '📅', end_date: '📅', days_remaining: '⏰', ambassadors: '⭐',
  };

  sortedStatItems(data: StatsBlockData): StatItem[] {
    return [...data.items].sort((a, b) => a.order - b.order);
  }

  updateStatsField(id: string, field: keyof StatsBlockData, value: string | number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as StatsBlockData);
  }

  toggleStatItem(id: string, key: string, visible: boolean): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as StatsBlockData;
    const items = data.items.map(i => i.key === key ? { ...i, visible } : i);
    this.state.updateBlockData(id, { items } as StatsBlockData);
  }

  moveStatItem(id: string, key: string, dir: -1 | 1): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const items = [...(block.data as StatsBlockData).items].sort((a, b) => a.order - b.order);
    const idx = items.findIndex(i => i.key === key);
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    [items[idx].order, items[target].order] = [items[target].order, items[idx].order];
    this.state.updateBlockData(id, { items } as StatsBlockData);
  }

  // Donation widget
  updateDonationWidgetField(id: string, field: keyof DonationWidgetBlockData, value: string | boolean): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as DonationWidgetBlockData);
  }

  togglePaymentLogo(id: string, logo: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as DonationWidgetBlockData;
    const exists = data.paymentLogos.includes(logo);
    const paymentLogos = exists ? data.paymentLogos.filter(l => l !== logo) : [...data.paymentLogos, logo];
    this.state.updateBlockData(id, { ...data, paymentLogos } as DonationWidgetBlockData);
  }

  // Background
  updateLayoutBg(field: keyof CampaignDraft['layout'], value: string | boolean, draft: CampaignDraft): void {
    this.state.patch({ layout: { ...draft.layout, [field]: value } });
  }

  // Theme
  patchTheme(partial: Partial<CampaignTheme>): void {
    const draft = this.state.draft;
    this.state.patch({ layout: { ...draft.layout, theme: { ...draft.layout.theme, ...partial } } });
  }

  blockIcon(block: CampaignBlock): string  { return BLOCK_ICONS[block.type] ?? ''; }
  blockLabel(block: CampaignBlock): string { return BLOCK_LABELS[block.type] ?? block.type; }

  asRichText(data: unknown): RichTextBlockData       { return data as RichTextBlockData; }
  asImage(data: unknown): ImageBlockData             { return data as ImageBlockData; }
  asVideo(data: unknown): VideoBlockData             { return data as VideoBlockData; }
  asGallery(data: unknown): GalleryBlockData         { return data as GalleryBlockData; }
  asSplit(data: unknown): SplitBlockData             { return data as SplitBlockData; }
  asContainer(data: unknown): ContainerBlockData         { return data as ContainerBlockData; }
  asStats(data: unknown): StatsBlockData                 { return data as StatsBlockData; }
  asDonationWidget(data: unknown): DonationWidgetBlockData { return data as DonationWidgetBlockData; }
  asCta(data: unknown): CtaBlockData                     { return data as CtaBlockData; }
  asDivider(data: unknown): DividerBlockData             { return data as DividerBlockData; }

  updateDividerField(id: string, field: keyof DividerBlockData, value: number | boolean | string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as DividerBlockData);
  }

  asUpdatesBlock(data: unknown): UpdatesBlockData { return data as UpdatesBlockData; }

  updateUpdatesViewMode(blockId: string, mode: 'slider' | 'list'): void {
    const block = this.state.draft.blocks.find(b => b.id === blockId);
    if (!block) return;
    this.state.updateBlockData(blockId, { viewMode: mode } as UpdatesBlockData);
  }
}
