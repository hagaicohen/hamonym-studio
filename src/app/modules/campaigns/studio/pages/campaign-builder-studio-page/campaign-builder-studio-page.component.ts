import { AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  LucideAngularModule, LucideIconData, Type, Image as ImageIcon, Video, Images, Columns2, MousePointerClick, Minus, LayoutGrid,
  ChartColumn, HandCoins, Gift, Handshake, Star, Heart, Megaphone, PanelTop, Rows3, ListCollapse, Share2, MessageCircle,
  Ticket, MapPin, Clock, Eye, EyeOff, ArrowUp, ArrowDown, ChevronDown, ChevronLeft, Plus, Undo2, Redo2, Layers, Box,
  LayoutTemplate, Info, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Ellipsis, Trash2, Palette, PanelBottom, SlidersHorizontal, ExternalLink, Rocket, CircleCheck, CircleAlert, Copy,
} from 'lucide-angular';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../../../../../shared/ui/design-system/icons';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { BlockType, CampaignBlock, CampaignDraft, CampaignStatus, CampaignStudioStateService, ContainerBlockData } from '../../../services/campaign-studio-state.service';
import { StudioUiService } from '../../services/studio-ui.service';
import { CampaignStudioTopbarComponent } from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { PlatformTopStripComponent } from '../../../../../core/layout/platform-top-strip/platform-top-strip.component';
import { AppLoaderService } from '../../../../../core/services/app-loader.service';
import { TemplatePickerComponent, TemplateSelection } from '../../../builder/template-picker/template-picker.component';
import { CampaignPresetPickerComponent } from '../../../builder/preset-picker/campaign-preset-picker.component';
import { CampaignBasicStepComponent } from '../../../builder/steps/campaign-basic-step/campaign-basic-step.component';
import { CampaignTypeStepComponent } from '../../../builder/steps/campaign-type-step/campaign-type-step.component';
import { CampaignDonationStepComponent } from '../../../builder/steps/campaign-donation-step/campaign-donation-step.component';
import { CampaignOfferingsStepComponent } from '../../../builder/steps/campaign-offerings-step/campaign-offerings-step.component';
import { CampaignRegistrationStepComponent } from '../../../builder/steps/campaign-registration-step/campaign-registration-step.component';
import { CampaignSponsorsStepComponent } from '../../../builder/steps/campaign-sponsors-step/campaign-sponsors-step.component';
import { CampaignAmbassadorsStepComponent } from '../../../builder/steps/campaign-ambassadors-step/campaign-ambassadors-step.component';
import { CampaignUpdatesStepComponent } from '../../../builder/steps/campaign-updates-step/campaign-updates-step.component';
import { CampaignMinimalDetailsStepComponent } from '../../../builder/steps/campaign-minimal-details-step/campaign-minimal-details-step.component';
import { MinimalDonationPageComponent } from '../../../shared/components/minimal-donation-page/minimal-donation-page.component';
import { CAMPAIGN_TEMPLATES, TEMPLATE_PALETTES } from '../../../builder/templates/campaign-templates';
import { StudioHistory } from '../../canvas/studio-history';
import { CampaignPublishStepComponent } from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';
import { publishEntityApproved, publishMissingFields } from '../../../builder/steps/campaign-publish-step/publish-readiness';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { wizardStepAccess } from '../../../builder/wizard-steps';
import { withStudioPlaceholders } from '../../canvas/studio-placeholders';
import { PresetId } from '../../../services/campaign-studio-state.service';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { BLOCK_GROUPS, BLOCK_LABELS, SINGLE_INSTANCE, blockLucideIcon } from '../../../builder/block-catalog';
import { isSectionAvailableFor } from '../../../services/owner-registry';
import { PUBLISH_STEP } from '../../../campaign-editor-route';

// Campaign Builder Studio — the default campaign editor since 2026-11-05
// (campaign-editor-route.ts). Component tree, the real campaign renderer as
// canvas, and a properties panel hosting the Wizard's own steps; every change
// goes through CampaignStudioStateService. The classic Wizard stays at
// /campaigns/:id/edit as the rollback path.

export interface StudioNode {
  key: string;                 // block id, or 'area:<name>' for page areas
  kind: 'block' | 'area';
  label: string;
  icon: LucideIconData;
  block?: CampaignBlock;
  scopeIds: string[];          // ordered sibling ids, for move up/down
  parentId: string | null;     // container / tabs / panels holding it
  children: StudioNode[];
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'טיוטה', published: 'פורסם', paused: 'מושהה', ended: 'הסתיים',
};

