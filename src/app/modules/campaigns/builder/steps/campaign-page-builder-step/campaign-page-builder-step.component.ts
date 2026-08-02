import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Layers, GripVertical } from 'lucide-angular';
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
  TabsBlockData,
  AccordionBlockData,
  StatsBlockData,
  StatItem,
  DonationWidgetBlockData,
  CtaBlockData,
  DividerBlockData,
  UpdatesBlockData,
  ShareBlockData,
  CouponsBlockData,
  MapBlockData,
  OpeningHoursBlockData,
  CampaignDraft,
  CampaignTheme,
} from '../../../services/campaign-studio-state.service';
import { RichTextEditorComponent } from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { TextStyle, CtaConfig } from '../../../../../shared/models/text-style.model';
import { UploadService } from '../../../../../core/services/upload.service';
import { TemplatePickerComponent, TemplateSelection } from '../../template-picker/template-picker.component';
import { TEMPLATE_PALETTES, TemplatePalette, buildTheme } from '../../templates/campaign-templates';
import { OwnerType, isSectionAvailableFor } from '../../../services/owner-registry';

const BLOCK_LABELS: Record<BlockType, string> = {
  'rich-text':   'טקסט',
  'image':       'תמונה',
  'video':       'וידאו',
  'gallery':     'גלריה',
  'split':       'עמודות',
  'cta':         'קריאה לפעולה',
  'divider':     'מרווח / קו',
  'container':       'טבלת פריסה',
  'stats':           'פס נתונים',
  'donation-widget': 'תיבת תרומה',
  'rewards':         'תשורות',
  'sponsors':    'חסויות',
  'ambassadors': 'שגרירים',
  'donors':      'תורמים',
  'updates':     'עדכונים',
  'hero':        'Hero (תמונה ראשית)',
  'tabs':        'טאבים',
  'accordion':   'פאנלים',
  'share':       'שיתוף',
  'comments':    'תגובות',
  'coupons':       'קופון',
  'map':           'מפה / מיקום',
  'opening-hours': 'שעות פתיחה',
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
  'hero':        '🌄',
  'tabs':        '📑',
  'accordion':   '🗂️',
  'share':       '🔗',
  'comments':    '💬',
  'coupons':       '🏷️',
  'map':           '📍',
  'opening-hours': '🕒',
};

const SINGLE_INSTANCE: BlockType[] = ['rewards', 'sponsors', 'ambassadors', 'donors', 'updates', 'hero', 'share', 'comments', 'map', 'opening-hours'];

// Block groups for the picker UI. Groups/types are filtered per Owner Type
// (see blockGroups() below) — a group whose types are all unavailable for
// the current owner simply disappears, it's never listed empty. Every
// existing type here already includes 'campaign' in SECTION_REGISTRY, so
// this filtering is a no-op for ownerType 'campaign' (today's only owner).
export const BLOCK_GROUPS: { label: string; types: BlockType[] }[] = [
  { label: 'תוכן',    types: ['rich-text', 'image', 'video', 'gallery'] },
  { label: 'פריסה',   types: ['container', 'hero', 'tabs', 'accordion'] },
  { label: 'גיוס',    types: ['donation-widget', 'cta', 'rewards', 'share'] },
  { label: 'נתונים',  types: ['stats', 'donors'] },
  { label: 'קהילה',   types: ['sponsors', 'ambassadors', 'updates', 'comments'] },
  { label: 'עסק',     types: ['map', 'opening-hours', 'coupons'] },
  { label: 'עיצוב',   types: ['divider'] },
];

const ADDABLE_BLOCKS: BlockType[] = [
  'rich-text', 'image', 'video', 'gallery', 'container', 'hero', 'tabs', 'accordion',
  'stats', 'donation-widget', 'cta', 'divider', 'share',
  'rewards', 'sponsors', 'ambassadors', 'donors', 'updates', 'comments',
  'map', 'opening-hours', 'coupons',
];

