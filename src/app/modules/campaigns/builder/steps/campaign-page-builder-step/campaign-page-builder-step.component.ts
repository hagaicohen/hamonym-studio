import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule, DOCUMENT } from '@angular/common';
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
  StatsTextRole,
  StatsProgressRole,
  StatItem,
  DonationWidgetBlockData,
  DonationTextRole,
  DonationButtonRole,
  DonationSurfaceRole,
  DonorsBlockData,
  DonorsTextRole,
  AmbassadorsBlockData,
  AmbassadorsTextRole,
  AmbassadorsSurfaceRole,
  AmbassadorsButtonRole,
  CtaBlockData,
  CtaButtonRole,
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
import { TextRoleEditorComponent } from '../../../../../shared/ui/text-role-editor/text-role-editor.component';
import { StyleRoleEditorComponent, StyleRoleOverride } from '../../../../../shared/ui/style-role-editor/style-role-editor.component';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { TextStyle, CtaConfig } from '../../../../../shared/models/text-style.model';
import { resolveRoleColor, resolveRoleBorderRadius, LEGACY_THEME_COLOR } from '../../../utils/text-role-resolver';
import {
  AMOUNT_BUTTON_PRESETS, DONATION_AMOUNT_BUTTON_PRESET_OPTIONS, DonationAmountButtonPreset,
} from '../../../utils/donation-amount-button-presets';
import { UploadService } from '../../../../../core/services/upload.service';
import { TemplatePickerComponent, TemplateSelection } from '../../template-picker/template-picker.component';
import { TEMPLATE_PALETTES, TemplatePalette, buildTheme } from '../../templates/campaign-templates';
import {
  CAMPAIGN_STYLES, CAMPAIGN_STYLE_MAP, CampaignStyleId, StyleColorField, OpeningComposition, resolveOpeningComposition,
  resolveSectionPresentation, SectionPresentation, PresentableSection, resolveVisualTokens,
} from '../../styles/campaign-styles';
import { SectionPresentationPickerComponent } from '../../../shared/components/section-presentation-picker/section-presentation-picker.component';
import { OwnerType, isSectionAvailableFor } from '../../../services/owner-registry';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { environment } from '../../../../../../environments/environment';
import {
  LogoAppearanceEditorComponent, LogoShape, LogoSize,
} from '../../../../../shared/ui/logo-appearance-editor/logo-appearance-editor.component';

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
  imports: [
    CommonModule, FormsModule, LucideAngularModule, RichTextEditorComponent, TextStyleEditorComponent,
    TextRoleEditorComponent, StyleRoleEditorComponent,
    ColorPickerComponent, TemplatePickerComponent, LogoAppearanceEditorComponent, SectionPresentationPickerComponent,
  ],
  templateUrl: './campaign-page-builder-step.component.html',
  styleUrl: './campaign-page-builder-step.component.css',
})
export class CampaignPageBuilderStepComponent implements OnInit, OnDestroy {
  protected state       = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);
  private entityService = inject(CurrentEntityService);
  private entitiesService = inject(EntitiesService);
  private doc = inject(DOCUMENT);

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

  // Campaign Hero logo (moved from campaign-basic-step, 2026-09-30) — Style/
  // design controls belong in the Builder's design step, both before AND
  // after publication (Step 1 is PUBLISHED_GATED, Step 9 never is — see
  // campaign-editor.component.ts). entityLogoUrl is read-only preview data
  // (the fallback shown when no campaign-specific logo is set), same fetch
  // basic-step used to do for the identical purpose.
  entityLogoUrl: string | null = null;
  isUploadingLogo = false;
  logoDesignOpen = false;
  readonly LOGO_POSITIONS: { pos: 'left' | 'center' | 'right' | 'above'; label: string }[] = [
    { pos: 'right', label: 'ימין' },
    { pos: 'center', label: 'מרכז' },
    { pos: 'left', label: 'שמאל' },
    { pos: 'above', label: 'מעל' },
  ];

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

    // Entity logo preview only (moved from campaign-basic-step, 2026-09-30) —
    // shown as the fallback preview when no campaign-specific logo is set;
    // does not touch entities.logo_url itself (that stays Entity Settings).
    const entity = this.entityService.currentEntity();
    if (entity?.id) {
      this.entitiesService.getEntityById(entity.id).subscribe({
        next: (res: any) => {
          const raw = res?.logo_url ?? null;
          if (raw) {
            this.entityLogoUrl = (raw.startsWith('http') || raw.startsWith('data:image'))
              ? raw : `${environment.apiUrl}${raw}`;
          }
        },
      });
    }
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

  updateTabsField(id: string, field: keyof TabsBlockData, value: string | boolean): void {
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

  // Switching to "מותאם אישית" seeds the picker with the current live
  // accent color (design-evolution semantic-roles pass, 2026-09-29) rather
  // than leaving the field blank — the manager sees the color they're
  // customizing FROM, and can still change it right away.
  setStatsIconColorCustom(id: string): void {
    this.updateStatsField(id, 'iconColor', this.state.draft.layout.theme.accentColor);
  }

  // Warn (don't block) when the icon color is nearly invisible against its
  // own background — e.g. a white icon on a white/transparent background.
  // Transparent background is checked against the page's own white card,
  // since that's what actually shows through.
  statsLowContrast(data: StatsBlockData): boolean {
    const bg = data.backgroundColor === '' ? '#ffffff' : data.backgroundColor;
    if (!bg || !data.iconColor) return false;
    return this.colorDistance(data.iconColor, bg) < 40;
  }

  private colorDistance(hexA: string, hexB: string): number {
    const a = this.toRgb(hexA);
    const b = this.toRgb(hexB);
    if (!a || !b) return Infinity;
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  }

  private toRgb(hex: string): { r: number; g: number; b: number } | null {
    if (!hex.startsWith('#')) return null;
    const full = hex.length === 4 ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex;
    if (full.length !== 7) return null;
    return {
      r: parseInt(full.slice(1, 3), 16),
      g: parseInt(full.slice(3, 5), 16),
      b: parseInt(full.slice(5, 7), 16),
    };
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

  // Donation Amount Button Presets (2026-10) -- a dedicated setter, not
  // updateDonationWidgetField, because 'inherit' must DELETE the field
  // rather than persist a string. Resetting the preset never touches
  // buttonStyles.amountButton/amountButtonSelected (the separate, already-
  // existing B1 manual overrides) -- "reset preset" and "reset all amount-
  // button styling" are deliberately two different actions.
  readonly amountButtonPresetOptions = DONATION_AMOUNT_BUTTON_PRESET_OPTIONS;

  setAmountButtonPreset(id: string, preset: DonationAmountButtonPreset | 'inherit'): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = { ...(block.data as DonationWidgetBlockData) };
    if (preset === 'inherit') delete data.amountButtonPreset;
    else data.amountButtonPreset = preset;
    this.state.updateBlockData(id, data);
  }

  // Compact thumbnail preview for the preset picker -- a real (if tiny)
  // rendering of the preset's own values, not a generic icon, so the
  // manager can tell presets apart before clicking into any of them.
  miniAmountButtonStyle(preset: DonationAmountButtonPreset | 'inherit', selected: boolean): Record<string, string> {
    if (preset === 'inherit') {
      return selected
        ? { background: '#0f2747', borderColor: '#0f2747', color: '#ffffff', borderRadius: '8px', borderWidth: '1.5px', borderStyle: 'solid', fontWeight: '800' }
        : { background: '#ffffff', borderColor: '#dbe3ea', color: '#0f2747', borderRadius: '8px', borderWidth: '1.5px', borderStyle: 'solid', fontWeight: '800' };
    }
    const t = AMOUNT_BUTTON_PRESETS[preset];
    return {
      background:   selected ? t.selectedBackground  : t.background,
      borderColor:  selected ? t.selectedBorderColor  : t.borderColor,
      color:        selected ? t.selectedTextColor    : t.textColor,
      borderRadius: t.borderRadiusPx + 'px',
      borderWidth:  Math.max(1, t.borderWidthPx) + 'px', // kept visible even at 0 so the thumbnail itself stays legible
      borderStyle:  'solid',
      fontWeight:   String(t.fontWeight),
    };
  }

  // Donors — same shape as updateDonationWidgetField/updateStatsField above,
  // currently only used for the new titleColor override (2026-10-06).
  updateDonorsField(id: string, field: keyof DonorsBlockData, value: string): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    this.state.updateBlockData(id, { ...block.data, [field]: value } as DonorsBlockData);
  }

  // Typography Phase A (2026-10) -- Donors/Ambassadors/Stats Text Role
  // overrides all share the exact same shape (data.textStyles?.[role]), so
  // one generic updater serves every <app-text-role-editor> on this step
  // regardless of which of the 3 block types it's editing -- no per-section
  // duplicate method. undefined deletes the role key entirely rather than
  // writing an empty object, keeping the persisted JSON minimal.
  updateTextStyleRole(id: string, role: string, override: Partial<TextStyle> | undefined): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as { textStyles?: Record<string, Partial<TextStyle>> };
    const textStyles = { ...(data.textStyles ?? {}) };
    if (override) textStyles[role] = override;
    else delete textStyles[role];
    this.state.updateBlockData(id, { ...data, textStyles } as unknown as StatsBlockData);
  }

  // Universal Local Styling Phase B1 (2026-10) -- the non-text sibling of
  // updateTextStyleRole() above. surfaceStyles/buttonStyles/progressStyles
  // all share the exact same shape (data.<kind>?.[role]), so one generic
  // updater serves every <app-style-role-editor> on this step regardless
  // of kind or block type.
  updateStyleRole(id: string, kind: 'surfaceStyles' | 'buttonStyles' | 'progressStyles', role: string, override: StyleRoleOverride | undefined): void {
    const block = this.state.draft.blocks.find(b => b.id === id);
    if (!block) return;
    const data = block.data as Record<string, Record<string, StyleRoleOverride>>;
    const roles = { ...(data[kind] ?? {}) };
    if (override) roles[role] = override;
    else delete roles[role];
    this.state.updateBlockData(id, { ...data, [kind]: roles } as unknown as StatsBlockData);
  }

  asAmbassadorsBlock(data: unknown): AmbassadorsBlockData { return data as AmbassadorsBlockData; }

  // "לפי הסגנון" preview swatch in the role editor -- the exact same
  // resolver/legacy-literal pair campaign-preview.component.ts uses to
  // RENDER each role, so what the Builder shows as "today's default" is
  // never a guess.
  donorsRoleResolvedColor(draft: CampaignDraft, role: DonorsTextRole): string {
    const theme = draft.layout.theme;
    switch (role) {
      case 'sectionTitle':  return resolveRoleColor(undefined, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'donorName':     return resolveRoleColor(undefined, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'donorAmount':   return resolveRoleColor(undefined, LEGACY_THEME_COLOR.accentColor, theme, 'accentColor');
      case 'donorMeta':     return resolveRoleColor(undefined, '#94a3b8', theme, 'bodyTextColor');
    }
  }

  ambassadorsRoleResolvedColor(draft: CampaignDraft, role: AmbassadorsTextRole): string {
    const theme = draft.layout.theme;
    switch (role) {
      case 'sectionTitle':     return resolveRoleColor(undefined, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'ambassadorName':   return resolveRoleColor(undefined, '#0f172a', theme, 'secondaryColor');
      case 'raisedAmount':     return resolveRoleColor(undefined, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'donorCount':       return resolveRoleColor(undefined, '#0f172a', theme);
      case 'secondaryMeta':    return resolveRoleColor(undefined, '#94a3b8', theme, 'bodyTextColor');
    }
  }

  statsRoleResolvedColor(draft: CampaignDraft, role: StatsTextRole, data: StatsBlockData): string {
    const theme = draft.layout.theme;
    switch (role) {
      case 'sectionTitle': return resolveRoleColor(data.titleColor, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'value':        return resolveRoleColor(undefined, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'label':        return resolveRoleColor(undefined, '#62728d', theme, 'bodyTextColor');
    }
  }

  // Universal Local Styling Phase B1 (2026-10) -- "לפי הסגנון" preview
  // swatches for the new non-text roles. These mirror each role's own
  // legacy/classic-composition default (the renderer's explicit-or-null
  // roles don't inject these automatically into the page -- see the
  // DONATION_ROLE_NOTES comment in campaign-preview.component.ts -- but the
  // Builder still shows the manager what "לפי הסגנון" currently looks like
  // in the default/classic composition).
  donationContainerResolved(draft: CampaignDraft, prop: 'background' | 'borderColor'): string {
    return prop === 'background' ? '#ffffff' : '#e2e8f0';
  }
  donationContainerResolvedRadius(draft: CampaignDraft): number {
    return resolveRoleBorderRadius(undefined, 8, resolveVisualTokens(draft.layout?.campaignStyleId), 'cards');
  }
  donationAmountButtonResolved(prop: 'background' | 'textColor' | 'borderColor'): string {
    return { background: '#ffffff', textColor: '#0f2747', borderColor: '#dbe3ea' }[prop];
  }
  donationAmountButtonResolvedRadius(): number {
    return 8;
  }
  donationAmountButtonSelectedResolved(prop: 'background' | 'textColor'): string {
    return { background: '#0f2747', textColor: '#ffffff' }[prop];
  }
  donationCtaResolved(draft: CampaignDraft, data: DonationWidgetBlockData, prop: 'background' | 'textColor'): string {
    return prop === 'background' ? (data.ctaColor || draft.layout.theme.primaryColor) : '#ffffff';
  }
  donationCtaResolvedRadius(draft: CampaignDraft): number {
    return resolveRoleBorderRadius(undefined, 12, resolveVisualTokens(draft.layout?.campaignStyleId), 'buttons');
  }

  ambassadorsSurfaceResolvedColor(draft: CampaignDraft, prop: 'background' | 'borderColor' | 'buttonBackground' | 'buttonTextColor'): string {
    const theme = draft.layout.theme;
    switch (prop) {
      case 'background':       return resolveRoleColor(undefined, '#ffffff', undefined);
      case 'borderColor':      return resolveRoleColor(undefined, '#e2e8f0', undefined);
      case 'buttonBackground': return resolveRoleColor(undefined, LEGACY_THEME_COLOR.secondaryColor, theme, 'secondaryColor');
      case 'buttonTextColor':  return '#ffffff';
    }
  }
  ambassadorsCardResolvedRadius(draft: CampaignDraft): number {
    return resolveRoleBorderRadius(undefined, 16, resolveVisualTokens(draft.layout?.campaignStyleId), 'cards');
  }

  statsRingResolvedColor(prop: 'trackColor' | 'fillColor'): string {
    return prop === 'trackColor' ? '#e8eef5' : '#0f2747';
  }

  ctaButtonResolved(data: CtaBlockData, prop: 'background' | 'textColor'): string {
    return prop === 'background' ? data.ctaConfig.color : '#ffffff';
  }
  ctaButtonResolvedRadius(draft: CampaignDraft): number {
    return resolveRoleBorderRadius(undefined, 10, resolveVisualTokens(draft.layout?.campaignStyleId), 'buttons');
  }

  // Switching to "מותאם אישית" seeds the picker with the current live
  // primary-action color (design-evolution semantic-roles pass, 2026-09-29)
  // — the donation CTA is a PRIMARY ACTION, so it seeds from themePrimary,
  // not from accent (see campaign-preview.component.html's own comment).
  setCtaColorCustom(id: string): void {
    this.updateDonationWidgetField(id, 'ctaColor', this.state.draft.layout.theme.primaryColor);
  }

  // Second entry point for the exact same field, surfaced in the global
  // "צבעי תמה" panel (2026-09-29) — not a second donation widget, and not a
  // synced copy: donation-widget blocks aren't SINGLE_INSTANCE-enforced, but
  // in practice a campaign has at most one, so this simply finds it and
  // reuses the same mutator methods the per-block panel already calls. A
  // change from either location is the same write to the same block.
  get donationWidgetBlock(): CampaignBlock | undefined {
    return this.state.draft.blocks.find(b => b.type === 'donation-widget');
  }

  get donationCtaColor(): string {
    return (this.donationWidgetBlock?.data as DonationWidgetBlockData | undefined)?.ctaColor ?? '';
  }

  setDonationCtaColorAuto(): void {
    const block = this.donationWidgetBlock;
    if (block) this.updateDonationWidgetField(block.id, 'ctaColor', '');
  }

  setDonationCtaColorCustom(): void {
    const block = this.donationWidgetBlock;
    if (block) this.setCtaColorCustom(block.id);
  }

  setDonationCtaColorValue(value: string): void {
    const block = this.donationWidgetBlock;
    if (block) this.updateDonationWidgetField(block.id, 'ctaColor', value);
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
    // Single-writer invariant (Design Evolution Phase 1) — this row is
    // already hidden in the template once campaignStyleId is set (see the
    // *ngIf next to .theme-palette-row); guarded here too so a stray caller
    // can't bypass resolveTheme() and write theme's 4 managed fields directly.
    if (this.state.draft.layout.campaignStyleId) return;
    this.patchTheme(buildTheme(palette) as Partial<CampaignTheme>);
  }

  isActiveThemePalette(palette: TemplatePalette, theme: CampaignTheme): boolean {
    return theme.primaryColor === buildTheme(palette)['primaryColor'];
  }

  // ── Campaign Style (Design Evolution Phase 1) ──
  readonly campaignStyles = CAMPAIGN_STYLES;

  setCampaignStyle(id: CampaignStyleId): void {
    this.state.setCampaignStyle(id);
  }

  // ── Opening Composition — Phase A (2026-10-01) ──
  // Labels are user-facing Hebrew ONLY (UX reorg, 2026-10-01) -- the
  // internal `value`s are the real OpeningComposition literals, unchanged,
  // consumed by state/resolver/renderer exactly as before.
  readonly OPENING_COMPOSITIONS: { value: OpeningComposition; label: string }[] = [
    { value: 'classic', label: 'קלאסי' },
    { value: 'story-first', label: 'הסיפור במרכז' },
    { value: 'fundraising-split', label: 'גיוס ומדיה' },
  ];

  // The actually-rendered composition right now (explicit if set, else the
  // Style's own default, else 'classic') -- same resolver the renderer uses,
  // so the Builder's "active" card always matches what Preview shows.
  effectiveOpeningComposition(draft: CampaignDraft): OpeningComposition {
    return resolveOpeningComposition(draft.layout?.openingComposition, draft.layout?.campaignStyleId);
  }

  // UX reorg (2026-10-01) -- used only to hide the now-ineffective legacy
  // Hero position rows ("טקסטי Hero") when a structured Opening is active;
  // see that section's own template comment for exactly which controls this
  // does/doesn't affect and why.
  hasStructuredOpening(draft: CampaignDraft): boolean {
    return this.effectiveOpeningComposition(draft) !== 'classic';
  }

  // What the CURRENT Campaign Style recommends, independent of whether the
  // campaign has an explicit override -- used only to label a card
  // "מומלץ לסגנון", never to decide what's active.
  styleRecommendedOpeningComposition(draft: CampaignDraft): OpeningComposition {
    const style = draft.layout?.campaignStyleId ? CAMPAIGN_STYLE_MAP[draft.layout.campaignStyleId] : undefined;
    return style?.visual.opening.composition ?? 'classic';
  }

  setOpeningComposition(value: OpeningComposition): void {
    this.state.setOpeningComposition(value);
  }

  // Clears the explicit override back to undefined -- control returns to
  // the Style's own default, which keeps auto-updating if the Style changes
  // again later (NOT frozen to today's recommendation).
  resetOpeningComposition(): void {
    this.state.resetOpeningComposition();
  }

  // Section Presentation + placement (2026-10-03, consolidated 2026-10-04) —
  // EVERY layout/design control for all four list-type sections lives here,
  // in the Page Builder step, regardless of whether that section also has
  // its own dedicated content-management step elsewhere (Donors doesn't;
  // Rewards/Ambassadors/Updates do). This is deliberate, not an oversight:
  // this step is the one step NEVER in PUBLISHED_GATED_STEPS
  // (campaign-editor.component.ts), so it's the only place a design choice
  // stays editable after the campaign is published — exactly the product
  // rule "this is a design matter, it belongs in the Builder" (2026-10-04
  // fix; previously Rewards'/Ambassadors' pickers lived in their own
  // steps, which ARE gated post-publish, silently making them
  // uneditable for any already-published campaign).
  readonly REWARDS_PRESENTATION_OPTIONS: { value: SectionPresentation; label: string }[] = [
    { value: 'cards', label: 'כרטיסים' },
    { value: 'list', label: 'קומפקטי' },
    { value: 'image', label: 'תמונה מודגשת' },
  ];
  readonly DONORS_PRESENTATION_OPTIONS: { value: SectionPresentation; label: string }[] = [
    { value: 'cards', label: 'כרטיסים' },
    { value: 'list', label: 'רשימה' },
  ];
  readonly AMBASSADORS_PRESENTATION_OPTIONS: { value: SectionPresentation; label: string }[] = [
    { value: 'cards', label: 'כרטיסים' },
    { value: 'list', label: 'רשימה קומפקטית' },
  ];
  readonly UPDATES_PRESENTATION_OPTIONS: { value: SectionPresentation; label: string }[] = [
    { value: 'cards', label: 'כרטיסים' },
    { value: 'list', label: 'רשימה' },
  ];

  recommendedSectionPresentation(draft: CampaignDraft, type: PresentableSection): SectionPresentation {
    return resolveSectionPresentation(type, undefined, draft.layout.campaignStyleId, this.state.isSidebarSection(type));
  }

  // Rewards-only: an existing campaign may already have an explicit
  // rewardsLayout='image' choice (the OLD, mandatory field predating this
  // axis — see CampaignLayout.rewardsLayout's own doc comment). Only used to
  // seed the NEW picker's "recommended" badge correctly for a campaign that
  // never touches the new field; writing through the picker always goes to
  // the new field going forward. Gated to main placement only — the sidebar
  // always recommends 'list' regardless of this legacy field (see
  // resolveSectionPresentation). Identical escape hatch to
  // campaign-preview.component.ts#sectionPresentation.
  recommendedRewardsPresentation(draft: CampaignDraft): SectionPresentation {
    if (!this.state.isSidebarSection('rewards') && !draft.layout.sectionPresentation?.rewards && draft.layout.rewardsLayout === 'image') {
      return 'image';
    }
    return this.recommendedSectionPresentation(draft, 'rewards');
  }

  // Updates-only: an existing campaign may already have an explicit
  // viewMode='list' choice on the block itself (the OLD per-block control,
  // now removed from this panel's UI but left in the data/service layer for
  // backward compatibility — see campaign-preview.component.ts's identical
  // escape hatch). Only used to seed the NEW picker's "recommended" badge
  // correctly for a campaign that never touches the new field; writing
  // through the picker always goes to the new field going forward.
  recommendedUpdatesPresentation(draft: CampaignDraft, block: CampaignBlock): SectionPresentation {
    if (!draft.layout.sectionPresentation?.updates && this.asUpdatesBlock(block.data).viewMode === 'list') {
      return 'list';
    }
    return this.recommendedSectionPresentation(draft, 'updates');
  }

  // Routes a color-picker change through the override mechanism once a
  // Style is active (single-writer invariant — theme's 4 managed fields
  // must only ever be written by resolveTheme() from that point on), and
  // falls back to the original direct patchTheme() otherwise so a campaign
  // that never opts into Campaign Style keeps behaving exactly as before.
  onThemeColorChange(field: StyleColorField, value: string): void {
    if (this.state.draft.layout.campaignStyleId) {
      this.state.setStyleColorOverride(field, value);
    } else {
      this.patchTheme({ [field]: value });
    }
  }

  hasStyleOverride(field: StyleColorField): boolean {
    return !!this.state.draft.layout.styleOverrides?.[field];
  }

  resetStyleOverride(field: StyleColorField): void {
    this.state.resetStyleColorOverride(field);
  }

  get hasAnyStyleOverride(): boolean {
    const overrides = this.state.draft.layout.styleOverrides;
    return !!overrides && Object.keys(overrides).length > 0;
  }

  resetAllStyleOverrides(): void {
    this.state.resetAllStyleColorOverrides();
  }

  // "אוטומטי" / "מותאם אישית" — Primary is included on the same footing as
  // the other 3 (product decision, 2026-09-29): mechanically it resolves
  // through the identical override-else-automatic rule as secondary/accent/
  // bodyText, it just happens that its own "automatic" is the Style's seed
  // color rather than something derived from another field.
  styleFieldStatusLabel(field: StyleColorField): string {
    return this.hasStyleOverride(field) ? 'מותאם אישית' : 'אוטומטי';
  }

  get currentPaletteSwatches(): string[] {
    const theme = this.state.draft.layout.theme;
    return [theme.primaryColor, theme.secondaryColor, theme.accentColor, theme.bodyTextColor];
  }

  // Hero text style/CTA — same fields step 1 edits, surfaced here too so
  // managers can style Hero title/subtitle while looking at the live page
  // layout. See DECISIONS.md (2026-07-17).
  onHeroTextStyleChange(style: TextStyle): void { this.state.patch({ heroTextStyle: style }); }
  onHeroCtaConfigChange(cta: CtaConfig): void   { this.state.patch({ heroCtaConfig: cta }); }

  // ── Campaign Hero logo (moved from campaign-basic-step, 2026-09-30 —
  // Style/design controls belong in the design step, not the content step,
  // and this is now their ONE home regardless of publish status) ──
  onCampaignLogoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingLogo = true;
    this.uploadService.upload(file, 'campaigns/logos').subscribe({
      next: url => {
        this.state.patch({ campaignLogoUrl: url });
        this.isUploadingLogo = false;
        this.autoContrastLogoBg(url);
      },
      error: () => { this.isUploadingLogo = false; },
    });
  }

  removeCampaignLogo(): void {
    this.state.patch({ campaignLogoUrl: null });
  }

  setLogoPosition(pos: 'left' | 'center' | 'right' | 'above'): void {
    this.state.patch({ heroLogoPosition: pos });
  }

  // Horizontal sub-position, only meaningful/shown when heroLogoPosition is
  // 'above' -- see campaign-preview.component.ts#openingLogoAlign's own
  // comment for why this reuses the existing (previously dead) logoStripAlign
  // field instead of inventing a new one.
  readonly LOGO_ALIGNS: { align: 'right' | 'center' | 'left'; label: string }[] = [
    { align: 'right', label: 'ימין' },
    { align: 'center', label: 'מרכז' },
    { align: 'left', label: 'שמאל' },
  ];
  setLogoStripAlign(align: 'right' | 'center' | 'left'): void {
    this.state.patch({ logoStripAlign: align });
  }

  setLogoShape(shape: LogoShape): void { this.state.patch({ heroLogoShape: shape }); }
  setLogoSize(size: LogoSize): void   { this.state.patch({ heroLogoSize: size }); }

  // Same heuristic as the original campaign-basic-step implementation — a
  // near-white logo on the default white background is invisible; switches
  // to a dark background automatically, only while the background is still
  // untouched (default white), so it never overrides a manager's own choice.
  private autoContrastLogoBg(url: string): void {
    if (this.state.draft.layout.theme.logoBg !== '#ffffff') return;
    const img = this.doc.createElement('img');
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = this.doc.createElement('canvas');
      const size = 40;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, size, size).data;
      } catch {
        return; // canvas tainted by a cross-origin image without CORS headers
      }
      let total = 0, litSum = 0, opaquePixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 20) continue;
        opaquePixels++;
        const lightness = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        litSum += lightness;
        total++;
      }
      if (!total || opaquePixels < 10) return;
      const avgLightness = litSum / total;
      if (avgLightness > 220) this.patchTheme({ logoBg: '#1e293b' });
    };
    img.onerror = () => {};
    img.src = url;
  }

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
  asDonors(data: unknown): DonorsBlockData               { return data as DonorsBlockData; }
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

  // Rewards image position/size (moved here from campaign-offerings-step,
  // 2026-10-04) -- see the product fix note on the rewards editor-field
  // above: every layout/design control for a content section belongs here,
  // in the one step that stays editable after publish, not in that
  // section's own content-management step (which is correctly content-only
  // and gated post-publish).
  setRewardsImagePosition(position: 'full' | 'inline'): void {
    this.state.patch({ layout: { ...this.state.draft.layout, rewardsImagePosition: position } });
  }

  setRewardsImageSize(size: number): void {
    this.state.patch({ layout: { ...this.state.draft.layout, rewardsImageSize: size } });
  }
}