export const studioIcon = blockLucideIcon;

const isParent = (b: CampaignBlock) => b.type === 'container' || b.type === 'tabs' || b.type === 'accordion';

export function buildStudioTree(blocks: CampaignBlock[]): StudioNode[] {
  const byId = new Map(blocks.map(b => [b.id, b]));
  const nested = new Set(blocks.filter(isParent).flatMap(b => (b.data as ContainerBlockData).childBlockIds ?? []));
  const toNodes = (list: CampaignBlock[], parentId: string | null): StudioNode[] => {
    const sorted = [...list].sort((a, b) => a.order - b.order);
    const scopeIds = sorted.map(b => b.id);
    return sorted.map(block => ({
      key: block.id, kind: 'block' as const, block, scopeIds, parentId,
      label: block.label?.trim() || BLOCK_LABELS[block.type] || block.type,
      icon: studioIcon(block.type),
      children: isParent(block)
        ? toNodes(((block.data as ContainerBlockData).childBlockIds ?? []).map(id => byId.get(id)).filter((b): b is CampaignBlock => !!b), block.id)
        : [],
    }));
  };
  return toNodes(blocks.filter(b => !nested.has(b.id)), null);
}

// Where a block type may be placed, on top of moveBlockTo's own guard against
// dropping a block into itself: tabs and panels hold only containers (each tab
// or panel is one), and Hero stays out of containers, like Step 9's "add
// inside" catalog.
export function canPlaceIn(type: BlockType, parent: CampaignBlock | null): boolean {
  if (!parent) return true;
  if (parent.type === 'tabs' || parent.type === 'accordion') return type === 'container';
  if (parent.type === 'container') return type !== 'hero';
  return false;
}

function isWithin(ancestorId: string, id: string, blocks: CampaignBlock[]): boolean {
  if (ancestorId === id) return true;
  const ancestor = blocks.find(b => b.id === ancestorId);
  if (!ancestor || !isParent(ancestor)) return false;
  return ((ancestor.data as ContainerBlockData).childBlockIds ?? []).some(c => isWithin(c, id, blocks));
}

export type StudioActionId = 'add-inside' | 'add-tab' | 'add-panel' | 'swap' | 'convert' | 'duplicate' | 'review' | 'delete';
export interface StudioAction { id: StudioActionId; label: string; danger?: boolean; }

// Block actions offered in the tree context menu and the properties panel;
// the same conditions as the classic Step 9 block row.
export function blockActions(block: CampaignBlock, canDuplicate = !SINGLE_INSTANCE.includes(block.type)): StudioAction[] {
  const data = block.data as ContainerBlockData;
  const actions: StudioAction[] = [];
  if (block.type === 'container') actions.push({ id: 'add-inside', label: 'הוספת רכיב לתוך המסגרת' });
  if (block.type === 'tabs') actions.push({ id: 'add-tab', label: 'הוספת טאב' }, { id: 'convert', label: 'המרה לפאנלים' });
  if (block.type === 'accordion') actions.push({ id: 'add-panel', label: 'הוספת פאנל' }, { id: 'convert', label: 'המרה לטאבים' });
  if (block.type === 'container' && data.direction === 'row' && (data.childBlockIds ?? []).length >= 2) {
    actions.push({ id: 'swap', label: 'החלפת צדדים (ימין ↔ שמאל)' });
  }
  if (canDuplicate) actions.push({ id: 'duplicate', label: 'שכפול' });
  if (block.importReview?.needsReview) actions.push({ id: 'review', label: 'סימון כנבדק (ייבוא אתר)' });
  actions.push({ id: 'delete', label: 'מחיקה', danger: true });
  return actions;
}

