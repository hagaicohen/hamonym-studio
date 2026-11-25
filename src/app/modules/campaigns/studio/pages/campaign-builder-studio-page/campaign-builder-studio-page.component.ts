import {campaignBodyRoot} from '../../../utils/campaign-body-root';
import {StudioInspectorComponent,InspectorTab} from '../../components/studio-inspector/studio-inspector.component';
import {blockOrder,blockPlacement} from '../../../utils/campaign-composition';
import { StatCardSize, statCardSize, moveStatsItem } from '../../../utils/stats-visual-layout';
import { AfterViewChecked, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  LucideAngularModule, LucideIconData, Type, Image as ImageIcon, Video, Images, Columns2, MousePointerClick, Minus, LayoutGrid,
  ChartColumn, HandCoins, Gift, Handshake, Star, Heart, Megaphone, PanelTop, Rows3, ListCollapse, Share2, MessageCircle,
  Ticket, MapPin, Clock, Eye, EyeOff, ArrowUp, ArrowDown, ChevronDown, ChevronLeft, Plus, Undo2, Redo2, Layers, Box,
  ChevronRight, LayoutTemplate, Info, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Ellipsis, Trash2, Palette, PanelBottom, SlidersHorizontal, ExternalLink, Rocket, CircleCheck, CircleAlert, Copy,
  AlignRight, AlignCenter, AlignLeft, AArrowUp, AArrowDown, Heading, Bold, Baseline,
} from 'lucide-angular';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';
import { TextAlign, TextFontSize } from '../../../../../shared/models/text-style.model';
import { resolveOpeningComposition } from '../../../builder/styles/campaign-styles';
import { HM_ICON_SIZE, HM_ICON_STROKE } from '../../../../../shared/ui/design-system/icons';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { BlockType, CampaignBlock, CampaignDraft, CampaignStatus, CampaignStudioStateService, StatsBlockData, StatItem, ContainerBlockData, StudioCanvasArea } from '../../../services/campaign-studio-state.service';
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
import { UiLanguageService } from '../../../../../core/i18n/ui-language.service';
import { dirOf } from '../../../../../shared/utils/direction';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HmTextPipe, textOf } from '../../../../../core/i18n/text.pipe';
import { HmCampaignContentDirective } from '../../../../../core/i18n/content-language';
import { CampaignTypographyEditorComponent } from '../../typography/campaign-typography-editor.component';
import { TextRoleEditorComponent } from '../../../../../shared/ui/text-role-editor/text-role-editor.component';
import type { TextStyle } from '../../../../../shared/models/text-style.model';
import { STUDIO_NARROW_VIEWPORT } from '../../services/studio-viewport';
import { InlineTextEditor } from '../../canvas/inline-text-editor';
import { getAt, setAt } from '../../../utils/content-i18n';
import { roleSizePx } from '../../preview/text-role.directive';
import { ElementFontField, ElementFontStyle, elementFont, ensureStackLoaded, fontByStack, fontsFor, setElementFont } from '../../../utils/campaign-fonts';
import { ElementColorField, ElementColorStyle, contrastRatio, elementColor, setElementColor, toHex } from '../../../utils/element-color';
import { CONTENT_LANGS, ContentLang, MissingTranslation, isEnglishPublished, missingHebrew, missingTranslations, publicLanguages } from '../../../utils/content-i18n';

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

type OpeningPart = 'title' | 'subtitle' | 'hero-cta';

export interface FloatAction {
  id: 'align-right' | 'align-center' | 'align-left' | 'smaller' | 'larger' | 'text-smaller' | 'text-larger' | 'bold' | 'text-color' | 'typography' | 'hide' | 'up' | 'down' | 'duplicate' | 'delete' | 'stat-up' | 'stat-down' | 'stat-hide' | 'logo-edit' | 'logo-smaller' | 'logo-larger' | 'edit-text' | 'to-top';
  icon: LucideIconData;
  label: string;
  align?: TextAlign;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

const ALIGN_ACTIONS: FloatAction[] = [
  { id: 'align-right', icon: AlignRight, label: 'studio.float.alignRight', align: 'right' },
  { id: 'align-center', icon: AlignCenter, label: 'studio.float.alignCenter', align: 'center' },
  { id: 'align-left', icon: AlignLeft, label: 'studio.float.alignLeft', align: 'left' },
];
const TEXT_SIZES: TextFontSize[] = ['sm', 'md', 'lg', 'xl'];
const TYPOGRAPHY_ACTION: FloatAction = { id: 'typography', icon: Type, label: 'studio.float.typography' };
const COLOR_ACTION: FloatAction = { id: 'text-color', icon: Baseline, label: 'studio.float.color' };
const PRESET_TEXT_COLORS = ['#0f172a', '#334155', '#64748b', '#ffffff', '#583cd6', '#2563eb', '#0d9488', '#16a34a', '#d97706', '#dc2626', '#db2777', '#7c3aed'];
type FloatTextStyle = ElementFontStyle & ElementColorStyle;
// Blocks whose text has a typography editor in the properties panel.
const TYPOGRAPHY_BLOCKS = new Set(['rich-text', 'cta', 'donation-widget', 'stats', 'donors', 'ambassadors', 'image', 'video', 'gallery']);

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'studio.status.draft', published: 'studio.status.published', paused: 'studio.status.paused', ended: 'studio.status.ended',
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
  if (parent.type === 'container') return true;
  return false;
}

function isWithin(ancestorId: string, id: string, blocks: CampaignBlock[]): boolean {
  if (ancestorId === id) return true;
  const ancestor = blocks.find(b => b.id === ancestorId);
  if (!ancestor || !isParent(ancestor)) return false;
  return ((ancestor.data as ContainerBlockData).childBlockIds ?? []).some(c => isWithin(c, id, blocks));
}

export type StudioActionId = 'to-top' | 'add-inside' | 'add-tab' | 'add-panel' | 'swap' | 'convert' | 'duplicate' | 'review' | 'delete';
export interface StudioAction { id: StudioActionId; label: string; danger?: boolean; }

// Block actions offered in the tree context menu and the properties panel;
// the same conditions as the classic Step 9 block row.
export function blockActions(block: CampaignBlock, canDuplicate = !SINGLE_INSTANCE.includes(block.type), removable = !!block.userAdded): StudioAction[] {
  const data = block.data as ContainerBlockData;
  const actions: StudioAction[] = [{ id: 'to-top', label: block.placement === 'below-header' ? 'studio.actions.returnToContent' : 'studio.actions.moveBelowHeader' }];
  if (block.type === 'container') actions.push({ id: 'add-inside', label: 'studio.actions.addInside' });
  if (block.type === 'tabs') actions.push({ id: 'add-tab', label: 'studio.actions.addTab' }, { id: 'convert', label: 'studio.actions.convertToPanels' });
  if (block.type === 'accordion') actions.push({ id: 'add-panel', label: 'studio.actions.addPanel' }, { id: 'convert', label: 'studio.actions.convertToTabs' });
  if (block.type === 'container' && data.direction === 'row' && (data.childBlockIds ?? []).length >= 2) {
    actions.push({ id: 'swap', label: 'studio.actions.swapSides' });
  }
  if (canDuplicate) actions.push({ id: 'duplicate', label: 'studio.actions.duplicate' });
  if (block.importReview?.needsReview) actions.push({ id: 'review', label: 'studio.actions.markReviewed' });
  if (removable) actions.push({ id: 'delete', label: 'studio.actions.delete', danger: true });
  return actions;
}