@Component({
  selector: 'app-campaign-page-builder-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RichTextEditorComponent, TextStyleEditorComponent, ColorPickerComponent, TemplatePickerComponent],
  templateUrl: './campaign-page-builder-step.component.html',
  styleUrl: './campaign-page-builder-step.component.css',
})
export class CampaignPageBuilderStepComponent implements OnInit, OnDestroy {
  protected state       = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);

  readonly LayersIcon = Layers;
  readonly GripVertical = GripVertical;
  draft$ = this.state.draft$;

  showBlockPicker = false;
  showTemplatePicker = false;
  editingBlockId: string | null = null;

  // Container/tabs/accordion blocks get a 3-way disclosure instead of every
  // Plain open/closed, same as every other block type — 'closed' by default
  // on entering the step (header only). Used to have a 3rd 'preview' state
  // (children list only, own settings — i.e. the row/column choice — hidden
  // behind a 2nd click) but that buried the one control a container's whole
  // purpose depends on: a user only ever saw a bare "+ הוסף לכאן" box with
  // no visible way to choose side-by-side vs. stacked. 'open' now always
  // shows settings + children together. See DECISIONS.md (2026-07-20, then
  // revised 2026-07-30).
  private containerViewState = new Map<string, 'open' | 'closed'>();
  getContainerViewState(id: string): 'open' | 'closed' {
    return this.containerViewState.get(id) ?? 'closed';
  }
  private cycleContainerView(id: string): void {
    const current = this.getContainerViewState(id);
    const next = current === 'closed' ? 'open' : 'closed';
    this.containerViewState.set(id, next);
    this.editingBlockId = next === 'open' ? id : (this.editingBlockId === id ? null : this.editingBlockId);
  }

  // The design-settings sections below the block list (Hero texts, theme
  // colors, background, footer, ...) — collapsible for the same reason
  // containers are, and same default: all closed on entering the step, the
  // manager expands only what they're working on right now. 'zone-content'
  // (Zone 2 — the page's actual blocks, see the three-zone layout in the
  // template) is the one seeded-open exception: it's the main thing a
  // manager is here to look at, unlike Zone 1 (the block picker/"store")
  // and Zone 3 (general design), which stay opt-in closed. See
  // DECISIONS.md (2026-07-31).
  private expandedSections = new Set<string>(['zone-content']);
  isSectionCollapsed(key: string): boolean { return !this.expandedSections.has(key); }
  toggleSection(key: string): void {
    if (this.expandedSections.has(key)) this.expandedSections.delete(key);
    else this.expandedSections.add(key);
  }

  hoveredBlockId: string | null = null;
  private _destroy$ = new Subject<void>();

  setHovered(id: string | null): void { this.state.setHoveredBlock(id, 'builder'); }

  ngOnInit(): void {
    this.state.migrateSidebarToContainers();
    this.state.setPageBuilderActive(true);
    this.state.hoveredBlock$.pipe(takeUntil(this._destroy$)).subscribe(({ id }) => {
      this.hoveredBlockId = id;
    });
    // A block dragged from the picker and dropped onto the live preview is
    // inserted by the preview component itself (it owns the drop-target
    // hit-testing) — it then asks US to open/focus the new block's editor,
    // since editingBlockId/containerViewState are private to this panel.
    this.state.focusBlockRequest$.pipe(takeUntil(this._destroy$)).subscribe(({ id, type }) => {
      this.openNewBlockEditor(id, type);
    });
  }

  ngOnDestroy(): void {
    this.state.setPageBuilderActive(false);
    this._destroy$.next();
    this._destroy$.complete();
  }

  // Owner Context (Phase 3 — see owner-registry.ts). Undefined draft.ownerType
  // means 'campaign', exactly today's only owner — every filter below is a
  // no-op for it since every pre-existing BlockType's SECTION_REGISTRY entry
  // already includes 'campaign'.
  get ownerType(): OwnerType { return (this.state.draft.ownerType ?? 'campaign') as OwnerType; }

  // True only for a real campaign — false for both 'partner' and
  // 'campaign-partner' (see campaign-preview.component.ts#isCampaign, same
  // reasoning: donation/registration CTAs and campaign-only sections don't
  // apply to either non-campaign owner).
  get isCampaign(): boolean { return this.ownerType === 'campaign'; }

  get addableBlocks(): BlockType[] {
    return ADDABLE_BLOCKS.filter(t => isSectionAvailableFor(t, this.ownerType));
  }

  get blockGroups(): { label: string; types: BlockType[] }[] {
    return BLOCK_GROUPS
      .map(g => ({ ...g, types: g.types.filter(t => isSectionAvailableFor(t, this.ownerType)) }))
      .filter(g => g.types.length > 0);
  }

  readonly blockLabels = BLOCK_LABELS;
  readonly blockIcons = BLOCK_ICONS;

  // Hero is a single top-of-page section — nesting it inside a container/tab
  // makes no sense and only confuses the "+ הוסף לכאן" picker, so it's
  // excluded there (still addable normally via the top-level "+ הוסף בלוק").
  get nestedBlockGroups(): { label: string; types: BlockType[] }[] {
    return this.blockGroups.map(g => ({ ...g, types: g.types.filter(t => t !== 'hero') }));
  }

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
    const id = this.state.addBlock(type);
    this.showBlockPicker = false;
    this.openNewBlockEditor(id, type);
  }

  // ── Drag-to-add (picker → live preview) ─────────────────────────────
  // The picker item itself never moves — only its BlockType is carried, via
  // the shared state service, to whatever drop-target the live preview
  // resolves (see campaign-preview.component.ts's dragover/drop handlers).
  // dataTransfer is set too (not just the service field) because some
  // browsers refuse to fire 'drop' at all on a dragover that never called
  // setData(). See DECISIONS.md (2026-07-31).
  onPickerDragStart(event: DragEvent, type: BlockType, blocks: CampaignBlock[]): void {
    if (this.isAlreadyAdded(type, blocks)) { event.preventDefault(); return; }
    event.dataTransfer?.setData('text/plain', type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    this.state.setDraggedBlockType(type);
  }

  onPickerDragEnd(): void {
    this.state.setDraggedBlockType(null);
  }

  // ── Drag-to-reorder (an EXISTING block's own grip handle → live preview) ──
  // Same shared drag state / drop-target resolution as drag-to-add above,
  // just carrying an existing block's id instead of a new BlockType — the
  // preview commits via state.moveBlockTo() instead of insertBlockAt().
  onBlockDragStart(event: DragEvent, blockId: string): void {
    event.dataTransfer?.setData('text/plain', blockId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.state.setDraggedExistingBlockId(blockId);
  }

  onBlockDragEnd(): void {
    this.state.setDraggedExistingBlockId(null);
  }

  // Opens the new block's editor panel right away (instead of leaving it
  // collapsed like every other block) and scrolls it into view — otherwise
  // adding a block silently did nothing visible, and it wasn't obvious the
  // content was actually editable. See DECISIONS.md (2026-07-17). For a
  // container/tabs/accordion this must also mark its own view-state 'open'
  // (a separate flag from editingBlockId, see getContainerViewState) —
  // otherwise a freshly-added one showed its settings but not its (empty)
  // children tree/"+ הוסף לכאן", the exact "what do I do with this" gap
  // reported 2026-07-30.
  private openNewBlockEditor(id: string, type?: BlockType): void {
    this.editingBlockId = id;
    if (type === 'container' || type === 'tabs' || type === 'accordion') {
      this.containerViewState.set(id, 'open');
    }
    setTimeout(() => {
      document.getElementById('editor-blk-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // ── Hierarchy helpers ──────────────────────────────────────────

  private childIdSet(blocks: CampaignBlock[]): Set<string> {
    return new Set(
      blocks.filter(b => b.type === 'container' || b.type === 'tabs' || b.type === 'accordion')
        .flatMap(b => (b.data as ContainerBlockData).childBlockIds)
    );
  }

  topLevelBlocks(blocks: CampaignBlock[]): CampaignBlock[] {
    const childIds = this.childIdSet(blocks);
    return blocks.filter(b => !childIds.has(b.id)).sort((a, b) => a.order - b.order);
  }

  containerChildren(block: CampaignBlock, blocks: CampaignBlock[]): CampaignBlock[] {
    if (block.type !== 'container' && block.type !== 'tabs' && block.type !== 'accordion') return [];
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
    const id = this.state.addBlockToContainer(containerId, type);
    this.showContainerPickerId = null;
    if (id) this.openNewBlockEditor(id, type);
  }

  onTemplateSelected(selection: TemplateSelection): void {
    const { template, palette } = selection;
    this.state.applyTemplate(template.createBlocks(palette), template.buildTheme(palette), template.layoutMode, template.id, template.heroPlacement);
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

  toggleEdit(id: string, type: BlockType): void {
    if (type === 'container' || type === 'tabs' || type === 'accordion') {
      this.cycleContainerView(id);
    } else {
      this.editingBlockId = this.editingBlockId === id ? null : id;
    }
  }

  updateLabel(id: string, label: string): void {
    const blocks = this.state.draft.blocks.map(b => b.id === id ? { ...b, label } : b);
    this.state.patch({ blocks });
  }

  clearImportReview(id: string): void {
    const blocks = this.state.draft.blocks.map(b => {
      if (b.id !== id) return b;
      const { importReview, ...rest } = b;
      return rest as CampaignBlock;
    });
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

  updateImageField(id: string, field: keyof ImageBlockData, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as ImageBlockData);
  }

  updateImageWidth(id: string, widthPercent: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, widthPercent } as ImageBlockData);
  }

  updateImageHeight(id: string, heightPx: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, heightPx } as ImageBlockData);
  }

  resetImageHeight(id: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = { ...(block.data as ImageBlockData) };
    delete data.heightPx;
    this.state.updateBlockData(id, data);
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

  // Sets the action AND a matching default label/visibility together, so
  // picking a purpose alone is enough to get a working, visible button —
  // no separate step required to also update the label text.
  updateCtaAction(id: string, action: 'donate' | 'register' | 'link'): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as CtaBlockData;
    const label = action === 'register' ? 'הירשמו עכשיו' : action === 'link' ? 'לאתר שלנו' : 'תרמו עכשיו';
    this.state.updateBlockData(id, {
      ...data, ctaAction: action,
      ctaConfig: { ...data.ctaConfig, label, visible: true },
    } as CtaBlockData);
  }

  updateCtaLinkUrl(id: string, url: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, linkUrl: url } as CtaBlockData);
  }

  updateCtaBlockHeight(id: string, height: number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, blockHeight: height } as CtaBlockData);
  }

  // Container
  updateContainerField(id: string, field: keyof ContainerBlockData, value: string | number): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as ContainerBlockData);
  }

  // Tabs — each tab is a real 'container' block, so adding one reuses
  // addBlockToContainer verbatim (it's already parent-type-agnostic); this
  // just gives the new tab a nicer default label than "מסגרת". See
  // DECISIONS.md (2026-07-17).
  addTab(tabsBlockId: string, blocks: CampaignBlock[]): void {
    const tabCount = this.containerChildren(blocks.find(b => b.id === tabsBlockId)!, blocks).length;
    const newId = this.state.addBlockToContainer(tabsBlockId, 'container');
    if (newId) this.updateLabel(newId, `טאב ${tabCount + 1}`);
  }

  // Panels — same reasoning as addTab above. New panels start closed
  // (panelDefaultOpen defaults to falsy/undefined) so adding one doesn't
  // suddenly expand something the manager didn't ask to open.
  addPanel(accordionBlockId: string, blocks: CampaignBlock[]): void {
    const panelCount = this.containerChildren(blocks.find(b => b.id === accordionBlockId)!, blocks).length;
    const newId = this.state.addBlockToContainer(accordionBlockId, 'container');
    if (newId) this.updateLabel(newId, `פאנל ${panelCount + 1}`);
  }

  convertTabsAccordionType(id: string): void { this.state.convertTabsAccordionType(id); }

  updatePanelField(id: string, field: 'panelDefaultOpen' | 'panelIcon', value: boolean | string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as ContainerBlockData);
  }

  updateTabsField(id: string, field: keyof TabsBlockData, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as TabsBlockData);
  }

  updateAccordionField(id: string, field: keyof AccordionBlockData, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as AccordionBlockData);
  }

  setContainerRailZone(id: string, zone: 'sidebar' | 'main' | null): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = { ...(block.data as ContainerBlockData) };
    if (zone) data.railZone = zone; else delete data.railZone;
    this.state.updateBlockData(id, data);
  }

  swapContainerChildren(id: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as ContainerBlockData;
    if (data.childBlockIds.length < 2) return;
    const children = data.childBlockIds
      .map(cid => this.state.draft.blocks.find(b => b.id === cid))
      .filter((b): b is CampaignBlock => !!b)
      .sort((a, b) => a.order - b.order);
    if (children.length < 2) return;
    const blocks = this.state.draft.blocks.map(b => ({ ...b }));
    const a = blocks.find(b => b.id === children[0].id)!;
    const bBlock = blocks.find(b => b.id === children[1].id)!;
    [a.order, bBlock.order] = [bBlock.order, a.order];
    this.state.patch({ blocks });
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

  // Conversion Widget layout — how 'stats' + 'donation-widget' present
  // together. Layout-level (like rewardsLayout), not per-block.
  setConversionWidgetLayout(value: 'classic' | 'unified' | 'compact' | 'hero' | 'split-horizontal'): void {
    this.state.patch({ layout: { ...this.state.draft.layout, conversionWidgetLayout: value } });
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

  // Same base-color palettes and derivation as the initial Template Picker
  // (app-template-picker) — one click here gives the exact same coordinated
  // theme those swatches would have produced at campaign creation.
  readonly themeColorPalettes = TEMPLATE_PALETTES;

  applyThemePalette(palette: TemplatePalette): void {
    this.patchTheme(buildTheme(palette) as Partial<CampaignTheme>);
  }

  isActiveThemePalette(palette: TemplatePalette, theme: CampaignTheme): boolean {
    return theme.primaryColor === buildTheme(palette)['primaryColor'];
  }

  // Hero text style/CTA — same fields step 1 edits, surfaced here too so
  // managers can style Hero title/subtitle while looking at the live page
  // layout. See DECISIONS.md (2026-07-17).
  onHeroTextStyleChange(style: TextStyle): void { this.state.patch({ heroTextStyle: style }); }
  onHeroCtaConfigChange(cta: CtaConfig): void   { this.state.patch({ heroCtaConfig: cta }); }

  blockIcon(block: CampaignBlock): string  { return BLOCK_ICONS[block.type] ?? ''; }
  blockLabel(block: CampaignBlock): string { return this.blockTypeLabel(block.type); }

  // 'hero' is the one block type genuinely reused across all three owners
  // with different intent (see owner-registry.ts SECTION_REGISTRY comment)
  // — labeled differently per owner so nobody confuses a business's own
  // evergreen cover photo with a campaign-specific promotional banner.
  blockTypeLabel(type: BlockType): string {
    if (type === 'hero') {
      if (this.ownerType === 'partner') return 'קאבר העסק';
      if (this.ownerType === 'campaign-partner') return 'באנר המבצע';
      return BLOCK_LABELS[type];
    }
    return BLOCK_LABELS[type] ?? type;
  }

  asRichText(data: unknown): RichTextBlockData       { return data as RichTextBlockData; }
  asImage(data: unknown): ImageBlockData             { return data as ImageBlockData; }
  asVideo(data: unknown): VideoBlockData             { return data as VideoBlockData; }
  asGallery(data: unknown): GalleryBlockData         { return data as GalleryBlockData; }
  asSplit(data: unknown): SplitBlockData             { return data as SplitBlockData; }
  asContainer(data: unknown): ContainerBlockData         { return data as ContainerBlockData; }
  asTabs(data: unknown): TabsBlockData                   { return data as TabsBlockData; }
  asAccordion(data: unknown): AccordionBlockData         { return data as AccordionBlockData; }
  asStats(data: unknown): StatsBlockData                 { return data as StatsBlockData; }
  asDonationWidget(data: unknown): DonationWidgetBlockData { return data as DonationWidgetBlockData; }
  asCta(data: unknown): CtaBlockData                     { return data as CtaBlockData; }
  asDivider(data: unknown): DividerBlockData             { return data as DividerBlockData; }
  asShare(data: unknown): ShareBlockData                 { return data as ShareBlockData; }
  asCoupons(data: unknown): CouponsBlockData             { return data as CouponsBlockData; }
  asMap(data: unknown): MapBlockData                     { return data as MapBlockData; }
  asOpeningHours(data: unknown): OpeningHoursBlockData   { return data as OpeningHoursBlockData; }

  updateDividerField(id: string, field: keyof DividerBlockData, value: number | boolean | string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as DividerBlockData);
  }

  updateCouponsField(id: string, field: keyof CouponsBlockData, value: string | null): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as CouponsBlockData);
  }

  updateMapField(id: string, field: keyof MapBlockData, value: string | number | null): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as MapBlockData);
  }

  updateOpeningHoursDay(id: string, index: number, field: 'label' | 'hours' | 'closed', value: string | boolean): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as OpeningHoursBlockData;
    const days = data.days.map((d, i) => i === index ? { ...d, [field]: value } : d);
    this.state.updateBlockData(id, { days } as OpeningHoursBlockData);
  }

  toggleSharePlatform(id: string, platform: keyof ShareBlockData['platforms']): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as ShareBlockData;
    this.state.updateBlockData(id, {
      ...data, platforms: { ...data.platforms, [platform]: !data.platforms[platform] },
    } as ShareBlockData);
  }

  asUpdatesBlock(data: unknown): UpdatesBlockData { return data as UpdatesBlockData; }

  updateUpdatesViewMode(blockId: string, mode: 'slider' | 'list'): void {
    const block = this.state.draft.blocks.find(b => b.id === blockId);
    if (!block) return;
    this.state.updateBlockData(blockId, { viewMode: mode } as UpdatesBlockData);
  }
}