@Component({
  selector: 'app-campaign-builder-studio-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LucideAngularModule, CampaignStudioTopbarComponent, CampaignPreviewComponent, PlatformTopStripComponent,
    TemplatePickerComponent, CampaignPresetPickerComponent, CampaignBasicStepComponent, CampaignPageBuilderStepComponent, CampaignTypeStepComponent, CampaignDonationStepComponent,
    CampaignOfferingsStepComponent, CampaignRegistrationStepComponent, CampaignSponsorsStepComponent,
    CampaignAmbassadorsStepComponent, CampaignUpdatesStepComponent, CampaignPublishStepComponent,
    CampaignMinimalDetailsStepComponent, MinimalDonationPageComponent,
  ],
  templateUrl: './campaign-builder-studio-page.component.html',
  styleUrl: './campaign-builder-studio-page.component.css',
})
export class CampaignBuilderStudioPageComponent implements OnInit, OnDestroy, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private entity = inject(CurrentEntityService);
  private api = inject(CampaignApiService);
  private loader = inject(AppLoaderService);
  readonly state = inject(CampaignStudioStateService);
  readonly ui = inject(StudioUiService);
  @ViewChild('canvas') canvas?: ElementRef<HTMLElement>;

  readonly draft$ = this.state.draft$;
  readonly icons = {
    Eye, EyeOff, ArrowUp, ArrowDown, ChevronDown, ChevronLeft, Plus, Undo2, Redo2, Layers, PanelTop,
    LayoutTemplate, Info, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Ellipsis, Trash2, Palette, PanelBottom, ImageIcon, ExternalLink, Rocket, CircleCheck, CircleAlert, Copy,
  };
  readonly iconSize = HM_ICON_SIZE.sm;
  readonly iconStroke = HM_ICON_STROKE;
  readonly openingKey = 'area:opening';
  // Page areas edited through classic Step 9's design area ("עיצוב הקמפיין"),
  // each opening its own section there.
  readonly designAreas: { key: string; label: string; design: 'page' | 'logo' | 'footer'; icon: LucideIconData; title: string }[] = [
    { key: 'area:design', label: 'עיצוב העמוד: סגנון, צבעים ורקע', design: 'page', icon: Palette, title: 'עיצוב העמוד' },
    { key: 'area:logo', label: 'לוגו', design: 'logo', icon: ImageIcon, title: 'לוגו: מיקום, גודל ומסגרת' },
    { key: 'area:footer', label: 'פוטר', design: 'footer', icon: PanelBottom, title: 'פוטר' },
  ];
  designArea(key: string | null) { return this.designAreas.find(a => a.key === key); }

  // Page areas that host a classic wizard step as-is. Whether a step is edited
  // here, managed in the Workspace (published campaigns, steps 3–8), or not
  // shown at all comes from the wizard's own rules (wizard-steps.ts).
  readonly stepAreas: { key: string; step: number; label: string; title: string; icon: LucideIconData; workspacePath?: string; workspaceFragment?: string }[] = [
    { key: 'area:settings', step: 2, label: 'סוג, יעד ותאריכים', title: 'הגדרות הקמפיין', icon: SlidersHorizontal },
    { key: 'area:donation', step: 3, label: 'הגדרות תרומה', title: 'הגדרות תרומה', icon: HandCoins, workspacePath: 'donation' },
    { key: 'area:rewards', step: 4, label: 'רשימת התשורות', title: 'תשורות', icon: Gift, workspacePath: 'rewards' },
    { key: 'area:registration', step: 5, label: 'אפשרויות הרשמה', title: 'הרשמה', icon: Ticket, workspacePath: 'registration' },
    { key: 'area:sponsors', step: 6, label: 'רשימת החסויות', title: 'חסויות', icon: Handshake, workspacePath: 'sponsors' },
    { key: 'area:ambassadors', step: 7, label: 'רשימת השגרירים', title: 'שגרירים', icon: Star, workspacePath: 'ambassadors' },
    { key: 'area:updates', step: 8, label: 'רשימת העדכונים', title: 'עדכונים', icon: Megaphone, workspacePath: 'dashboard', workspaceFragment: 'updates' },
  ];

  // Step 4 created the unsaved campaign (partner linking): keep this page,
  // the draft and the open dialog, and only move the address to the saved
  // campaign. The id is already in the draft, so later saves update it.
  readonly onCampaignCreated = (id: string): void => {
    this.campaignId = id;
    this.isNew = false;
    this.location.replaceState('/campaigns/' + id + '/studio');
  };
  stepArea(key: string | null) { return this.stepAreas.find(a => a.key === key); }
  stepAccess(draft: CampaignDraft, step: number) { return wizardStepAccess(draft, step); }
  visibleStepAreas(draft: CampaignDraft) { return this.stepAreas.filter(a => wizardStepAccess(draft, a.step) !== 'hidden'); }
  campaignId = '';
  loaded = false;
  loadError: string | null = null;
  selectedKey: string | null = 'area:opening';
  collapsed = new Set<string>();
  showTemplatePicker = false;
  // Step 10 ("סיכום ופרסום") in a dialog: the wizard's own component, with its
  // checks, server calls, publish request and navigation.
  showPublish = false;
  // New, unsaved campaign (/campaigns/create/studio): the same preset and
  // template pickers as the classic /campaigns/create, nothing is saved
  // until the topbar Save creates the campaign.
  isNew = false;
  showPresetPicker = false;
  showStartTemplatePicker = false;
  showAddMenu = false;
  // Add menu target: null = page (top level), otherwise the container id.
  addTarget: string | null = null;
  // Context menu of a tree row.
  menu: { key: string; top: number; left: number } | null = null;
  pendingDelete: { id: string; label: string; nested: number } | null = null;
  // Tree drag and drop: an existing block (dragKey) or a catalog type (dragType).
  dragKey: string | null = null;
  dragType: BlockType | null = null;
  dropHint: { key: string; pos: 'before' | 'after' | 'inside' } | null = null;
  // Side panel widths and collapse state, remembered per browser (optional).
  treeWidth = 264;
  propsWidth = 360;
  treeCollapsed = false;
  propsCollapsed = false;
  private resizing: { panel: 'tree' | 'props'; startX: number; startWidth: number } | null = null;
  private placeholderIn: CampaignDraft | null = null;
  private placeholderUsed = false;
  private highlighted: string | null = null;
  private scrollOnHighlight = false;
  private destroy$ = new Subject<void>();
  // Undo/redo of campaign edits in this session (studio-history.ts).
  readonly history = new StudioHistory(this.state);
  // Page areas clicked in the canvas, and where they open in the tree.
  private readonly canvasAreas: Record<'opening' | 'nav' | 'footer', string> = { opening: 'area:opening', nav: 'area:design', footer: 'area:footer' };

  ngOnInit(): void {
    this.restoreLayout();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    this.state.setPageBuilderActive(true);
    // A click on a block in the canvas (CampaignPreviewComponent) selects it here.
    this.state.focusBlockRequest$.pipe(takeUntil(this.destroy$)).subscribe(({ id }) => this.select(id, false));
    this.state.focusAreaRequest$.pipe(takeUntil(this.destroy$)).subscribe(area => this.select(this.canvasAreas[area], false));
    if (!this.campaignId) {
      this.isNew = true;
      this.state.reset();
      this.loaded = true;
      this.showPresetPicker = true;
      this.loader.hide();
      return;
    }
    this.api.getById(this.campaignId).subscribe({
      next: data => {
        this.loader.hide();
        if (!data?.id) { this.loadError = 'לא נמצא קמפיין כזה, או שאין לכם גישה אליו.'; return; }
        // Opening the Studio never changes the campaign. The legacy sidebar
        // conversion stays in classic Step 9; the renderer shows legacy sidebar
        // layouts as they are.
        this.state.loadDraft(data);
        this.history.start();
        this.loaded = true;
        this.openReturnStep(Number(this.route.snapshot.queryParamMap.get('returnStep')));
      },
      error: () => { this.loader.hide(); this.loadError = 'לא ניתן היה לטעון את הקמפיין. נסו שוב.'; },
    });
  }

  ngOnDestroy(): void {
    this.stopResize();
    this.history.stop();
    this.destroy$.next();
    this.destroy$.complete();
    this.state.setHoveredBlock(null, 'builder');
    this.state.setPageBuilderActive(false);
    this.ui.setFullscreen(false);
  }

  // The renderer re-creates block elements on every change, so the selection
  // outline is re-applied after each render instead of stored in the DOM once.
  ngAfterViewChecked(): void {
    const root = this.canvas?.nativeElement;
    if (!root) return;
    const id = this.canvasSelector(this.selectedKey);
    const current = root.querySelectorAll<HTMLElement>('.studio-selected');
    const targets = id ? Array.from(root.querySelectorAll<HTMLElement>(id)) : [];
    if (this.highlighted === id && targets.every(t => t.classList.contains('studio-selected')) && current.length === targets.length) return;
    current.forEach(el => el.classList.remove('studio-selected'));
    targets.forEach(el => el.classList.add('studio-selected'));
    this.highlighted = id;
    if (this.scrollOnHighlight && targets[0]) targets[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.scrollOnHighlight = false;
  }

  // The canvas element(s) showing the selection: a block, or the opening /
  // footer area. The design area covers the whole page and is not outlined.
  private canvasSelector(key: string | null): string | null {
    if (!key || key === 'area:design' || key === 'area:logo') return null;
    if (key === 'area:opening') return '[data-studio-area="opening"]';
    if (key === 'area:footer') return '[data-studio-area="footer"]';
    if (key.startsWith('area:')) return null;
    return `[data-block-id="${CSS.escape(key)}"]`;
  }

  // ?returnStep=<wizard step>, as links into the Wizard use it: publishing
  // opens the publish dialog, a step with its own area selects that area.
  private openReturnStep(step: number): void {
    if (!step) return;
    if (step === PUBLISH_STEP) { this.showPublish = true; return; }
    if (step === 1) { this.selectedKey = this.openingKey; return; }
    const area = this.stepAreas.find(a => a.step === step && wizardStepAccess(this.state.draft, a.step) !== 'hidden');
    if (area) this.selectedKey = area.key;
  }

  // Full and minimal campaign pages open here; partner pages keep their editor.
  isSupported(draft: CampaignDraft): boolean {
    return (draft.ownerType ?? 'campaign') === 'campaign';
  }

  // The minimal donation page has no blocks or page design: the Studio shows
  // its own details step and the wizard steps the wizard keeps for it.
  isMinimal(draft: CampaignDraft): boolean { return draft.layout.pageFormat === 'minimal'; }


  // Leaving with edits that were not saved asks first (route guard + tab close).
  canLeave(): boolean {
    return !this.state.hasUnsavedChanges() || confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, except while typing in a field (the
  // browser's own text undo applies there).
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
    else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); this.redo(); }
  }

  undo(): void { this.history.undo(); this.keepSelectionValid(); }
  redo(): void { this.history.redo(); this.keepSelectionValid(); }

  private keepSelectionValid(): void {
    const key = this.selectedKey;
    if (key && !key.startsWith('area:') && !this.state.draft.blocks.some(b => b.id === key)) this.selectedKey = this.openingKey;
  }

  tree(draft: CampaignDraft): StudioNode[] { return buildStudioTree(draft.blocks); }

  statusLabel(draft: CampaignDraft): string { return STATUS_LABELS[draft.status] ?? draft.status; }

  select(key: string, fromTree = true): void {
    this.selectedKey = key;
    this.scrollOnHighlight = fromTree;
    this.showAddMenu = false;
    this.menu = null;
  }

  selectedBlock(draft: CampaignDraft): CampaignBlock | undefined {
    return this.selectedKey ? draft.blocks.find(b => b.id === this.selectedKey) : undefined;
  }

  // Panel order in the DOM is tree, canvas, properties; RTL puts the tree on
  // the right. Collapsed panels keep a narrow rail with their toggle.
  get gridColumns(): string {
    const tree = this.treeCollapsed ? 44 : this.treeWidth;
    const props = this.propsCollapsed ? 44 : this.propsWidth;
    return tree + 'px 6px minmax(0, 1fr) 6px ' + props + 'px';
  }

  toggleTree(): void { this.treeCollapsed = !this.treeCollapsed; this.saveLayout(); }
  toggleProps(): void { this.propsCollapsed = !this.propsCollapsed; this.saveLayout(); }

  startResize(panel: 'tree' | 'props', event: PointerEvent): void {
    if (panel === 'tree' ? this.treeCollapsed : this.propsCollapsed) return;
    event.preventDefault();
    this.resizing = { panel, startX: event.clientX, startWidth: panel === 'tree' ? this.treeWidth : this.propsWidth };
    window.addEventListener('pointermove', this.onResizeMove);
    window.addEventListener('pointerup', this.stopResize);
  }

  // RTL: the tree grows when the pointer moves left, the properties panel when it moves right.
  private onResizeMove = (event: PointerEvent): void => {
    if (!this.resizing) return;
    const delta = event.clientX - this.resizing.startX;
    const width = Math.round(Math.min(520, Math.max(220, this.resizing.startWidth + (this.resizing.panel === 'tree' ? -delta : delta))));
    if (this.resizing.panel === 'tree') this.treeWidth = width; else this.propsWidth = width;
  };

  private stopResize = (): void => {
    if (!this.resizing) return;
    this.resizing = null;
    window.removeEventListener('pointermove', this.onResizeMove);
    window.removeEventListener('pointerup', this.stopResize);
    this.saveLayout();
  };

  private saveLayout(): void {
    try {
      localStorage.setItem('hm.studio.layout', JSON.stringify({ treeWidth: this.treeWidth, propsWidth: this.propsWidth, treeCollapsed: this.treeCollapsed, propsCollapsed: this.propsCollapsed }));
    } catch { /* storage unavailable: layout is per session only */ }
  }

  private restoreLayout(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('hm.studio.layout') ?? 'null');
      if (!saved) return;
      if (Number.isFinite(saved.treeWidth)) this.treeWidth = Math.min(520, Math.max(220, saved.treeWidth));
      if (Number.isFinite(saved.propsWidth)) this.propsWidth = Math.min(520, Math.max(220, saved.propsWidth));
      this.treeCollapsed = saved.treeCollapsed === true;
      this.propsCollapsed = saved.propsCollapsed === true;
    } catch { /* ignore unreadable layout */ }
  }

  usesPlaceholders(draft: CampaignDraft): boolean {
    if (draft !== this.placeholderIn) { this.placeholderIn = draft; this.placeholderUsed = withStudioPlaceholders(draft).used; }
    return this.placeholderUsed;
  }

  typeLabel(block: CampaignBlock): string { return BLOCK_LABELS[block.type] ?? block.type; }
  typeIcon(block: CampaignBlock): LucideIconData { return studioIcon(block.type); }

  toggleCollapsed(key: string, event: Event): void {
    event.stopPropagation();
    this.collapsed.has(key) ? this.collapsed.delete(key) : this.collapsed.add(key);
  }

  hover(id: string | null): void { this.state.setHoveredBlock(id, 'builder'); }

  toggleVisibility(node: StudioNode, event: Event): void {
    event.stopPropagation();
    this.state.toggleBlockVisibility(node.key);
  }

  move(node: StudioNode, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();
    if (direction === 'up') this.state.moveBlockUpInScope(node.key, node.scopeIds);
    else this.state.moveBlockDownInScope(node.key, node.scopeIds);
    this.scrollOnHighlight = this.selectedKey === node.key;
  }

  // The same catalog and rules as Step 9's "add block" panel.
  get addGroups(): { label: string; types: BlockType[] }[] {
    return BLOCK_GROUPS
      .map(g => ({ ...g, types: g.types.filter(t => isSectionAvailableFor(t, 'campaign')) }))
      .filter(g => g.types.length > 0);
  }
  blockLabel(type: BlockType): string { return BLOCK_LABELS[type]; }
  blockIcon(type: BlockType): LucideIconData { return studioIcon(type); }
  isAlreadyAdded(type: BlockType, blocks: CampaignBlock[]): boolean {
    return SINGLE_INSTANCE.includes(type) && blocks.some(b => b.type === type);
  }

  addBlock(type: BlockType, blocks: CampaignBlock[]): void {
    if (this.isAlreadyAdded(type, blocks)) return;
    const parentId = this.addTarget;
    const id = parentId ? this.state.addBlockToContainer(parentId, type) : this.state.addBlock(type);
    if (parentId) this.collapsed.delete(parentId);
    this.addTarget = null;
    if (id) this.select(id);
  }

  openAddMenu(target: string | null): void {
    this.addTarget = target;
    this.showAddMenu = true;
    this.menu = null;
  }

  // Catalog groups for the add menu: inside a container the same set as Step
  // 9's "+ הוסף לכאן" (no Hero).
  addGroupsFor(blocks: CampaignBlock[]): { label: string; types: BlockType[] }[] {
    const parent = this.addTarget ? blocks.find(b => b.id === this.addTarget) ?? null : null;
    return this.addGroups
      .map(g => ({ ...g, types: g.types.filter(t => canPlaceIn(t, parent)) }))
      .filter(g => g.types.length > 0);
  }

  addTargetLabel(blocks: CampaignBlock[]): string {
    const parent = this.addTarget ? blocks.find(b => b.id === this.addTarget) : null;
    return parent ? 'הוספה לתוך: ' + (parent.label?.trim() || BLOCK_LABELS[parent.type]) : 'הוספה לעמוד';
  }

  actionsFor(block: CampaignBlock): StudioAction[] { return blockActions(block, this.state.canDuplicateBlock(block.id, SINGLE_INSTANCE)); }

  openMenu(node: StudioNode, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const atPointer = event.type === 'contextmenu';
    this.menu = { key: node.key, top: atPointer ? event.clientY : rect.bottom + 4, left: atPointer ? event.clientX : rect.left };
  }

  menuBlock(draft: CampaignDraft): CampaignBlock | undefined {
    return this.menu ? draft.blocks.find(b => b.id === this.menu!.key) : undefined;
  }

  runAction(action: StudioActionId, block: CampaignBlock): void {
    this.menu = null;
    switch (action) {
      case 'add-inside': this.openAddMenu(block.id); break;
      case 'add-tab': { const id = this.state.addTab(block.id); this.collapsed.delete(block.id); if (id) this.select(id); break; }
      case 'add-panel': { const id = this.state.addPanel(block.id); this.collapsed.delete(block.id); if (id) this.select(id); break; }
      case 'swap': this.state.swapContainerChildren(block.id); break;
      case 'convert': this.state.convertTabsAccordionType(block.id); break;
      case 'duplicate': { const id = this.state.duplicateBlock(block.id, SINGLE_INSTANCE); if (id) this.select(id); break; }
      case 'review': this.state.clearImportReview(block.id); break;
      case 'delete': this.askDelete(block); break;
    }
  }

  askDelete(block: CampaignBlock): void {
    const blocks = this.state.draft.blocks;
    const nested = blocks.filter(b => b.id !== block.id && isWithin(block.id, b.id, blocks)).length;
    this.pendingDelete = { id: block.id, label: block.label?.trim() || BLOCK_LABELS[block.type] || block.type, nested };
  }

  confirmDelete(): void {
    if (!this.pendingDelete) return;
    const { id } = this.pendingDelete;
    const removesSelection = this.selectedKey !== null && isWithin(id, this.selectedKey, this.state.draft.blocks);
    this.state.removeBlock(id);
    this.pendingDelete = null;
    if (removesSelection) this.select(this.openingKey, false);
  }

  cancelDelete(): void { this.pendingDelete = null; }

  // Tree drag and drop. Dragging also publishes the block / type to the state,
  // so a tree row or a catalog item can be dropped on the canvas too, as in
  // classic Step 9.
  onRowDragStart(node: StudioNode, event: DragEvent): void {
    this.dragKey = node.key;
    this.dragType = null;
    event.dataTransfer?.setData('text/plain', node.key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.state.setDraggedExistingBlockId(node.key);
  }

  onCatalogDragStart(type: BlockType, blocks: CampaignBlock[], event: DragEvent): void {
    if (this.isAlreadyAdded(type, blocks)) { event.preventDefault(); return; }
    this.dragType = type;
    this.dragKey = null;
    event.dataTransfer?.setData('text/plain', type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    this.state.setDraggedBlockType(type);
  }

  onDragEnd(): void {
    this.dragKey = null;
    this.dragType = null;
    this.dropHint = null;
    this.state.setDraggedExistingBlockId(null);
    this.state.setDraggedBlockType(null);
  }

  private dropPlacement(node: StudioNode, pos: 'before' | 'after' | 'inside', blocks: CampaignBlock[]): { parentId: string | null; index: number } | null {
    const type = this.dragKey ? blocks.find(b => b.id === this.dragKey)?.type : this.dragType;
    if (!type || this.dragKey === node.key) return null;
    const parentId = pos === 'inside' ? node.key : node.parentId;
    const parent = parentId ? blocks.find(b => b.id === parentId) ?? null : null;
    if (!canPlaceIn(type, parent)) return null;
    if (this.dragKey && parentId && isWithin(this.dragKey, parentId, blocks)) return null;
    const index = pos === 'inside' ? node.children.length : node.scopeIds.indexOf(node.key) + (pos === 'after' ? 1 : 0);
    return { parentId, index };
  }

  onRowDragOver(node: StudioNode, event: DragEvent, blocks: CampaignBlock[]): void {
    if (!this.dragKey && !this.dragType) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    const canHold = !!node.block && isParent(node.block);
    const pos: 'before' | 'after' | 'inside' = canHold && y > 0.3 && y < 0.7 ? 'inside' : y < 0.5 ? 'before' : 'after';
    if (!this.dropPlacement(node, pos, blocks)) { this.dropHint = null; return; }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.dragKey ? 'move' : 'copy';
    this.dropHint = { key: node.key, pos };
  }

  onRowDrop(node: StudioNode, event: DragEvent, blocks: CampaignBlock[]): void {
    const hint = this.dropHint;
    const placement = hint && hint.key === node.key ? this.dropPlacement(node, hint.pos, blocks) : null;
    if (!placement) { this.onDragEnd(); return; }
    event.preventDefault();
    event.stopPropagation();
    if (placement.parentId) this.collapsed.delete(placement.parentId);
    if (this.dragKey) {
      const id = this.dragKey;
      this.state.moveBlockTo(id, placement.parentId, placement.index);
      this.select(id, false);
    } else if (this.dragType) {
      const id = this.state.insertBlockAt(this.dragType, placement.parentId, placement.index);
      if (id) this.select(id);
    }
    this.onDragEnd();
  }

  // A template that changes the page type (regular ↔ quick donation page) on a
  // campaign donors can already see needs an explicit confirmation, and is
  // refused when the saved details couldn't be published in the new type (the
  // server checks this only when publishing).
  onTemplateSelected(selection: TemplateSelection): void {
    const draft = this.state.draft;
    const format = selection.template.pageFormat ?? 'full';
    const changesType = (draft.layout.pageFormat ?? 'full') !== format;
    if (changesType && draft.status !== 'draft') {
      const missing = publishMissingFields({ ...draft, layout: { ...draft.layout, pageFormat: format } });
      if (missing.length) {
        alert(`לא ניתן לעבור לתבנית "${selection.template.name}" כל עוד חסר: ${missing.join(', ')}. יש להשלים את הפרטים ולנסות שוב.`);
        return;
      }
      if (!confirm(`הקמפיין כבר גלוי לתורמים. לעבור לתבנית "${selection.template.name}"?\nהשינוי יוצג לתורמים לאחר השמירה. התוכן, התרומות והכתובת לא משתנים.`)) return;
    }
    this.state.switchTemplate(selection.template, selection.palette);
    this.showTemplatePicker = false;
    if (changesType) this.selectedKey = this.openingKey;
  }

  onPresetSelected(presetId: PresetId): void {
    this.state.applyPreset(presetId);
    this.showPresetPicker = false;
    this.showStartTemplatePicker = true;
  }

  // The template picked right after the preset starts the page, exactly as in
  // the classic flow; later switches go through switchTemplate().
  onStartTemplateSelected(selection: TemplateSelection): void {
    this.state.startFromTemplate(selection.template, selection.palette);
    this.showStartTemplatePicker = false;
    this.history.start();
  }

  // The preset picker's minimal page choice: the same 'minimal-donation'
  // template the classic create flow applies (no template step).
  onMinimalSelected(): void {
    const template = CAMPAIGN_TEMPLATES.find(t => t.id === 'minimal-donation');
    if (!template) return;
    const palette = TEMPLATE_PALETTES.find(p => p.id === template.defaultPaletteId) ?? TEMPLATE_PALETTES[0];
    this.state.startFromTemplate(template, palette);
    this.showPresetPicker = false;
    this.history.start();
  }
  leave(): void { this.router.navigate(['/campaigns']); }

  get classicEditorLink(): string[] { return this.isNew ? ['/campaigns/create'] : ['/campaigns', this.campaignId, 'edit']; }

  updateLabel(block: CampaignBlock, value: string): void { this.state.updateBlockLabel(block.id, value); }

  // Read-only publish readiness: exactly step 10's checks (publish-readiness.ts).
  // It never blocks saving; publishing itself still goes through step 10.
  private readinessCache: { draft: CampaignDraft; approved: boolean; value: { missing: string[]; approved: boolean; label: string; tone: 'ready' | 'missing' | 'pending' } } | null = null;

  readiness(draft: CampaignDraft): { missing: string[]; approved: boolean; label: string; tone: 'ready' | 'missing' | 'pending' } {
    const approved = publishEntityApproved(this.entity.currentEntity());
    if (this.readinessCache?.draft === draft && this.readinessCache.approved === approved) return this.readinessCache.value;
    const value = this.computeReadiness(draft, approved);
    this.readinessCache = { draft, approved, value };
    return value;
  }

  private computeReadiness(draft: CampaignDraft, approved: boolean): { missing: string[]; approved: boolean; label: string; tone: 'ready' | 'missing' | 'pending' } {
    const missing = publishMissingFields(draft);
    if (missing.length) return { missing, approved, tone: 'missing', label: missing.length === 1 ? 'חסר פרט אחד לפרסום' : `חסרים ${missing.length} פרטים לפרסום` };
    if (!approved) return { missing, approved, tone: 'pending', label: 'מוכן — ממתין לאישור העמותה' };
    return { missing, approved, tone: 'ready', label: 'מוכן לפרסום' };
  }

  readinessTitle(draft: CampaignDraft): string {
    const r = this.readiness(draft);
    if (r.missing.length) return 'חסר לפרסום: ' + r.missing.join(', ');
    return r.approved ? 'כל פרטי החובה לפרסום מולאו' : 'כל פרטי החובה מולאו. פרסום יתאפשר לאחר אישור העמותה.';
  }
}