@Component({
  selector: 'app-campaign-builder-studio-page',
  standalone: true,
  imports: [StudioInspectorComponent, HmCampaignContentDirective, CampaignTypographyEditorComponent, TextRoleEditorComponent, HmTextPipe, TranslocoPipe, 
    CommonModule, RouterLink, LucideAngularModule, CampaignStudioTopbarComponent, CampaignPreviewComponent, PlatformTopStripComponent,
    TemplatePickerComponent, CampaignPresetPickerComponent, CampaignBasicStepComponent, CampaignPageBuilderStepComponent, CampaignTypeStepComponent, CampaignDonationStepComponent,
    CampaignOfferingsStepComponent, CampaignRegistrationStepComponent, CampaignSponsorsStepComponent,
    CampaignAmbassadorsStepComponent, CampaignUpdatesStepComponent, CampaignPublishStepComponent,
    CampaignMinimalDetailsStepComponent, MinimalDonationPageComponent, TextStyleEditorComponent,
  ],
  templateUrl: './campaign-builder-studio-page.component.html',
  styleUrl: './campaign-builder-studio-page.component.css',
})
export class CampaignBuilderStudioPageComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly i18n = inject(TranslocoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private entity = inject(CurrentEntityService);
  private api = inject(CampaignApiService);
  private loader = inject(AppLoaderService);
  readonly state = inject(CampaignStudioStateService);
  readonly ui = inject(StudioUiService);
  private readonly language = inject(UiLanguageService);
  @ViewChild('canvas') canvas?: ElementRef<HTMLElement>;
  @ViewChild('floatBar') floatBar?: ElementRef<HTMLElement>;

  readonly draft$ = this.state.draft$;
  readonly icons = {
    Eye, EyeOff, ArrowUp, ArrowDown, ChevronDown, ChevronLeft, ChevronRight, Plus, Undo2, Redo2, Layers, PanelTop,
    LayoutTemplate, Info, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Ellipsis, Trash2, Palette, PanelBottom, SlidersHorizontal, ImageIcon, ExternalLink, Rocket, CircleCheck, CircleAlert, Copy,
  };
  readonly iconSize = HM_ICON_SIZE.sm;
  // Panels follow the interface direction: in English the tree is on the left.
  get isLtr(): boolean { return this.language.dir() === 'ltr'; }
  readonly iconStroke = HM_ICON_STROKE;
  readonly openingKey = 'area:opening';
  // Page areas edited through classic Step 9's design area ("עיצוב הקמפיין"),
  // each opening its own section there.
  readonly designAreas: { key: string; label: string; design: 'page' | 'logo' | 'footer'; icon: LucideIconData; title: string }[] = [
    { key: 'area:design', label: 'studio.areas.designLabel', design: 'page', icon: Palette, title: 'studio.areas.designTitle' },
    { key: 'area:logo', label: 'studio.areas.logoLabel', design: 'logo', icon: ImageIcon, title: 'studio.areas.logoTitle' },
    { key: 'area:footer', label: 'studio.areas.footer', design: 'footer', icon: PanelBottom, title: 'studio.areas.footer' },
  ];
  designArea(key: string | null) { return this.designAreas.find(a => a.key === key); }

  // The opening's own parts, each selectable from the canvas or the tree and
  // edited directly (no detour through the page design area).
  readonly openingParts: { key: string; part: OpeningPart; label: string; icon: LucideIconData }[] = [
    { key: 'part:title', part: 'title', label: 'studio.parts.title', icon: Heading },
    { key: 'part:subtitle', part: 'subtitle', label: 'studio.parts.subtitle', icon: Type },
    { key: 'part:hero-cta', part: 'hero-cta', label: 'studio.parts.heroCta', icon: MousePointerClick },
  ];
  openingPart(key: string | null) { return this.openingParts.find(p => p.key === key); }
  readonly heroPositions: { value: 'above' | 'hero' | 'below' | 'hidden'; label: string }[] = [
    { value: 'above', label: 'studio.heroPositions.above' }, { value: 'hero', label: 'studio.heroPositions.hero' }, { value: 'below', label: 'studio.heroPositions.below' }, { value: 'hidden', label: 'studio.heroPositions.hidden' },
  ];

  // Page areas that host a classic wizard step as-is. Whether a step is edited
  // here, managed in the Workspace (published campaigns, steps 3–8), or not
  // shown at all comes from the wizard's own rules (wizard-steps.ts).
  readonly stepAreas: { key: string; step: number; label: string; title: string; icon: LucideIconData; workspacePath?: string; workspaceFragment?: string }[] = [
    { key: 'area:settings', step: 2, label: 'studio.steps.settingsLabel', title: 'studio.steps.settingsTitle', icon: SlidersHorizontal },
    { key: 'area:donation', step: 3, label: 'studio.steps.donation', title: 'studio.steps.donation', icon: HandCoins, workspacePath: 'donation' },
    { key: 'area:rewards', step: 4, label: 'studio.steps.rewardsLabel', title: 'studio.steps.rewardsTitle', icon: Gift, workspacePath: 'rewards' },
    { key: 'area:registration', step: 5, label: 'studio.steps.registrationLabel', title: 'studio.steps.registrationTitle', icon: Ticket, workspacePath: 'registration' },
    { key: 'area:sponsors', step: 6, label: 'studio.steps.sponsorsLabel', title: 'studio.steps.sponsorsTitle', icon: Handshake, workspacePath: 'sponsors' },
    { key: 'area:ambassadors', step: 7, label: 'studio.steps.ambassadorsLabel', title: 'studio.steps.ambassadorsTitle', icon: Star, workspacePath: 'ambassadors' },
    { key: 'area:updates', step: 8, label: 'studio.steps.updatesLabel', title: 'studio.steps.updatesTitle', icon: Megaphone, workspacePath: 'dashboard', workspaceFragment: 'updates' },
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
  get visualPilot(){return this.route.snapshot.queryParamMap.get('visualPilot')!=='0';}
  insertionAnchor:string|null=null;
  openCanvasInsert(target:{anchor:string;inside?:boolean;bodyStart?:boolean}){if(target.bodyStart){const id=this.state.ensureBodyRoot();if(!id)return;this.openAddMenu(id);const root=campaignBodyRoot(this.state.draft)!;this.insertionAnchor=this.state.draft.blocks.filter(b=>(root.data as ContainerBlockData).childBlockIds.includes(b.id)).sort((a,b)=>blockOrder(a,this.ui.device==='mobile')-blockOrder(b,this.ui.device==='mobile'))[0]?.id??null;this.collapsed.delete(id);}else{const parent=this.state.draft.blocks.find(b=>(b.data as ContainerBlockData).childBlockIds?.includes(target.anchor));this.openAddMenu(target.inside?target.anchor:parent?.id??null);this.insertionAnchor=target.inside?null:target.anchor;}this.treeCollapsed=false;if(this.narrow)this.propsCollapsed=true;}
  treeSearch=''; addQuery=''; floatMoreOpen=false;
  ifNarrowCloseProps(){if(this.narrow)this.propsCollapsed=true;}
  openVisualInspector(tab:InspectorTab){this.inspectorTab=tab;this.propsCollapsed=false;if(this.narrow)this.treeCollapsed=true;this.floatMoreOpen=false;}
  selectedLabel(draft:CampaignDraft){const block=this.selectedBlock(draft);return block?textOf(this.i18n,block.label||BLOCK_LABELS[block.type]):this.selectedKey?this.i18n.translate(this.openingPart(this.selectedKey)?.label??'studio.workspace.page'):this.i18n.translate('studio.workspace.selectHint');}
  primaryFloat(actions:FloatAction[]){return this.visualPilot?actions.filter(a=>['edit-text','typography','text-color'].includes(a.id)):actions;}
  secondaryFloat(actions:FloatAction[]){return actions.filter(a=>!['edit-text','typography','text-color'].includes(a.id));}
  addSummary(preset:'classic'|'animated'|'minimal',blocks:CampaignBlock[]){this.addBlock('progress',blocks);const id=this.selectedKey,block=this.state.draft.blocks.find(b=>b.id===id);if(!block)return;this.state.updateBlockData(block.id,{...block.data,summary:{preset,heading:this.i18n.translate('studio.summary.defaultHeading'),targetLabel:this.i18n.translate('studio.summary.defaultTarget'),animateTrack:preset==='animated',showBadge:preset==='animated'}} as any);this.updateLabel(block,this.i18n.translate('studio.summary.name'));this.inspectorTab='content';}
  addColumnLayout(columns:2|3,blocks:CampaignBlock[]){this.history.commit();this.addBlock('container',blocks);const id=this.selectedKey;if(!id||id.startsWith('area:'))return;const parent=this.state.draft.blocks.find(b=>b.id===id);if(!parent||parent.type!=='container')return;this.state.updateBlockData(id,{...parent.data,direction:'row',splitPercent:50} as ContainerBlockData);this.updateLabel(parent,this.i18n.translate(columns===2?'studio.workspace.twoColumns':'studio.workspace.threeColumns'));for(let i=0;i<columns;i++){const child=this.state.addBlockToContainer(id,'container');if(child){const b=this.state.draft.blocks.find(b=>b.id===child)!;this.updateLabel(b,this.i18n.translate('studio.workspace.column')+' '+(i+1));}}this.collapsed.delete(id);this.inspectorTab='layout';this.select(id);this.history.commit();}
  textEditingScope:'both'|'desktop'|'mobile'='both';
  inspectorTab:InspectorTab='content';
  editSelectedText(){const host=this.canvas?.nativeElement;const selector=this.canvasSelector(this.selectedKey);const selected=selector?host?.querySelector(selector):host;const text=selected?.matches('[data-inline-edit]')?selected:(this.selectedBlock(this.state.draft)?.type==='rich-text'?selected?.querySelector('[data-inline-rich]'):selected?.querySelector('[data-inline-edit]'));text?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));}
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
  private resizing: { panel: 'tree' | 'props'; startX: number; startWidth: number; sign: 1 | -1 } | null = null;
  private placeholderIn: CampaignDraft | null = null;
  private placeholderUsed = false;
  private highlighted: string | null = null;
  private scrollOnHighlight = false;
  private destroy$ = new Subject<void>();
  // Undo/redo of campaign edits in this session (studio-history.ts).
  readonly history = new StudioHistory(this.state);
  // Page areas clicked in the canvas, and where they open in the tree.
  private readonly canvasAreas: Record<StudioCanvasArea, string> = {
    opening: 'area:opening', nav: 'area:design', footer: 'area:footer',
    title: 'part:title', subtitle: 'part:subtitle', logo: 'area:logo', 'hero-cta': 'part:hero-cta',
  };

  private readonly zone = inject(NgZone);

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => document.addEventListener('mousedown', this.onDocumentMouseDown));
    this.restoreLayout();
    if(this.visualPilot){this.treeWidth=236;this.propsWidth=304;this.treeCollapsed=this.narrow;this.propsCollapsed=true;this.selectedKey=null;}
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    this.state.setPageBuilderActive(true);
    // A click on a block in the canvas (CampaignPreviewComponent) selects it here.
    this.state.focusBlockRequest$.pipe(takeUntil(this.destroy$)).subscribe(({ id }) => {this.select(id,false);const part=this.state.summarySelection();if(part?.blockId===id)this.inspectorTab=['heading','target'].includes(part.part)?'content':'design';});
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
        if (!data?.id) { this.loadError = 'studio.errors.notFound'; return; }
        // Opening the Studio never changes the campaign. The legacy sidebar
        // conversion stays in classic Step 9; the renderer shows legacy sidebar
        // layouts as they are.
        this.state.loadDraft(data);
        if(this.visualPilot)this.collapsed=new Set(this.state.draft.blocks.filter(b=>isParent(b)).map(b=>b.id));
        this.history.start();
        this.loaded = true;
        this.openReturnStep(Number(this.route.snapshot.queryParamMap.get('returnStep')));
      },
      error: () => { this.loader.hide(); this.loadError = 'studio.errors.loadFailed'; },
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousedown', this.onDocumentMouseDown);
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
    const canvas = this.canvas?.nativeElement ?? null;
    if (canvas !== this.canvasLinksBound) {
      this.canvasLinksBound?.removeEventListener('click', this.blockCanvasLinks, true);
      this.canvasLinksBound?.removeEventListener('dblclick', this.onCanvasDblClick, true);
      this.canvasLinksBound?.removeEventListener('click', this.onCanvasClickOutside, true);
      canvas?.addEventListener('click', this.blockCanvasLinks, true);
      canvas?.addEventListener('dblclick', this.onCanvasDblClick, true);
      canvas?.addEventListener('click', this.onCanvasClickOutside, true);
      this.canvasLinksBound = canvas;
    }
    const root = this.canvas?.nativeElement;
    if (!root) return;
    const id = this.canvasSelector(this.selectedKey);
    const current = root.querySelectorAll<HTMLElement>('.studio-selected');
    const targets = id ? Array.from(root.querySelectorAll<HTMLElement>(id)) : [];
    this.placeFloatBar(root, targets[0]);
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
    if (key === 'area:logo') return '[data-studio-part="logo"]';
    const part = this.openingPart(key);
    if (part) return `[data-studio-part="${part.part}"]`;
    if (!key || key === 'area:design') return null;
    if (key === 'area:opening') return '[data-studio-area="opening"]';
    if (key === 'area:footer') return '[data-studio-area="footer"]';
    if (key.startsWith('area:')) return null;
    const selected=this.state.selectedStatistic();
    const base=`[data-block-id="${CSS.escape(key)}"]`;
    return selected?.blockId===key && (this.state.draft.blocks.find(b=>b.id===key)?.data as StatsBlockData)?.visualLayout ? `${base} [data-stat-key="${CSS.escape(selected.key)}"]` : base;
  }

  // Floating toolbar above the selected element (below it when there is no
  // room). Positioned straight on the element: this runs after every check,
  // where a bound property would change mid-check.
  private placeFloatBar(root: HTMLElement, target: HTMLElement | undefined): void {
    const bar = this.floatBar?.nativeElement;
    if (!bar) return;
    if (!target) { bar.style.visibility = 'hidden'; return; }
    if (this.floatHidden) { bar.style.visibility = 'hidden'; return; }
    const frame = root.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    // Above the element when there is room, otherwise below it; never outside the canvas.
    const viewport=root.closest('.canvas-area')?.getBoundingClientRect();
    const visibleTop=Math.max(frame.top,viewport?.top??0,0)-frame.top+4;
    const visibleBottom=Math.min(frame.bottom,viewport?.bottom??window.innerHeight,window.innerHeight)-frame.top-4;
    const above = rect.top - frame.top - height - 8;
    const below = rect.bottom - frame.top + 8;
    let top = above >= visibleTop ? above : below+height<=visibleBottom ? below : Math.max(visibleTop,visibleBottom-height);
    // Aligned with the element's reading start (right in Hebrew, left in English), clamped to the canvas.
    const rtl = (root.getAttribute('dir') ?? 'rtl') === 'rtl';
    const preferred = rtl ? rect.right - frame.left - width : rect.left - frame.left;
    const left = Math.min(Math.max(4, preferred), Math.max(4, frame.width - width - 4));
    // Keep contextual controls clear of neighbouring Hero copy, not just selection.
    const protectedRects=Array.from(root.querySelectorAll<HTMLElement>('.hm-hero-title,.hm-hero-subtitle,.hm-hero-title-external,.hm-hero-subtitle-external,.hm-project-description,.hm-opening-title,.hm-opening-intro,.hm-hero-meta,.hm-hero-org-logo,header,nav')).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
    const clear=(y:number)=>!protectedRects.some(r=>frame.left+left<r.right+4&&frame.left+left+width>r.left-4&&frame.top+y<r.bottom+4&&frame.top+y+height>r.top-4);
    const candidates=[top,above,below,...protectedRects.flatMap(r=>[r.top-frame.top-height-4,r.bottom-frame.top+4]),visibleTop,visibleBottom-height];
    const free=candidates.find(y=>y>=visibleTop&&y+height<=visibleBottom&&clear(y));
    if(free!==undefined)top=free;
    bar.style.top = `${top}px`;
    bar.style.removeProperty('right');
    bar.style.left = `${left}px`;
    bar.style.visibility = 'visible';
    const line = bar.querySelector<HTMLElement>('.float-color-line');
    if (line) {
      const text = this.floatTextElement();
      line.style.background = (text && toHex(getComputedStyle(text).color)) || 'currentColor';
    }
    const menu = bar.querySelector<HTMLElement>('.float-menu');
    if (menu) {
      // Opens upward when there is no room below; shifted sideways to stay in the canvas.
      bar.classList.toggle('float-bar--menu-up', top + height + menu.offsetHeight + 8 > frame.height && top > menu.offsetHeight + 8);
      menu.style.translate = '';
      const box = menu.getBoundingClientRect();
      const shift = box.right > frame.right - 4 ? frame.right - 4 - box.right : box.left < frame.left + 4 ? frame.left + 4 - box.left : 0;
      if (shift) menu.style.translate = `${shift}px 0`;
    } else bar.classList.remove('float-bar--menu-up');
  }

  hasClassicOpening(draft: CampaignDraft): boolean {
    return resolveOpeningComposition(draft.layout.openingComposition, draft.layout.campaignStyleId) === 'classic';
  }

  heroPosition(draft: CampaignDraft, part: OpeningPart): string {
    return (part === 'title' ? draft.layout.heroTitlePosition : draft.layout.heroSubtitlePosition) ?? 'hero';
  }

  setHeroPosition(part: OpeningPart, pos: 'above' | 'hero' | 'below' | 'hidden'): void {
    if (part === 'title') this.state.setHeroTitlePosition(pos);
    else this.state.setHeroSubtitlePosition(pos);
  }

  // On the Hero the copy is centered unless a part has its own alignment;
  // above/below it follows the shared alignment (see the preview's heroTextAlign).
  openingTextStyle(draft: CampaignDraft): TextStyle {
    return this.isMinimal(draft) ? { align: 'center', color: '', fontSize: 'md', position: 'center', titleColor: draft.layout.minimalTitleColor, subtitleColor: draft.layout.minimalSubtitleColor, ...draft.layout.minimalTextStyle } : draft.heroTextStyle;
  }
  setOpeningTextStyle(style: TextStyle): void {
    const draft = this.state.draft;
    this.state.patch(this.isMinimal(draft) ? { layout: { ...draft.layout, minimalTextStyle: style } } : { heroTextStyle: style });
  }

  partAlignFallback(draft: CampaignDraft, part: OpeningPart): TextAlign {
    if (this.isMinimal(draft)) return (part === 'title' ? draft.layout.minimalHeaderTitleAlign : draft.layout.minimalHeaderSubtitleAlign) ?? 'center';
    return this.heroPosition(draft, part) === 'hero' ? 'center' : draft.heroTextStyle.align;
  }

  // The few actions used most often on the selected element, next to it on
  // the canvas. Everything else stays in the properties panel.
  statsMoreOpen=false;
  readonly statSizes:StatCardSize[]=['normal','wide','featured'];
  statsContext(draft:CampaignDraft):{block:CampaignBlock;data:StatsBlockData;item:StatItem}|null {
    const selected=this.state.selectedStatistic();
    const block=draft.blocks.find(b=>b.id===this.selectedKey && b.id===selected?.blockId && b.type==='stats');
    const data=block?.data as StatsBlockData|undefined,item=data?.items.find(i=>i.key===selected?.key && i.visible);
    return block && data?.visualLayout && item ? {block,data,item} : null;
  }
  selectedStatsBlock(draft:CampaignDraft):CampaignBlock|undefined {return draft.blocks.find(b=>b.id===this.selectedKey && b.type==='stats');}
  toggleArrangeStats(draft:CampaignDraft):void {
    const block=this.selectedStatsBlock(draft);if(!block)return;
    const data=block.data as StatsBlockData;
    if(this.state.arrangingStatistics()===block.id){this.state.arrangingStatistics.set(null);return;}
    if(!data.visualLayout)this.state.updateBlockData(block.id,{...data,visualLayout:{preset:'balanced',version:2}});
    const first=[...data.items].sort((a,b)=>a.order-b.order).find(i=>i.visible);
    if(!this.statsContext(draft) && first)this.state.selectedStatistic.set({blockId:block.id,key:first.key});
    this.state.arrangingStatistics.set(this.state.arrangingStatistics()===block.id?null:block.id);
  }
  selectedStatSize(draft:CampaignDraft):StatCardSize {const c=this.statsContext(draft);return c?statCardSize(c.data,c.item):'normal';}
  statSizeDisabled(draft:CampaignDraft):boolean {const c=this.statsContext(draft);return !c || (this.state.statisticsCanvas()[c.block.id]?.columns??2)<2 || (c.item.key==='percent' && c.data.visualLayout?.progress==='bar');}
  setCanvasStatSize(value:string,draft:CampaignDraft):void {
    const c=this.statsContext(draft);if(!c || this.statSizeDisabled(draft) || !this.statSizes.includes(value as StatCardSize))return;
    this.state.updateBlockData(c.block.id,{...c.data,visualLayout:c.data.visualLayout??{preset:'balanced',version:2},items:c.data.items.map(i=>i.key===c.item.key?{...i,size:value as StatCardSize}:i)});
  }
  statTextActions(draft:CampaignDraft):FloatAction[] {return this.textActions(draft);}
  floatActions(draft: CampaignDraft): FloatAction[] {
    const key = this.selectedKey;
    if (!key) return [];
    const stat=this.statsContext(draft);
    if(stat){const items=[...stat.data.items].filter(i=>i.visible).sort((a,b)=>a.order-b.order),at=items.findIndex(i=>i.key===stat.item.key);return [
      {id:'stat-up',icon:ArrowUp,label:'builder.visualStats.previous',disabled:at===0},
      {id:'stat-down',icon:ArrowDown,label:'builder.visualStats.next',disabled:at===items.length-1},
      TYPOGRAPHY_ACTION,COLOR_ACTION,{id:'stat-hide',icon:EyeOff,label:'studio.float.hide'}
    ];}
    const part = this.openingPart(key)?.part;
    if (part === 'title' || part === 'subtitle') {
      const style = this.openingTextStyle(draft);
      const align = (part === 'title' ? style.titleAlign : style.subtitleAlign) ?? this.partAlignFallback(draft, part);
      const size = part === 'title' ? (style.titleFontSize || style.fontSize) : (style.subtitleFontSize || 'md');
      return [
        { id: 'edit-text', icon: Type, label: 'studio.float.editText' },
        ...ALIGN_ACTIONS.map(a => ({ ...a, active: align === a.align })),
        { id: 'smaller', icon: AArrowDown, label: 'studio.float.smaller', disabled: size === TEXT_SIZES[0] },
        { id: 'larger', icon: AArrowUp, label: 'studio.float.larger', disabled: size === TEXT_SIZES[TEXT_SIZES.length - 1] },
        TYPOGRAPHY_ACTION,
        COLOR_ACTION,
        ...(this.isMinimal(draft) ? [] : [{ id: 'hide' as const, icon: EyeOff, label: 'studio.float.hide' }]),
      ];
    }
    if (part === 'hero-cta') {
      return [
        ...ALIGN_ACTIONS.map(a => ({ ...a, active: draft.heroCtaConfig.align === a.align })),
        { id: 'hide', icon: EyeOff, label: 'studio.float.hide' },
      ];
    }
    if (key === 'area:logo') {
      const align = this.isMinimal(draft) ? draft.layout.minimalHeaderLogoAlign ?? 'center' : draft.heroLogoPosition === 'above' ? draft.logoStripAlign : draft.heroLogoPosition;
      return [
        ...(this.isMinimal(draft) ? [
          { id: 'logo-edit' as const, icon: ImageIcon, label: 'builder.steps.replaceLogo' },
          { id: 'logo-smaller' as const, icon: AArrowDown, label: 'studio.float.smaller', disabled: draft.layout.minimalLogoSize === 'sm' },
          { id: 'logo-larger' as const, icon: AArrowUp, label: 'studio.float.larger', disabled: draft.layout.minimalLogoSize === 'lg' },
        ] : []),
        ...ALIGN_ACTIONS.map(a => ({ ...a, active: align === a.align })),
        { id: 'hide', icon: EyeOff, label: 'studio.float.hide' },
      ];
    }
    const block = draft.blocks.find(b => b.id === key);
    const node = block && this.findNode(this.tree(draft), key);
    if (!block || !node) return [];
    if(key===draft.layout.bodyRootId)return [];
    const scopeIds=this.compositionScope(node,draft,block);
    return [
      { id: 'to-top', icon: ArrowUp, label: block.placement === 'below-header' ? 'studio.actions.returnToContent' : 'studio.actions.moveBelowHeader' },
      ...this.textActions(draft),
      ...(TYPOGRAPHY_BLOCKS.has(block.type) ? [TYPOGRAPHY_ACTION] : []),
      { id: 'up', icon: ArrowUp, label: 'studio.float.up', disabled: scopeIds[0] === key },
      { id: 'down', icon: ArrowDown, label: 'studio.float.down', disabled: scopeIds[scopeIds.length - 1] === key },
      ...(this.state.canDuplicateBlock(key, SINGLE_INSTANCE) ? [{ id: 'duplicate' as const, icon: Copy, label: 'studio.actions.duplicate' }] : []),
      { id: 'hide', icon: EyeOff, label: 'studio.float.hide' },
      ...(this.state.canRemoveBlock(key) ? [{ id: 'delete' as const, icon: Trash2, label: 'studio.actions.delete', danger: true }] : []),
    ];
  }

  runFloat(action: FloatAction, draft: CampaignDraft): void {
    this.floatMoreOpen=false;
    const key = this.selectedKey;
    if (!key || action.disabled) return;
    if (action.id === 'to-top') { const block = draft.blocks.find(b => b.id === key); if (block) this.runAction('to-top', block); return; }
    if (action.id === 'edit-text') {
      const selector = this.canvasSelector(key);
      const target = selector ? this.canvas?.nativeElement.querySelector<HTMLElement>(selector) : null;
      const text = target?.matches('[data-inline-edit]') ? target : target?.querySelector<HTMLElement>('[data-inline-edit]');
      text?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      return;
    }
    // T opens the font list for the selected text; elements without one open their panel editor.
    if (action.id === 'typography') {
      this.statsMoreOpen=false;
      this.colorMenuOpen = false;
      if (this.floatFont(draft)) this.fontMenuOpen = !this.fontMenuOpen; else this.openTypography();
      return;
    }
    if (action.id === 'text-color') {
      this.statsMoreOpen=false;
      this.fontMenuOpen = false;
      this.colorMenuOpen = !this.colorMenuOpen;
      if (this.colorMenuOpen) this.readColorContext();
      return;
    }
    const stat=this.statsContext(draft);
    if(stat && ['stat-up','stat-down','stat-hide'].includes(action.id)) {
      const items=[...stat.data.items].filter(i=>i.visible).sort((a,b)=>a.order-b.order),at=items.findIndex(i=>i.key===stat.item.key);
      const target=items[at+(action.id==='stat-up'?-1:1)];
      const next=action.id==='stat-hide'?stat.data.items.map(i=>i.key===stat.item.key?{...i,visible:false}:i):target?moveStatsItem(stat.data.items,stat.item.key,target.key,true):stat.data.items;
      this.state.updateBlockData(stat.block.id,{...stat.data,items:next});
      if(action.id==='stat-hide'){this.state.selectedStatistic.set(null);this.statsMoreOpen=false;}
      return;
    }
    const part = this.openingPart(key)?.part;
    if (part === 'title' || part === 'subtitle') {
      const style = this.openingTextStyle(draft);
      if (action.align) {
        this.setOpeningTextStyle({ ...style, [part === 'title' ? 'titleAlign' : 'subtitleAlign']: action.align });
      } else if (action.id === 'smaller' || action.id === 'larger') {
        const current = part === 'title' ? (style.titleFontSize || style.fontSize) : (style.subtitleFontSize || 'md');
        const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, TEXT_SIZES.indexOf(current) + (action.id === 'larger' ? 1 : -1)))];
        this.setOpeningTextStyle(part === 'title' ? { ...style, fontSize: next, titleFontSize: next } : { ...style, subtitleFontSize: next });
      } else if (action.id === 'hide') {
        this.setHeroPosition(part, 'hidden');
        this.select(this.openingKey, false);
      }
      return;
    }
    if (part === 'hero-cta') {
      this.state.patch({ heroCtaConfig: { ...draft.heroCtaConfig, ...(action.align ? { align: action.align } : { visible: false }) } });
      if (!action.align) this.select(this.openingKey, false);
      return;
    }
    if (key === 'area:logo') {
      if (this.isMinimal(draft) && action.id.startsWith('logo-')) {
        if (action.id === 'logo-edit') {
          this.propsCollapsed = false;
          setTimeout(() => this.canvas?.nativeElement.closest('.studio')?.querySelector<HTMLInputElement>('input[type="file"]')?.click());
        } else {
          const sizes = ['sm', 'md', 'lg'] as const;
          const index = sizes.indexOf(draft.layout.minimalLogoSize ?? 'md');
          this.state.patch({ layout: { ...draft.layout, minimalLogoSize: sizes[Math.max(0, Math.min(2, index + (action.id === 'logo-larger' ? 1 : -1)))] } });
        }
        return;
      }
      if (action.align && this.isMinimal(draft)) this.state.patch({ layout: { ...draft.layout, minimalHeaderLogoAlign: action.align } });
      else if (action.align) this.state.patch(draft.heroLogoPosition === 'above' ? { logoStripAlign: action.align } : { heroLogoPosition: action.align });
      else { this.state.patch({ showLogo: false }); this.select(this.openingKey, false); }
      return;
    }
    const block = draft.blocks.find(b => b.id === key);
    const node = block && this.findNode(this.tree(draft), key);
    if (!block || !node) return;
    if (this.runTextAction(action, draft)) return;
    switch (action.id) {
      case 'up': this.state.moveBlockUpInScope(key, this.compositionScope(node,draft,block), this.ui.device); break;
      case 'down': this.state.moveBlockDownInScope(key, this.compositionScope(node,draft,block), this.ui.device); break;
      case 'duplicate': this.runAction('duplicate', block); break;
      case 'hide': this.state.toggleBlockVisibility(key); break;
      case 'delete': this.askDelete(block); break;
    }
  }

  private compositionScope(node:StudioNode,draft:CampaignDraft,block:CampaignBlock):string[]{const placement=blockPlacement(block,this.ui.device==='mobile');return node.scopeIds.filter(id=>{const b=draft.blocks.find(x=>x.id===id);return b&&blockPlacement(b,this.ui.device==='mobile')===placement;});}
  private findNode(list: StudioNode[], key: string): StudioNode | undefined {
    for (const node of list) {
      if (node.key === key) return node;
      const found = this.findNode(node.children, key);
      if (found) return found;
    }
    return undefined;
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
    return !this.state.hasUnsavedChanges() || confirm(this.i18n.translate('studio.confirm.leave'));
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }

  // A press outside the floating toolbar closes its font/color menu. Listened
  // to outside Angular: a check on every press re-rendered the page between
  // press and release, and the click on the element pressed was lost (template
  // cards). Angular runs only when a menu is actually open.
  private readonly onDocumentMouseDown = (event: MouseEvent): void => {
    if (!this.fontMenuOpen && !this.colorMenuOpen && !this.statsMoreOpen) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el?.closest('.float-bar')) return;
    this.zone.run(() => {
      this.fontMenuOpen = false;
      this.colorMenuOpen = false;
      this.statsMoreOpen=false;
    });
  };

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, except while typing in a field (the
  // browser's own text undo applies there).
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if(this.visualPilot&&event.key==='Escape'){this.floatMoreOpen=false;this.showAddMenu=false;if(this.narrow){this.propsCollapsed=true;this.treeCollapsed=true;}}
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
    else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); this.redo(); }
  }

  // ── Content language (bilingual campaign content, D-38 … D-45) ──
  // Which version of the campaign text the canvas shows and the panels edit;
  // independent of the interface language. Structure, design and settings are
  // shared, so only text edits differ between the two.
  readonly contentLangs = CONTENT_LANGS;
  // Each language is named in itself (common.language.*, same in both dictionaries).
  readonly languageNames: Record<ContentLang, string> = { he: 'common.language.he', en: 'common.language.en' };
  get contentLang(): ContentLang { return this.state.contentLanguage; }
  showMissing = false;

  setContentLang(lang: ContentLang): void {
    if (lang === this.contentLang) return;
    this.state.setContentLanguage(lang);
    this.history.reproject(lang);
    this.showMissing = false;
  }

  private missingCache: { draft: CampaignDraft; list: MissingTranslation[] } | null = null;
  missing(draft: CampaignDraft): MissingTranslation[] {
    if (this.missingCache?.draft !== draft) this.missingCache = { draft, list: missingTranslations(draft) };
    return this.missingCache.list;
  }

  private hebrewGapCache: { draft: CampaignDraft; list: MissingTranslation[] } | null = null;
  hebrewGaps(draft: CampaignDraft): MissingTranslation[] {
    if (this.hebrewGapCache?.draft !== draft) this.hebrewGapCache = { draft, list: missingHebrew(draft) };
    return this.hebrewGapCache.list;
  }

  goToHebrewGap(item: MissingTranslation, draft: CampaignDraft): void {
    this.setContentLang('he');
    this.goToMissing(item, draft, 'he');
  }

  englishState(draft: CampaignDraft): 'draft' | 'live' | 'hidden' {
    if (!isEnglishPublished(draft)) return 'draft';
    return publicLanguages(draft).includes('en') ? 'live' : 'hidden';
  }

  toggleEnglishPublished(draft: CampaignDraft): void {
    const published = isEnglishPublished(draft);
    if (!published && this.missing(draft).length) return;
    this.state.setEnglishPublished(!published);
  }

  keepHebrew(item: MissingTranslation): void { this.state.keepHebrewAsEnglish(item.path); }

  goToMissing(item: MissingTranslation, draft: CampaignDraft, lang: ContentLang = 'en'): void {
    if (this.contentLang !== lang) this.setContentLang(lang);
    const firstOf = (type: string) => draft.blocks.find(b => b.type === type)?.id;
    const target =
      item.owner === 'block' ? item.ownerId :
      item.owner === 'offering' ? firstOf('rewards') :
      item.owner === 'update' ? firstOf('updates') :
      item.owner === 'sponsor' ? firstOf('sponsors') :
      item.path === 'title' ? 'part:title' :
      item.path === 'shortDescription' ? 'part:subtitle' :
      item.path === 'heroCtaConfig.label' ? 'part:hero-cta' :
      item.path === 'layout.footerHours' ? 'area:footer' :
      this.openingKey;
    this.showMissing = false;
    if (target) this.select(target);
  }

  plainText(html: string): string {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 140 ? text.slice(0, 140) + '…' : text;
  }

  // Tree marker: a block whose English is incomplete (shown while English is open).
  blockMissing(id: string, draft: CampaignDraft): boolean {
    return this.contentLang === 'en' && this.missing(draft).some(m => m.owner === 'block' && m.ownerId === id);
  }

  // ── Font in the floating toolbar (2026-11-08) ──
  // The element's own font for the open content language, read and written
  // with the same per-language field its properties-panel editor uses, so the
  // two always show the same value. '' = the campaign's font for that text.
  private selectedCanvasText: { blockId: string; role: string } | null = null;
  private floatFontTarget(draft: CampaignDraft): { style: FloatTextStyle | undefined; field: ElementFontField; colorField: ElementColorField | null; write: (next: FloatTextStyle) => void } | null {
    const key = this.selectedKey;
    if (!key) return null;
    const part = this.openingPart(key)?.part;
    if (part === 'title' || part === 'subtitle') {
      return { style: this.openingTextStyle(draft), field: part === 'title' ? 'titleFontFamilyByLanguage' : 'subtitleFontFamilyByLanguage', colorField: part === 'title' ? 'titleColor' : 'subtitleColor',
        write: (next) => this.setOpeningTextStyle(next as TextStyle) };
    }
    if (part === 'hero-cta') return { style: draft.heroCtaConfig, field: 'fontFamilyByLanguage', colorField: null, write: (next) => this.state.patch({ heroCtaConfig: next as typeof draft.heroCtaConfig }) };
    const block = draft.blocks.find(b => b.id === key);
    if (!block) return null;
    const data = block.data as Record<string, any>;
    const writeData = (patch: Record<string, unknown>) => this.state.updateBlockData(block.id, { ...data, ...patch } as never);
    const amountKey=this.state.amountCardSelection,card=draft.layout.amountButtons?.cards?.[amountKey];
    if(block.type==='donation-widget'&&this.selectedCanvasText?.blockId===block.id&&this.selectedCanvasText.role==='amountLabel'&&card){return {style:card.textStyle,field:'fontFamilyByLanguage',colorField:'color',write:next=>this.state.patch({layout:{...this.state.draft.layout,amountButtons:{...this.state.draft.layout.amountButtons,cards:{...this.state.draft.layout.amountButtons?.cards,[amountKey]:{...card,textStyle:next}}}}})};}
    if(block.type==='progress'&&data['summary']){const selected=this.state.summarySelection();const part=selected?.blockId===block.id&&['heading','amount','target','percent'].includes(selected.part)?selected.part:'heading';const config=data['summary'];return {style:config.styles?.[part],field:'fontFamilyByLanguage',colorField:'color',write:next=>writeData({summary:{...config,styles:{...config.styles,[part]:next}}})};}
    if(block.type==='progress'||block.type==='contact')return {style:data['textStyle'],field:'fontFamilyByLanguage',colorField:'color',write:next=>writeData({textStyle:next})};
    if (block.type === 'rich-text') return { style: data['bodyStyle'], field: 'fontFamilyByLanguage', colorField: 'color', write: (next) => writeData({ bodyStyle: Object.keys(next).length ? next : undefined }) };
    if (block.type === 'cta') return { style: data['textStyle'], field: 'fontFamilyByLanguage', colorField: 'color', write: (next) => writeData({ textStyle: next }) };
    const stat=this.statsContext(draft);
    if(stat && block.type==='stats') {
      const role=this.selectedCanvasText?.blockId===block.id && this.selectedCanvasText.role==='label'?'label':'value';
      const roles={...stat.item.textStyles};
      return {style:roles[role],field:'fontFamilyByLanguage',colorField:'color',write:(next)=>{
        if(Object.keys(next).length)roles[role]=next;else delete roles[role];
        this.state.updateBlockData(block.id,{...stat.data,items:stat.data.items.map(i=>i.key===stat.item.key?{...i,textStyles:roles}:i)});
      }};
    }
    if (['donation-widget', 'stats', 'donors', 'ambassadors', 'comments', 'countdown'].includes(block.type)) {
      const roles = { ...(data['textStyles'] ?? {}) };
      const role = this.selectedCanvasText?.blockId === block.id ? this.selectedCanvasText.role : 'sectionTitle';
      return { style: roles[role] ?? (role === 'sectionTitle' && data['titleColor'] ? { color: data['titleColor'] } : undefined), field: 'fontFamilyByLanguage', colorField: 'color', write: (next) => {
        if (Object.keys(next).length) roles[role] = next; else delete roles[role];
        writeData({ textStyles: roles });
      } };
    }
    return null;
  }

  floatFont(draft: CampaignDraft): { current: string; options: { stack: string; name: string }[] } | null {
    const target = this.floatFontTarget(draft);
    if (!target) return null;
    const lang = this.contentLang;
    const current = elementFont(target.style, lang, target.field) ?? '';
    const options = fontsFor(lang).map(f => ({ stack: f.stack, name: f.name }));
    // A font saved before the catalog (or from the other language's list) stays selectable.
    if (current && !options.some(o => o.stack === current)) options.unshift({ stack: current, name: fontByStack(current)?.name ?? current.split(',')[0].replace(/['"]/g, '') });
    return { current, options };
  }

  fontMenuOpen = false;

  setFloatFont(stack: string, draft: CampaignDraft): void {
    this.fontMenuOpen = false;
    const target = this.floatFontTarget(draft);
    if (!target) return;
    ensureStackLoaded(stack);
    target.write(setElementFont(target.style ?? {}, this.contentLang, stack || null, target.field));
  }

// ── Text color in the floating toolbar (2026-11-09) ──
  // The same per-language color the element's properties-panel editor shows
  // (utils/element-color.ts); null = the campaign's default for that text.
  colorMenuOpen = false;
  private colorContext: { rendered: string | null; background: string | null } = { rendered: null, background: null };

  floatColor(draft: CampaignDraft): { current: string | null; effective: string; presets: string[]; brand: string[]; lowContrast: boolean } | null {
    const target = this.floatFontTarget(draft);
    if (!target?.colorField) return null;
    const current = toHex(elementColor(target.style, this.contentLang, target.colorField));
    const effective = current ?? this.colorContext.rendered ?? '#000000';
    const theme = draft.layout?.theme;
    const brand = [...new Set([theme?.primaryColor, theme?.secondaryColor, theme?.accentColor, theme?.bodyTextColor].map(c => toHex(c)).filter((c): c is string => !!c))];
    const ratio = contrastRatio(effective, this.colorContext.background);
    return { current, effective, presets: PRESET_TEXT_COLORS, brand, lowContrast: ratio !== null && ratio < 3 };
  }

  setFloatColor(color: string | null, draft: CampaignDraft): void {
    const target = this.floatFontTarget(draft);
    if (!target?.colorField) return;
    target.write(setElementColor(target.style ?? {}, this.contentLang, color, target.colorField));
    // The default's actual color shows once the canvas has rendered it.
    if (!color) requestAnimationFrame(() => this.readColorContext());
  }

  commitHex(input: HTMLInputElement, draft: CampaignDraft): void {
    const hex = toHex(input.value);
    if (!hex) { input.value = this.floatColor(draft)?.effective ?? ''; return; }
    input.value = hex;
    this.setFloatColor(hex, draft);
  }

  // The selected text's rendered color and the first solid background behind
  // it (none over a photo or gradient: no contrast hint there).
  private readColorContext(): void {
    const el = this.floatTextElement();
    if (!el) { this.colorContext = { rendered: null, background: null }; return; }
    let background: string | null = null;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') break;
      const bg = toHex(cs.backgroundColor);
      if (bg) { background = bg; break; }
      if (node === this.canvas?.nativeElement) { background = '#ffffff'; break; }
    }
    this.colorContext = { rendered: toHex(getComputedStyle(el).color), background };
  }

  // The selected element's main text on the canvas.
  private floatTextElement(): HTMLElement | null {
    const root = this.canvas?.nativeElement;
    const selector = this.canvasSelector(this.selectedKey);
    const host = root && selector ? root.querySelector<HTMLElement>(selector) : null;
    if (!host) return null;
    if(this.state.selectedStatistic()?.blockId===this.selectedKey){const role=this.selectedCanvasText?.role==='label'?'label':'value';return host.querySelector<HTMLElement>('[data-text-role='+role+']')??host;}
    if (this.selectedCanvasText?.blockId === this.selectedKey) {
      const text = host.querySelector<HTMLElement>('[data-text-role="' + this.selectedCanvasText.role + '"]');
      if (text) return text;
    }
    return host.querySelector<HTMLElement>('[data-text-role="sectionTitle"], .block-rich-text, .cta-title, [data-inline-edit]') ?? host;
  }

  setMetaTextStyle(style: Partial<TextStyle> | undefined): void {
    const layout = { ...this.state.draft.layout };
    if (style) layout.metaTextStyle = style; else delete layout.metaTextStyle;
    this.state.patch({ layout });
  }

// ── Direct text editing (double-click, 2026-11-08) ──
  // Only campaign-authored text is marked data-inline-edit (its content path):
  // amounts, dates, organizer and progress stay business data, styled only.
  private readonly inline = new InlineTextEditor();
  floatHidden = false;

  private readonly onCanvasDblClick = (event: MouseEvent) => {
    const el = (event.target as Element | null)?.closest?.('[data-inline-edit]') as HTMLElement | null;
    const host = this.canvas?.nativeElement;
    if (!el || !host) return;
    const path = el.getAttribute('data-inline-edit')!;
    const draft = this.state.draft;
    const rich = el.hasAttribute('data-inline-rich');
    const stored = getAt(draft, path);
    if (stored === undefined && !['layout.minimalTitleRichHtml', 'layout.projectDescription'].includes(path) && !path.endsWith('.label') && !path.endsWith('ctaLabel')) return;
    event.preventDefault();
    event.stopPropagation();
    this.history.commit();
    this.inline.start({
      element: el, host, rich,
      value: stored || (rich ? el.innerHTML : el.innerText.trim()),
      multiline: el.hasAttribute('data-inline-multiline'),
      dir: this.contentLang === 'en' ? 'ltr' : 'rtl',
      onCommit: (value) => this.commitInlineEdit(path, value),
    });
  };

  // Same state and content path as the properties panel: the panel, undo/redo,
  // save and the open content language all follow.
  setOpeningCopy(part: 'title' | 'subtitle', value: string): void {
    const draft = this.state.draft;
    const field = part === 'title' ? 'title' : 'shortDescription';
    if (this.isMinimal(draft) && draft.layout.minimalAdvancedText) {
      const el = document.createElement('p'); el.textContent = value;
      this.state.patch({ [field]: value, layout: { ...draft.layout, [part === 'title' ? 'minimalTitleRichHtml' : 'projectDescription']: el.outerHTML } });
    } else this.state.patch({ [field]: value });
  }

  private commitInlineEdit(path: string, value: string): void {
    const next = structuredClone(this.state.draft);
    if (!setAt(next, path, value)) return;
    if (this.isMinimal(next) && (path === 'layout.minimalTitleRichHtml' || path === 'layout.projectDescription')) {
      const el = document.createElement('div'); el.innerHTML = value;
      if (path === 'layout.minimalTitleRichHtml') next.title = el.textContent || '';
      else next.shortDescription = (el.textContent || '').slice(0, 160);
    }
    this.state.replaceDraft(next);
    this.history.commit();
  }

  private readonly onCanvasClickOutside = (event: MouseEvent) => {
    const el = event.target as Element | null;
    if (el?.closest?.('.float-bar')) return;
    if (this.isMinimal(this.state.draft)) {
      const part = el?.closest<HTMLElement>('[data-studio-part]')?.dataset['studioPart'];
      if (part && ['title', 'subtitle', 'logo'].includes(part)) {
        this.select(part === 'logo' ? 'area:logo' : 'part:' + part, false);
        if (!this.narrow) this.propsCollapsed = false;
      }
    }
    const roleElement = el?.closest<HTMLElement>('[data-text-role]');
    const roleBlock = roleElement?.closest<HTMLElement>('[data-block-id]');
    this.selectedCanvasText = roleElement && roleBlock ? { blockId: roleBlock.dataset['blockId']!, role: roleElement.dataset['textRole']! } : null;
    this.fontMenuOpen = false;
    this.colorMenuOpen = false;
    if (el?.closest?.('[data-block-id], [data-studio-part], [data-studio-area], .studio-inline-editor')) return;
    this.floatHidden = true;
  };

  // Size, weight and alignment of the selected block's text, written to the same
  // style its properties-panel editor edits (font: floatFontTarget above).
  private textActions(draft: CampaignDraft): FloatAction[] {
    const target = this.floatFontTarget(draft);
    if (!target) return [];
    const style = (target.style ?? {}) as Partial<TextStyle>;
    const bold = (style.fontWeight ?? 0) >= 700;
    return [
      { id: 'text-smaller', icon: AArrowDown, label: 'studio.float.smaller' },
      { id: 'text-larger', icon: AArrowUp, label: 'studio.float.larger' },
      { id: 'bold', icon: Bold, label: 'studio.float.bold', active: bold, align: undefined },
      ...(target.colorField ? [COLOR_ACTION] : []),
      ...ALIGN_ACTIONS.map(a => ({ ...a, active: style.align === a.align })),
    ];
  }

  private runTextAction(action: FloatAction, draft: CampaignDraft): boolean {
    if (!['text-smaller', 'text-larger', 'bold', 'align-right', 'align-center', 'align-left'].includes(action.id)) return false;
    const target = this.floatFontTarget(draft);
    if (!target) return false;
    const style = { ...((target.style ?? {}) as Partial<TextStyle>) };
    if (action.align) style.align = action.align;
    if (action.id === 'bold') style.fontWeight = (style.fontWeight ?? 0) >= 700 ? 400 : 700;
    if (action.id === 'text-smaller' || action.id === 'text-larger') {
      const current = roleSizePx(style) ?? this.renderedSize() ?? 16;
      style.fontSizePx = Math.min(96, Math.max(8, current + (action.id === 'text-larger' ? 2 : -2)));
      delete style.fontSize;
    }
    target.write(style as ElementFontStyle);
    return true;
  }

  // The selected block's main text as it renders now (the start for +/- size).
  private renderedSize(): number | null {
    const text = this.floatTextElement();
    return text ? parseFloat(getComputedStyle(text).fontSize) || null : null;
  }

  // Floating "Typography": opens the selected element's text editor in the
  // properties panel (the same controls, no second editor).
  openTypography(attempt = 0): void {
    if (this.propsCollapsed) this.toggleProps();
    setTimeout(() => {
      const body = document.querySelector('.props-panel .panel-body');
      let editor = body?.querySelector<HTMLElement>('app-text-role-editor, app-text-style-editor');
      // A block's text editors live in its collapsed "Texts" section: open it first.
      if (!editor) {
        if (attempt > 0) return;
        body?.querySelector<HTMLElement>('[data-typography-section]')?.click();
        this.openTypography(1);
        return;
      }
      editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const toggle = editor.querySelector<HTMLElement>('.tse-toggle-row');
      if (toggle && !editor.querySelector('.tse-body')) toggle.click();
      editor.querySelector<HTMLElement>('select, input, button')?.focus({ preventScroll: true });
    }, 60);
  }

  undo(): void { this.history.undo(); this.keepSelectionValid(); }
  redo(): void { this.history.redo(); this.keepSelectionValid(); }

  private keepSelectionValid(): void {
    const key = this.selectedKey;
    if (key && !key.startsWith('area:') && !this.openingPart(key) && !this.state.draft.blocks.some(b => b.id === key)) this.selectedKey = this.openingKey;
    const stat=this.state.selectedStatistic(),block=this.state.draft.blocks.find(b=>b.id===stat?.blockId);
    if(stat && (!block || !(block.data as StatsBlockData).visualLayout || !(block.data as StatsBlockData).items.some(i=>i.key===stat.key && i.visible)))this.state.selectedStatistic.set(null);
    const arranging=this.state.arrangingStatistics();
    if(arranging && !this.state.draft.blocks.some(b=>b.id===arranging && (b.data as StatsBlockData).visualLayout))this.state.arrangingStatistics.set(null);
  }

  tree(draft:CampaignDraft):StudioNode[]{const nodes=buildStudioTree(draft.blocks.map(b=>({...b,order:blockOrder(b,this.ui.device==='mobile')})));const query=this.visualPilot?this.treeSearch.trim().toLowerCase():'';if(!query)return nodes;const filter=(items:StudioNode[]):StudioNode[]=>items.flatMap(n=>{const children=filter(n.children);return textOf(this.i18n,n.label).toLowerCase().includes(query)||children.length?[{...n,children}]:[];});return filter(nodes);}

  statusLabel(draft: CampaignDraft): string { return STATUS_LABELS[draft.status] ? this.i18n.translate(STATUS_LABELS[draft.status]) : draft.status; }

  select(key: string, fromTree = true): void {
    if (fromTree || this.selectedCanvasText?.blockId !== key) this.selectedCanvasText = null;
    this.selectedKey = key;
    this.floatMoreOpen=false;
    if(this.visualPilot){let child=key;const visited=new Set<string>();while(!visited.has(child)){visited.add(child);const parent=this.state.draft.blocks.find(b=>(b.data as ContainerBlockData).childBlockIds?.includes(child));if(!parent)break;this.collapsed.delete(parent.id);child=parent.id;}}
    if (fromTree || !this.narrow || this.visualPilot) this.propsCollapsed = false;
    if (this.narrow && (fromTree || this.visualPilot)) this.treeCollapsed = true;
    this.floatHidden = false;
    if(this.state.selectedStatistic()?.blockId!==key || fromTree)this.state.selectedStatistic.set(null);
    if(this.state.arrangingStatistics()!==key)this.state.arrangingStatistics.set(null);
    this.statsMoreOpen=false;
    this.fontMenuOpen = false;
    this.colorMenuOpen = false;
    this.scrollOnHighlight = fromTree;
    this.showAddMenu = false;
    this.menu = null;
  }

  selectedBlock(draft: CampaignDraft): CampaignBlock | undefined {
    return this.selectedKey ? draft.blocks.find(b => b.id === this.selectedKey) : undefined;
  }

  // Panel order in the DOM is tree, canvas, properties; the tree is at the
  // inline start (right in Hebrew, left in English). Collapsed panels keep a narrow rail with their toggle.
  // On a narrow screen the canvas keeps the width: the panels shrink to their rails
  // and open over the canvas, one at a time (studio-viewport.ts).
  private readonly isNarrowViewport = inject(STUDIO_NARROW_VIEWPORT);
  narrow = this.isNarrowViewport();

  @HostListener('window:resize')
  onViewportResize(): void {
    const narrow = this.isNarrowViewport();
    if (narrow === this.narrow) return;
    this.narrow = narrow;
    if (narrow) { this.treeCollapsed = true; this.propsCollapsed = true; }
    else this.restoreLayout();
  }

  get gridColumns(): string {
    if (this.narrow) return '44px 0px minmax(0, 1fr) 0px 44px';
    const tree = this.treeCollapsed ? 44 : this.treeWidth;
    const props = this.propsCollapsed ? 44 : this.propsWidth;
    return tree + 'px 6px minmax(0, 1fr) 6px ' + props + 'px';
  }

  toggleTree(): void {
    this.treeCollapsed = !this.treeCollapsed;
    if (this.narrow) { if (!this.treeCollapsed) this.propsCollapsed = true; return; }
    this.saveLayout();
  }
  toggleProps(): void {
    this.propsCollapsed = !this.propsCollapsed;
    if (this.narrow) { if (!this.propsCollapsed) this.treeCollapsed = true; return; }
    this.saveLayout();
  }

  // Links inside the canvas (platform strip, links in the content) never leave
  // the editor; editor controls are buttons, so they are unaffected (finding 3).
  private readonly blockCanvasLinks = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (!link || link.closest('[data-studio-ui], [data-studio-control]')) return;
    event.preventDefault();
    event.stopPropagation();
  };
  private canvasLinksBound: HTMLElement | null = null;

  startResize(panel: 'tree' | 'props', event: PointerEvent): void {
    if (panel === 'tree' ? this.treeCollapsed : this.propsCollapsed) return;
    event.preventDefault();
    // The tree sits at the inline start: it grows towards the inline end, i.e.
    // with the pointer moving left in RTL and right in LTR; the properties panel the opposite.
    const towardsEnd = (event.currentTarget instanceof Element ? dirOf(event.currentTarget) : this.language.dir()) === 'rtl' ? -1 : 1;
    this.resizing = { panel, startX: event.clientX, startWidth: panel === 'tree' ? this.treeWidth : this.propsWidth, sign: panel === 'tree' ? towardsEnd : (-towardsEnd as 1 | -1) };
    window.addEventListener('pointermove', this.onResizeMove);
    window.addEventListener('pointerup', this.stopResize);
  }

  private onResizeMove = (event: PointerEvent): void => {
    if (!this.resizing) return;
    const delta = event.clientX - this.resizing.startX;
    const width = Math.round(Math.min(520, Math.max(220, this.resizing.startWidth + this.resizing.sign * delta)));
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
    if (this.narrow) { this.treeCollapsed = true; this.propsCollapsed = true; return; }
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
    const siblings=parentId?this.state.draft.blocks.filter(b=>(this.state.draft.blocks.find(p=>p.id===parentId)?.data as ContainerBlockData)?.childBlockIds?.includes(b.id)):this.state.draft.blocks.filter(b=>!this.state.draft.blocks.some(p=>(p.data as ContainerBlockData).childBlockIds?.includes(b.id)));
    siblings.sort((a,b)=>blockOrder(a,this.ui.device==='mobile')-blockOrder(b,this.ui.device==='mobile'));
    const anchor=this.insertionAnchor;
    const index=anchor?siblings.findIndex(b=>b.id===anchor):-1;
    const id=index>=0?this.state.insertBlockAt(type,parentId,index,this.ui.device):parentId?this.state.addBlockToContainer(parentId,type):this.state.addBlock(type);
    if(id&&anchor&&!campaignBodyRoot(this.state.draft)){const original=this.state.draft.blocks.find(b=>b.id===anchor);if(original?.responsive||original?.placement)this.state.patch({blocks:this.state.draft.blocks.map(b=>b.id===id?{...b,placement:original.placement,responsive:original.responsive?structuredClone(original.responsive):undefined}:b)});}
    if(type==='navigation')this.state.patch({layout:{...this.state.draft.layout,replaceLegacyNavigation:true}});
    this.insertionAnchor=null;this.showAddMenu=false;
    if (parentId) this.collapsed.delete(parentId);
    this.addTarget = null;
    if (id) this.select(id);
  }

  openAddMenu(target: string | null): void {
    this.addQuery='';
    this.addTarget = target ?? campaignBodyRoot(this.state.draft)?.id ?? null;
    this.insertionAnchor=null;
    this.showAddMenu = true;
    this.menu = null;
  }

  // Catalog groups for the add menu: inside a container the same set as Step
  // 9's "+ הוסף לכאן" (no Hero).
  addGroupsFor(blocks: CampaignBlock[]): { label: string; types: BlockType[] }[] {
    const parent = this.addTarget ? blocks.find(b => b.id === this.addTarget) ?? null : null;
    return this.addGroups
      .map(g => ({ ...g, types: g.types.filter(t => canPlaceIn(t,parent)&&(!this.visualPilot||!this.addQuery.trim()||this.i18n.translate(BLOCK_LABELS[t]).toLowerCase().includes(this.addQuery.trim().toLowerCase()))) }))
      .filter(g => g.types.length > 0);
  }

  addTargetLabel(blocks: CampaignBlock[]): string {
    const parent = this.addTarget ? blocks.find(b => b.id === this.addTarget) : null;
    if (!parent) return this.i18n.translate('studio.add.toPage');
    return this.i18n.translate('studio.add.into', { name: parent.label?.trim() || this.i18n.translate(BLOCK_LABELS[parent.type]) });
  }

  actionsFor(block: CampaignBlock): StudioAction[] { if(block.id===this.state.draft.layout.bodyRootId)return [{id:'add-inside',label:'studio.actions.addInside'}];return blockActions(block, this.state.canDuplicateBlock(block.id, SINGLE_INSTANCE), this.state.canRemoveBlock(block.id)); }

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
      case 'to-top': if(campaignBodyRoot(this.state.draft)){this.state.moveBlockTo(block.id,campaignBodyRoot(this.state.draft)!.id,0,undefined,this.ui.device);}else if(block.responsive){const device=this.ui.device,placement=blockPlacement(block,device==='mobile')==='below-header'?'content':'below-header';this.state.patch({blocks:this.state.draft.blocks.map(b=>b.id===block.id?{...b,responsive:{...b.responsive,[device]:{...b.responsive?.[device],placement}}}:b)});}else this.state.moveBlockTo(block.id,null,0,block.placement==='below-header'?null:'below-header');this.select(block.id);break;
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
    if (!this.state.canRemoveBlock(block.id)) return;
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
      this.state.moveBlockTo(id, placement.parentId, placement.index, undefined, this.ui.device);
      this.select(id, false);
    } else if (this.dragType) {
      const id = this.state.insertBlockAt(this.dragType, placement.parentId, placement.index,this.ui.device);
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
        alert(this.i18n.translate('studio.template.blockedMissing', { name: textOf(this.i18n, selection.template.name), missing: missing.map(m => this.i18n.translate(m)).join(', ') }));
        return;
      }
      if (!confirm(this.i18n.translate('studio.template.confirmLive', { name: textOf(this.i18n, selection.template.name) }))) return;
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

  get classicEditorLink(): string[] { return this.isNew ? ['/campaigns/create/classic'] : ['/campaigns', this.campaignId, 'classic']; }

  updateLabel(block: CampaignBlock, value: string): void { this.state.updateBlockLabel(block.id, value); }

  // Read-only publish readiness: exactly step 10's checks (publish-readiness.ts).
  // It never blocks saving; publishing itself still goes through step 10.
  private readinessCache: { draft: CampaignDraft; approved: boolean; value: { missing: string[]; approved: boolean; tone: 'ready' | 'missing' | 'pending' } } | null = null;

  readiness(draft: CampaignDraft): { missing: string[]; approved: boolean; label: string; tone: 'ready' | 'missing' | 'pending' } {
    const approved = publishEntityApproved(this.entity.currentEntity());
    if (this.readinessCache?.draft !== draft || this.readinessCache.approved !== approved) {
      this.readinessCache = { draft, approved, value: this.computeReadiness(draft, approved) };
    }
    const value = this.readinessCache.value;
    return { ...value, label: this.readinessLabel(value) };
  }

  private computeReadiness(draft: CampaignDraft, approved: boolean): { missing: string[]; approved: boolean; tone: 'ready' | 'missing' | 'pending' } {
    const missing = publishMissingFields(draft);
    return { missing, approved, tone: missing.length ? 'missing' : approved ? 'ready' : 'pending' };
  }

  private readinessLabel(r: { missing: string[]; tone: 'ready' | 'missing' | 'pending' }): string {
    if (r.tone === 'missing') return this.i18n.translate('studio.readiness.missing', { count: r.missing.length });
    return this.i18n.translate(r.tone === 'pending' ? 'studio.readiness.pending' : 'studio.readiness.ready');
  }

  readinessTitle(draft: CampaignDraft): string {
    const r = this.readiness(draft);
    if (r.missing.length) return this.i18n.translate('studio.readiness.missingTitle', { fields: r.missing.map(m => this.i18n.translate(m)).join(', ') });
    return this.i18n.translate(r.approved ? 'studio.readiness.readyTitle' : 'studio.readiness.pendingTitle');
  }
}
