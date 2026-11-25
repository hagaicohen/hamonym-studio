// @ts-nocheck
/**
 * Compatibility port of the original 000.js runtime into the Angular bundle.
 * This is not a declarative Angular rewrite: DOM listeners and the renderer still
 * follow the original code. Do not describe as fully migrated. Since v4.43 the
 * campaign state, saving and undo/redo are owned by CampaignStateService.
 */
import { CAMPAIGN_SECTIONS, blankCampaign, ensureComponentDefaults, originalCampaignDefaults } from './campaign-defaults';
import type { CampaignStateService } from './campaign-state.service';
import type { CampaignCardsService } from '../public-page/campaign-cards.service';
import type { CollectionBlocksService } from '../public-page/collections/collection-blocks.service';
import type { PublicPartsService } from '../public-page/parts/public-parts.service';
import { campaignCountdown } from '../public-page/parts/part-format';
import { DonationBoxComponent } from '../public-page/cards/donation-box.component';
import { CampaignShareComponent } from '../public-page/cards/campaign-share.component';
import { CARD_SIZE_DEFAULTS, cardSizeFor, cardSizeVars, headingStyle, presentationFor, rewardStyleVars as collectionRewardStyleVars, textEffectStyle } from '../public-page/collections/collection-style';
import { sponsorsShown } from '../public-page/cards/sponsors.component';
import { clampNumber, clampOrDefault, clampSize, hexColor, hexColor6, luminance } from './campaign-style';
import { CAMPAIGN_CATEGORY_CATALOG, CATEGORY_SOLID_ICONS } from './category-catalog';
import { INSPECTOR_SCHEMA, fonts } from '../inspector/inspector-schema';
import { buildInspector, sliderUnit } from '../inspector/inspector-model';
import type { InspectorService } from '../inspector/inspector.service';
import type { StoryBuilderService } from '../story-builder/story-builder.service';

// v4.43: the campaign document, saving and undo/redo belong to CampaignStateService.
// The core has no state variable: it reads `campaignState.current` and replaces the
// document only through the service (restore, import, reset).
// v4.44: the public cards (rewards, sponsors, donors, updates, comments, ambassadors), the share
// block and the donation box are components. The core's markup builders place them as slots (`cards.slot`), which become the
// rendered cards when the markup reaches the document; the globals that return card markup
// render it with the component (`cards.html`).
// v4.45: the collection blocks (rewards, ambassadors, updates, comments, donors) are components too
// (CollectionBlocksService), with their toolbar state and handlers. The presentation
// helpers they share with the inspector are in public-page/collections/collection-style.ts.
// v4.46: the other parts of the page (header, Hero with its video, logo and slider, campaign info, title,
// stats, donate button, campaign navigation, story, footer, sticky donate button) are components too
// (public-page/parts), and the page itself is PublicPageComponent: `renderPreview` renders it
// (`cards.renderPage`) instead of building markup, with the blocks as its child components (no slots).
// v4.47: the page's layout is rendered in place too (public-page/parts/page-layout.ts): the device order of
// the blocks, the desktop panorama / slider / "donation" arrangements, the Hero stats card, the race card
// and the panorama sidebar's reward list (the last slots: `cards.slot` is gone). What still runs on the page
// after it is written: the subtitle fit, the simple donation page, #preview's panorama variables and
// classes, the race Hero card's position, syncDonationCtas, the export.
// v4.48: the mobile and panorama tabs and the rewards shortcut are in the page's template too (page-layout.ts),
// and the donation box lays out its amounts itself (`cards.attachPage()`). `hamFinishCampaignRender` still runs
// after the page is written: the header, race participants, updates sort and shared headers hook into it.
export function initializeCampaignCore(campaignState: CampaignStateService, cards: CampaignCardsService, collections: CollectionBlocksService, parts: PublicPartsService, inspector: InspectorService, builder: StoryBuilderService): void {
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const img='https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=1400&q=85';
const templates={heroOverlay:{name:'Hero עם כרטיס נתונים',desc:'כרטיס הגיוס מופיע מעל תמונת ה־Hero',layout:'heroOverlay'},donation:{name:'דף תרומה פשוט',desc:'דף נקי עם הדגשה של היעד ואפשרויות התרומה',layout:'donation'},classic:{name:'בלוק אחרי בלוק',desc:'תמונה, פרטי הקמפיין, תרומות וסיפור — אחד אחרי השני',layout:'classic'},panorama:{name:'Hero רחב',desc:'תמונת פתיחה פנורמית, סיפור רחב ותיבת תרומה בצד',layout:'panorama'},slider:{name:'סליידר תמונות',desc:'גלריית תמונות בפתיחת הקמפיין, עם ניווט קדימה ואחורה',layout:'slider'},split:{name:'תמונה לצד פרטים',desc:'תמונה מימין, סיפור קצר ונתוני הגיוס משמאל',layout:'split'},editorial:{name:'סיפור במרכז',desc:'עיצוב קריא שמדגיש את תוכן הקמפיין והתמונות שלו',layout:'editorial'}};
const palettes={classic:{name:'קלאסיק',desc:'כחול עמוק וזהב',primary:'#183c5a',secondary:'#d8b16c',surface:'#f8f9fb',ink:'#1d3040'},warm:{name:'חם',desc:'טרקוטה ושמנת',primary:'#a9533b',secondary:'#e9b67e',surface:'#fff8f0',ink:'#51392f'},civic:{name:'סיויק',desc:'ממלכתי ומאופק',primary:'#214e68',secondary:'#93b6c6',surface:'#f2f6f8',ink:'#263c48'},nature:{name:'שורשים',desc:'ירוק וזהב',primary:'#246f65',secondary:'#e7b46e',surface:'#f8f5ef',ink:'#203a36'},modern:{name:'מודרני',desc:'סגול בהיר',primary:'#5a40ad',secondary:'#d9cbff',surface:'#f5f4fa',ink:'#241f39'},sunrise:{name:'זריחה',desc:'כתום ואור',primary:'#c35137',secondary:'#ffd37e',surface:'#fff8ee',ink:'#493029'},minimal:{name:'מינימל',desc:'שחור ולבן',primary:'#20252a',secondary:'#c8ced2',surface:'#ffffff',ink:'#20252a'},rose:{name:'רוז',desc:'בורדו וורוד',primary:'#803e58',secondary:'#e6b6c5',surface:'#fff7f9',ink:'#4b2d3a'},ocean:{name:'אוקיינוס',desc:'טורקיז וכחול',primary:'#176e80',secondary:'#a5d9d8',surface:'#f1faf9',ink:'#23434d'},olive:{name:'זית',desc:'זית וחול',primary:'#5b6740',secondary:'#d8c18a',surface:'#faf8ef',ink:'#353d30'}};
// v4.54: `fonts` is in inspector/inspector-schema.ts.
const sections=CAMPAIGN_SECTIONS;

// (The ambassadors and sponsors sections are inserted in CAMPAIGN_SECTIONS, campaign-defaults.ts.)
// Catalog reflects Israeli nonprofit classifications and campaign-specific topics.
// Solid SVG glyphs: Font Awesome Free Icons, CC BY 4.0, Fonticons, Inc. (fontawesome.com/license/free).
const categorySolidIcons=CATEGORY_SOLID_ICONS;
const campaignCategoryCatalog=CAMPAIGN_CATEGORY_CATALOG;
let categorySearch='',categoryIconPickerOpen=false;
const categoryByLabel=label=>campaignCategoryCatalog.find(c=>c.label===label)||campaignCategoryCatalog.find(c=>c.id===label);
function categoryIconName(c){return c.categoryIcon||categoryByLabel(c.category)?.icon||'tag'}
function solidCategoryIcon(name,px=17){const icon=categorySolidIcons[name]||categorySolidIcons['ellipsis'];if(!icon)return '';const paths=Array.isArray(icon.p)?icon.p:[icon.p];return `<svg class="solid-category-icon" width="${px}" height="${px}" viewBox="${icon.v}" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill:currentColor">${paths.map(d=>`<path d="${d}"/>`).join('')}</svg>`;}
// One source of truth for Wizard/Studio category choices, including subtopics.
function chooseCampaignCategory(id,subtopic=''){
 const selected=campaignCategoryCatalog.find(c=>c.id===id);
 if(!selected)return null;
 const ci=campaignState.current.content.campaignInfo;
 ci.category=selected.label;
 ci.subcategory=selected.sub.includes(subtopic)?subtopic:'';
 ci.categoryIcon='';
 ci.showCategory=selected.id!=='other';
 campaignState.current.management ||= {};
 if(campaignState.current.management.entryWizard)campaignState.current.management.entryWizard.categoryId=selected.id;
 campaignState.current.management.readinessEvidence ||= {};
 campaignState.current.management.readinessEvidence['meta.category']='user';
 if(ci.showCategory)campaignState.current.visible.campaignInfo=true;
 return selected;
}
const hamOriginalDefaults=originalCampaignDefaults;
// Angular migration v0.3.3: A new campaign starts with NO demo business/content data.
// The old visual/design defaults remain intact. Samples are populated only by an
// explicit "דמו רגיל" / "דמו מירוץ" action (hamonymSeedTemporaryCampaignDemo).
const defaults=blankCampaign;

// Safe storage adapter: ordinary Chrome uses the existing localStorage data unchanged.
// Sandboxed previews can forbid even reading the localStorage property.
const hamStorage=window.hamAngularDraftStorage || (()=>{
  try{
    const storage=window.localStorage;
    const key='__hamonym_storage_access_check__';
    // A full localStorage is still readable. Do NOT fall back to an empty
    // in-memory draft merely because the write-access probe exceeds quota.
    try{storage.setItem(key,'ok');storage.removeItem(key)}
    catch(error){
      if(error?.name!=='QuotaExceededError'&&error?.name!=='NS_ERROR_DOM_QUOTA_REACHED'&&error?.code!==22)throw error;
      console.warn('HAMONYM: storage quota is full; retaining access to the existing campaign draft.');
    }
    return {persistent:true,getItem:key=>storage.getItem(key),setItem:(key,value)=>storage.setItem(key,value)};
  }catch(error){
    const memory=new Map();
    console.warn('HAMONYM: browser storage is unavailable. Changes are temporary in this preview.',error);
    return {persistent:false,getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,String(value));}};
  }
})();

// v0.1.53: one shared optimized-photo store for races AND rewards.
// Keep legacy marker/prefix intact to preserve all photos from earlier versions.
const huRacePhotoPrefix='hamonym-race-photo-v1-';
const huRacePhotoMarker='hamracephoto:';
const huRacePhotoCache=new Map();
function huRacePhotoSrc(source){
 if(typeof source!=='string'||!source)return '';
 if(source.startsWith('hamonymmedia:'))return window.hamonymMediaFix?.src(source)||'';
 if(!source.startsWith(huRacePhotoMarker))return source;
 if(huRacePhotoCache.has(source))return huRacePhotoCache.get(source);
 let data='';try{data=hamStorage.getItem(huRacePhotoPrefix+source.slice(huRacePhotoMarker.length))||''}catch{}
 if(data)huRacePhotoCache.set(source,data);
 return data;
}
async function huPortableCampaignCopy(){return window.hamonymMediaFix?await window.hamonymMediaFix.portableCopy():(()=>{const copy=JSON.parse(JSON.stringify(campaignState.current));return copy})()}

campaignState.load(templates);campaignState.attach({persist:()=>persist(),render:()=>render(),renderPreview:()=>renderPreview()});cards.attach({photoSrc:huRacePhotoSrc});
window.hamAngularMediaContext = {
  storage: hamStorage,
  readState: () => campaignState.current,
  get renderPreview(){ return renderPreview; },
  set renderPreview(fn){ renderPreview = fn; },
  get renderInspector(){ return renderInspector; },
  set renderInspector(fn){ renderInspector = fn; },
  snapshot: () => snapshot(),
  toast: message => toast(message),
  sbFind: (...args) => sbFind(...args),
  sbRenderNode: (...args) => sbRenderNode(...args),
  sbRender: () => sbRender(),
  donateBoxMarkup: (d, force = false) => (!force && !d.boxEnabled) ? '' : cards.html('donationBox', { donate: dbStyleForDevice(d) }),
  device: () => device,
  history: () => campaignState.historyEntries().past,
  future: () => campaignState.historyEntries().future,
  updateUndo: () => updateUndo(),
  sbSelected: () => sbSelected,
  defaults: () => defaults(),
  templates,
  esc: text => esc(text),
  setDevice: value => { device = value; },
  categoryByLabel: (...args) => categoryByLabel(...args),
  campaignCategoryCatalog,
  solidCategoryIcon: (...args) => solidCategoryIcon(...args),
  chooseCampaignCategory: (...args) => chooseCampaignCategory(...args),
  hamSimpleVisualSettings: (...args) => hamSimpleVisualSettings(...args),
  get hamSimpleFlowState(){ return hamSimpleFlowState; },
  img,
  resetHeroSlideKey: () => parts.resetSlideKey(),
  sbNew: (...args) => sbNew(...args),
  sbOpen: () => sbOpen(),
  sbMigrateLegacyWizardLead: () => sbMigrateLegacyWizardLead(),
  get persist(){ return persist; },
  set persist(fn){ persist = fn; },
  get render(){ return render; },
  set render(fn){ render = fn; },
  confirmField: (...args) => window.hamAngularWizardConfirmField?.(...args),
  selected: () => selected,
  select: (...args) => select(...args),
  renderSections: (...args) => renderSections(...args),
  ambassadorSafeLink: (...args) => ambassadorSafeLink(...args),
  hamCardSizeFor: (...args) => hamCardSizeFor(...args),
  hamCardSizeVars: (...args) => hamCardSizeVars(...args),
  hamDonationRelativeTime: (...args) => hamDonationRelativeTime(...args),
  huFormatAmount: (...args) => huFormatAmount(...args),
  huRacePhotoSrc: (...args) => huRacePhotoSrc(...args),
  huReadAmount: (...args) => huReadAmount(...args),
  rewardStyleVars: (...args) => rewardStyleVars(...args),
  rewardTileMarkup: (item, cfg, index = 0) => cards.html('reward', { item, cfg, index }),
  setupCampaignCarousels: (...args) => setupCampaignCarousels(...args),
  sponsorMarkup: () => sponsorsShown(campaignState.current) ? cards.html('sponsors') : '',
  get sponsorSearchTerm(){return sponsorSearchTerm;},
  setSponsorSearchTerm: value => {sponsorSearchTerm=value;}
};
window.hamAngularWizardContext = window.hamAngularMediaContext;
window.hamAngularReadLegacyState = () => campaignState.current;window.hamAngularLegacyActions = {persist:()=>persist(),renderPreview:()=>renderPreview(),snapshot:()=>snapshot()};let activeNavSection=null;let selected='header',tab='design',device='mobile',highlight=false,observer=null,toastTimer;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'₪'+Number(n||0).toLocaleString('he-IL');
function persist(){campaignState.writeDraft();}
function snapshot(){campaignState.snapshot();}
function updateUndo(){campaignState.syncUndo();}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2300)}
// Compatibility shim: Angular account component retains the original non-blocking toast.
window.hamAccountToast=(message)=>toast(message);
function change(fn,rerender=true){campaignState.change(fn,rerender);}
function select(id){
 if(hamSimpleDesignLocked(id))return;
 const changed=selected!==id;
 selected=id;
 // The visual editor is design-first. Keep the tab if the user reselects the same block.
 // Story editing and the donation-box editor retain their dedicated content controls.
 if(changed)tab=id==='story'?'content':'design';
 renderSections();renderPreview();renderInspector();
 // When changing components, begin at the component heading and its visible studio button.
 // Do not scroll while editing a field or when reselecting the same component.
 if(changed&&!hamWidePanel?.isConnected){
  const inspector=document.querySelector('.workspace > .inspector') as HTMLElement|null;
  if(inspector)inspector.scrollTop=0;
 }
 $('#crumbName').textContent=sections.find(s=>s[0]===id)?.[1]||'עיצוב כללי';
}
function deviceAllowed(id){if(id==='nav' && device==='desktop' && campaignState.current.template==='panorama')return true;if(id==='donationBox')return campaignState.current.content.donate.boxEnabled!==false;return campaignState.current.visible[id]!==false&&(campaignState.current.deviceVisibility?.[id]||'both')!==(device==='mobile'?'desktop':'mobile')}
const fixedTopSections=['header','hero','campaignInfo'];
const fixedBottomSections=['footer'];
const movableSections=sections.map(x=>x[0]).filter(id=>!fixedTopSections.includes(id)&&!fixedBottomSections.includes(id));
function orderFor(dev=device){
 const saved=campaignState.current.sectionOrder?.[dev]||[];
 const ordered=[...saved.filter(id=>movableSections.includes(id)),...movableSections.filter(id=>!saved.includes(id))];
 // Mobile campaign essentials always follow the short campaign story, in every template.
 if(dev==='mobile'){
   const pinned=['title','stats','donationBox'];
   return [...pinned.filter(id=>movableSections.includes(id)),...ordered.filter(id=>!pinned.includes(id))];
 }
 return ordered;
}
function moveMainSection(id,target){
 if(device==='mobile'&&['title','stats','donationBox'].includes(id))return;
 if(!movableSections.includes(id)||!movableSections.includes(target)||id===target)return;
 const order=orderFor();const old=order.indexOf(id),at=order.indexOf(target);
 if(old<0||at<0)return;
 order.splice(old,1);order.splice(at,0,id);
 change(()=>{campaignState.current.sectionOrder??={};campaignState.current.sectionOrder[device]=order});
 reorderMainPreview();
}
function reorderMainPreview(){
 const body=document.querySelector('#preview .campaign-body');
 if(!body)return;
 const ids=orderFor(device);
 const existing=[...body.children].filter(el=>el.dataset.part);
 const byId=new Map(existing.map(el=>[el.dataset.part,el]));
 let position=0;
 for(const id of ids){
   const el=byId.get(id);
   if(!el)continue;
   el.style.setProperty('order',String(position++),'important');
   body.appendChild(el);
   byId.delete(id);
 }
 for(const el of byId.values()){
   el.style.setProperty('order',String(position++),'important');
   body.appendChild(el);
 }
}

// The simple donation checkout reuses the current design inspector. Inapplicable
// page blocks stay visible but locked; their saved content and visibility are untouched.
const hamSimpleDesignEnabled=new Set(['theme','hero','donationBox']);
function hamSimpleDesignLocked(id){return campaignState.current.management?.campaignKind==='simple'&&!hamSimpleDesignEnabled.has(id)}
// The contextual studio action belongs to the component tree, not to the global toolbar.
// Buttons are regenerated alongside each tree row, so selection and device changes
// always keep the action associated with the correct block.
function hamAttachTreeStudioActions(){
 const list=document.getElementById('sectionList');if(!list)return;
 list.querySelectorAll<HTMLElement>('.section-item[data-select]').forEach(row=>{
  const id=row.dataset['select'];
  if(!id||hamSimpleDesignLocked(id)||row.querySelector('[data-ham-tree-studio]'))return;
  const btn=document.createElement('button');btn.type='button';
  btn.className='ham-tree-studio-button';btn.dataset['hamTreeStudio']=id;
  const name=sections.find(item=>item[0]===id)?.[1]||'הקמפיין';
  btn.setAttribute('aria-label',`עריכת ${name} בחלון גדול`);
  btn.setAttribute('title',`פותח חלון גדול עם אפשרויות העריכה של ${name}`);
  btn.textContent='✎ עריכה בחלון גדול';
  row.appendChild(btn);
 });
}
function renderSections(){
 document.body.classList.toggle('ham-simple-design-mode',campaignState.current.management?.campaignKind==='simple');
 if(campaignState.current.management?.campaignKind==='simple'){
   selected='hero';
   $('#sectionList').innerHTML='<div class="section-item active" data-select="hero"><span class="section-icon">🎨</span><span class="section-label">עיצוב דף תרומה פשוט<small>פריסה · צבעים · גופנים · כפתורים</small></span></div>';
   hamAttachTreeStudioActions();
   return;
 }
 if(hamSimpleDesignLocked(selected))selected='hero';
 const order=[...fixedTopSections,...orderFor(),...fixedBottomSections];
 $('#sectionList').innerHTML=`<div class="section-item general-design ${selected==='theme'?'active':''}" data-select="theme"><span class="section-icon">🎨</span><span class="section-label">עיצוב כללי<small>ערכות צבעים · פונטים · צבעי מותג</small></span></div><div class="section-divider"></div><div class="main-order-note">סדר הרכיבים עבור <strong>${device==='mobile'?'מובייל':'דסקטופ'}</strong> · גררו או השתמשו בחצים</div>`+order.map(id=>{
 const entry=sections.find(x=>x[0]===id),name=entry[1],icon=entry[2],movable=movableSections.includes(id)&&!(device==='mobile'&&['title','stats','donationBox'].includes(id)),idx=orderFor().indexOf(id);
 const locked=hamSimpleDesignLocked(id);
 const disabled=movable?'':'disabled';
 return `<div class="section-item main-order-item ${locked?'ham-simple-disabled':''} ${selected===id?'active':''} ${movable?'reorderable':'order-fixed'}" data-select="${id}" data-order-id="${id}" aria-disabled="${locked}" title="${locked?'לא זמין בדף תרומה פשוט':''}" ${movable&&!locked?'draggable="true"':''}><span class="section-icon">${icon}</span><span class="section-label">${name}<small>${locked?'לא זמין בדף תרומה פשוט':id==='donationBox'&&!campaignState.current.content.donate.boxEnabled?'מוסתר':!campaignState.current.visible[id]?'מוסתר':({both:'מובייל ודסקטופ',mobile:'מובייל בלבד',desktop:'דסקטופ בלבד'})[campaignState.current.deviceVisibility?.[id]||'both']}</small></span><span class="main-order-controls">${movable&&!locked?`<span class="main-drag-handle" title="גרור לשינוי סדר" aria-hidden="true">⠿</span><button type="button" data-main-move="up" data-main-id="${id}" title="העבר למעלה" aria-label="העבר ${name} למעלה" ${idx===0?'disabled':''}>↑</button><button type="button" data-main-move="down" data-main-id="${id}" title="העבר למטה" aria-label="העבר ${name} למטה" ${idx===movableSections.length-1?'disabled':''}>↓</button>`:`<span class="main-fixed-hint" title="רכיב קבוע במבנה התבנית">קבוע</span>`}</span><button class="visibility ${(id==='donationBox'?campaignState.current.content.donate.boxEnabled:campaignState.current.visible[id])?'':'off'}" data-visibility="${id}" ${locked?'disabled aria-disabled="true"':''} title="${locked?'לא זמין בדף תרומה פשוט':'הצג או הסתר'}">${(id==='donationBox'?campaignState.current.content.donate.boxEnabled:campaignState.current.visible[id])?'◉':'◌'}</button></div>`;
 }).join('');
 hamAttachTreeStudioActions();
}
// v4.53: the countdown is CampaignInfoPartComponent's (`tick`), with the campaign's current end date.
setInterval(()=>parts.tick(campaignState.current?.content?.campaignInfo?.endAt,device==='mobile'),60000);

function shareData(){const sh=campaignState.current.content.share||{};const url=String(sh.url||'').trim()||location.href;return {url,title:campaignState.current.content.hero.title,text:String(sh.message||'').trim()||campaignState.current.content.hero.title};}

// v0.1.93: one complete navigation catalog for the campaign, on all mobile styles.
// Only genuinely visible device-enabled components are linked, so manual hiding is respected.
const navTargets=[['story','סיפור'],['rewards','תשורות'],['donors','תורמים'],['ambassadors','שגרירים'],['comments','תגובות'],['updates','עדכונים'],['sponsors','חסויות']];
// A block's extra classes: on a phone, a block placed only in the navigation menu (`menu-only-*`).
function contentPartClass(id){const placement=campaignState.current.content.nav.placement||{};const menuOnly=id!=='rewards'&&device==='mobile'&&placement[id]==='menu';const shown=!menuOnly||activeNavSection===id||selected===id;return menuOnly?'menu-only-section '+(shown?'menu-only-active':'menu-only-inactive'):'';}

let dbEditScope='both';
const dbStyleKeys=['boxCardPresentation','boxDistribution','boxLayout','boxShape','boxCardBg','boxCardBorder','boxCardBorderWidth','boxCardRadius','boxCardHeight','boxCardFontSize','boxColumns','boxGap','boxBg','boxText','boxAccent'];
function dbStyleForDevice(d,dev=device){return {...d,...(d.boxResponsive?.[dev]||{})}}
function dbUpdateStyle(d,key,value){
 if(!d.boxResponsive)d.boxResponsive={};
 if(dbEditScope==='both'){
   d[key]=value;
   for(const target of ['mobile','desktop'])if(d.boxResponsive[target])delete d.boxResponsive[target][key];
 }else{
   if(!d.boxResponsive[dbEditScope])d.boxResponsive[dbEditScope]={};
   d.boxResponsive[dbEditScope][key]=value;
 }
}
// Relative donor timestamps, shared by card / row / carousel views.
// Preserve existing textual labels for legacy records without a reliable timestamp.
function hamDonationRelativeTime(donor, now=Date.now()){
 const raw=donor.donatedAt??donor.donated_at??donor.donated_at_utc??donor.createdAt??donor.created_at??donor.timestamp;
 if(raw===undefined||raw===null||raw==='')return String(donor.time||'');
 let stamp;
 if(typeof raw==='number')stamp=raw<1e11?raw*1000:raw;
 else if(typeof raw==='string'&&/^\d{10,13}$/.test(raw.trim())){const n=Number(raw);stamp=n<1e11?n*1000:n;}
 else stamp=new Date(raw).getTime();
 if(!Number.isFinite(stamp))return String(donor.time||'');
 const elapsed=Math.max(0,Math.floor((now-stamp)/1000));
 if(elapsed<60)return 'הרגע';
 const format=(n,singular,dual,plural)=>n===1?`לפני ${singular}`:n===2?`לפני ${dual}`:`לפני ${n} ${plural}`;
 if(elapsed<3600)return format(Math.floor(elapsed/60),'דקה','שתי דקות','דקות');
 if(elapsed<86400)return format(Math.floor(elapsed/3600),'שעה','שעתיים','שעות');
 if(elapsed<604800)return format(Math.floor(elapsed/86400),'יום','יומיים','ימים');
 if(elapsed<2592000)return format(Math.floor(elapsed/604800),'שבוע','שבועיים','שבועות');
 if(elapsed<31536000)return format(Math.floor(elapsed/2592000),'חודש','חודשיים','חודשים');
 return format(Math.floor(elapsed/31536000),'שנה','שנתיים','שנים');
}

// v4.45: the collection blocks (`CollectionBlocksService`): `window.HamonymCollection`, the public
// toolbar state, the menus closed from the document, and the preview observer that refreshes the
// carousel nav of new blocks.
collections.start({device:()=>device,setupCarousels:()=>setupCampaignCarousels()});
parts.start({device:()=>device,selected:()=>selected,highlight:()=>highlight,activeNavSection:()=>activeNavSection,deviceAllowed:id=>deviceAllowed(id),contentPartClass:id=>contentPartClass(id),donationBox:()=>{const d=campaignState.current.content.donate;return d.boxEnabled?dbStyleForDevice(d):null},storyMarkup:blocks=>storyRenderPublic(blocks),simpleState:()=>hamSimpleFlowState,simpleVisual:()=>hamSimpleVisualSettings(),toast:t=>toast(t),order:()=>orderFor(device),panoramaTab:()=>hamPanoramaActiveTab,setPanoramaTab:id=>{hamPanoramaActiveTab=id},cardDesign:()=>({shapes:hamCardDesignLibrary.shapes.map(s=>s[0]),meters:hamCardDesignLibrary.meters.map(m=>m[0])})});

// One clear donation action at a time in mobile and desktop previews.
// The standalone CTA remains an independently editable block; when placed
// immediately after the donation form it is redundant and is concealed.
// Moving it elsewhere restores it automatically.
// v4.52: the page's donate buttons and the sticky button (PublicPageComponent `syncCtas`); still called on scroll and resize.
function syncDonationCtas(){cards.syncDonationCtas();}
// Shared reward markup: management owns item data; Studio owns presentation.
// v0.1.37 — one shared, per-device card-size design model for rewards and race routes.
// Size controls affect presentation only; original item data and registration logic remain untouched.
// v0.1.37: one per-device card-size model for rewards and race routes (collection-style.ts).
const hamCardSizeDefaults=CARD_SIZE_DEFAULTS;
let hamCardSizeDevice='mobile';
function hamCardSizeFor(scope,dev=device){return cardSizeFor(campaignState.current,scope,dev);}
function hamCardSizeVars(scope,dev=device){return cardSizeVars(campaignState.current,scope,dev);}
function rewardStyleVars(cfg){return collectionRewardStyleVars(campaignState.current,cfg,device,esc);}
// v4.44: RewardTileComponent (public-page/cards).
function huStyleHeading(cfg,scope){return headingStyle(cfg,scope,esc);}
const ambassadorDemos=[{name:'ישראל ישראלי',target:15000,raised:8400},{name:'שרה לוי',target:10000,raised:6200},{name:'משפחת כהן',target:12000,raised:4300},{name:'רונית אברם',target:8000,raised:3500}];
function ambassadorSafeLink(url){const link=String(url||'').trim();return /^https?:\/\/[^\s]+$/i.test(link)?link:''}
let sponsorSearchTerm='';
// Unified campaign components: races, campaign updates and moderated comments.
const raceIsFull=r=>Number(r.capacity)>0 && Number(r.registered||0)>=Number(r.capacity);
const raceUnavailable=r=>String(r.status||'open')!=='open'||raceIsFull(r);
const raceDate=r=>{if(!r.date)return '';const t=new Date(String(r.date).slice(0,10)+'T12:00:00');return Number.isFinite(t.getTime())?t.toLocaleDateString('he-IL',{day:'numeric',month:'long',year:'numeric'}):String(r.date);};
function raceRegistrationOptions(r){
 const choices=(r.useRegistrationTypes===true && Array.isArray(r.registrationTypes)?r.registrationTypes:[])
 .filter(x=>String(x.title||'').trim()).map((x,i)=>({id:String(x.id||'tier-'+i),title:String(x.title),price:Math.max(0,Number(x.price)||0),description:String(x.description||'')}));
 return choices.length?choices:[{id:'basic',title:'הרשמה רגילה',price:Math.max(0,Number(r.price)||0),description:''}];
}
/* Shared content-card renderers: public view and management call the SAME markup functions. */
// v4.44: the components render this markup; the public page places the components themselves.
window.HamonymContentCards={
 ambassadorCard:(item,cfg,index,layout,personal)=>cards.html('ambassador',{item,cfg,index,layout,personal}),
 commentCard:(item,cfg)=>cards.html('comment',{item,cfg}),
 updateCard:(item,cfg,index)=>cards.html('update',{item,cfg,index})
};
// v0.1.44 — registration wizard prototype. Demo cart is memory-only, not payment or reservation.
const hamRegistrationBasket=[];
function hamRegCartBadge(){window.hamUnifiedCart?.refresh();}
function hamOpenRegBasket(checkout=false){window.hamUnifiedCart?.open(checkout);}
function raceRegistrationDialog(index){
 const r=campaignState.current.management?.modules?.races?.items?.[index];if(!r||raceUnavailable(r))return;
 const options=raceRegistrationOptions(r);
 const configuredLimit=Math.floor(Number(r.maxPerOrder??0));
 const max=Number.isFinite(configuredLimit)&&configuredLimit>0?configuredLimit:Infinity;
 const available=Number(r.capacity)>0?Math.max(0,Number(r.capacity)-Number(r.registered||0)):Infinity;
 const limit=Math.min(max,available);if(limit<1)return;
 document.getElementById('ham-race-dialog')?.remove();
 const d=document.createElement('dialog');d.id='ham-race-dialog';d.className='ham-race-dialog ham-reg-dialog ham-reg-simple';
 let step=1;
 const draft={typeId:options[0].id,count:1,contact:{name:'',phone:'',email:''},people:[{full:'',shirt:''}]};
 const ensurePeople=()=>{while(draft.people.length<draft.count)draft.people.push({full:'',shirt:''})};
 const active=()=>options.find(x=>x.id===draft.typeId)||options[0];
 const sum=()=>draft.count*active().price;
 const progress=()=>`<div class="ham-reg-progress" aria-label="שלבי ההרשמה"><span class="${step===1?'active':'done'}"><b>${step===1?'1':'✓'}</b>בחירה</span><i aria-hidden="true"></i><span class="${step===2?'active':''}"><b>2</b>פרטי משתתפים</span></div>`;
 const participantFields=()=>Array.from({length:draft.count},(_,i)=>{
  const p=draft.people[i];return `<div class="ham-reg-person-lite"><span class="ham-reg-person-number" aria-hidden="true">${i+1}</span><div class="ham-reg-person-main"><label>שם מלא${draft.count>1?` · משתתף ${i+1}`:''}<input type="text" data-reg-person="${i}" data-reg-field="full" value="${esc(p.full)}" minlength="2" maxlength="100" autocomplete="${i===0?'name':'off'}" required placeholder="שם המשתתף"></label>${r.shirtRequired?`<label>מידת חולצה<select required data-reg-person="${i}" data-reg-field="shirt"><option value="" ${!p.shirt?'selected':''} disabled>בחרו מידה</option>${['XS','S','M','L','XL','XXL'].map(size=>`<option value="${size}" ${p.shirt===size?'selected':''}>${size}</option>`).join('')}</select></label>`:''}</div></div>`;
 }).join('');
 const content=()=>{
  if(step===1)return `<div class="ham-reg-lead"><h3>בוחרים הרשמה</h3><p>${options.length>1?'בחרו את סוג ההשתתפות שמתאים לכם.':'בחרו כמה משתתפים תרצו לרשום.'}</p></div>${options.length>1?`<div class="ham-reg-type-options" role="radiogroup" aria-label="סוג הרשמה">${options.map(opt=>`<button type="button" role="radio" aria-checked="${active().id===opt.id}" class="ham-reg-type ${active().id===opt.id?'selected':''}" data-reg-type="${esc(opt.id)}"><span class="ham-reg-radio" aria-hidden="true"></span><span class="ham-reg-type-name"><strong>${esc(opt.title)}</strong>${opt.description?`<small>${esc(opt.description)}</small>`:''}</span><b>${money(opt.price)}</b></button>`).join('')}</div>`:`<div class="ham-reg-single-type"><span>הרשמה למסלול</span><strong>${money(active().price)} <small>למשתתף</small></strong></div>`}<div class="ham-reg-quantity"><div><strong>מספר משתתפים</strong>${limit>1?`<small>${Number.isFinite(limit)?`עד ${limit} משתתפים בהרשמה`:'ניתן להקליד מספר משתתפים'}</small>`:''}</div>${limit>1?`<div class="ham-reg-stepper"><button type="button" data-reg-quantity="-1" aria-label="הסר משתתף" ${draft.count<=1?'disabled':''}>−</button><input type="number" data-reg-quantity-input min="1" step="1" inputmode="numeric" ${Number.isFinite(limit)?`max="${limit}"`: ''} value="${draft.count}" aria-label="מספר משתתפים" title="הזינו מספר משתתפים"><button type="button" data-reg-quantity="1" aria-label="הוסף משתתף" ${draft.count>=limit?'disabled':''}>+</button></div>`:'<strong class="ham-reg-quantity-one">משתתף אחד</strong>'}</div>`;
  ensurePeople();return `<div class="ham-reg-lead"><div class="ham-reg-lead-row"><h3>מי משתתף?</h3><button type="button" class="ham-reg-text-back" data-reg-back>שינוי בחירה <span aria-hidden="true">›</span></button></div><p>רק שמות המשתתפים וטלפון אחד ליצירת קשר.</p></div><div class="ham-reg-people">${participantFields()}</div><div class="ham-reg-contact-lite"><label>טלפון ליצירת קשר<input type="tel" inputmode="tel" autocomplete="tel" data-reg-contact="phone" minlength="7" maxlength="25" value="${esc(draft.contact.phone)}" required placeholder="050-0000000"></label><small>נשתמש בו רק לצורך ההרשמה והעדכונים הקשורים לאירוע.</small></div>`;
 };
 const updateCount=raw=>{
  const n=Number(raw);if(!Number.isFinite(n)||!Number.isInteger(n)||n<1){const hint=d.querySelector('.ham-reg-quantity small');if(hint)hint.textContent='הקלידו מספר שלם וחיובי';return;}
  draft.count=Math.max(1,Math.min(limit,n));ensurePeople();render();
 };
 const render=()=>{
  const meta=[r.distance,r.location,r.date?raceDate(r):''].filter(Boolean).map(x=>esc(x)).join(' · ');
  d.innerHTML=`<div class="ham-dialog-head ham-reg-header"><div class="ham-reg-head-main"><span class="ham-reg-eyebrow">הרשמה למירוץ <small>· הדגמה</small></span><h2>${esc(r.title)}</h2>${meta?`<p>${meta}</p>`:''}</div><button type="button" data-race-close aria-label="סגור חלונית הרשמה">×</button></div>${progress()}<div class="ham-dialog-body ham-reg-body">${content()}</div><div class="ham-reg-bottom"><div class="ham-reg-total"><div><small>${draft.count} ${draft.count===1?'משתתף':'משתתפים'} · ${money(active().price)} ליחידה</small><strong>לתשלום</strong></div><b>${money(sum())}</b></div><div class="ham-dialog-actions ham-reg-footer">${step===1?'<button type="button" class="ham-reg-primary" data-reg-next>המשך לפרטים <span aria-hidden="true">←</span></button>':'<div class="ham-reg-final"><button type="button" class="ham-reg-outline" data-reg-add>הוסף לסל</button><button type="button" class="ham-reg-primary" data-reg-checkout>לתשלום עכשיו</button></div>'}</div><p class="ham-reg-disclaimer">הדמיה בלבד · אין חיוב או רישום אמיתי.</p></div>`;
 };
 const validate=()=>{
  const fields=[...d.querySelectorAll('input[required],select[required]')];
  const bad=fields.find(el=>!String(el.value||'').trim()||!el.checkValidity());
  if(bad){bad.reportValidity();bad.focus();return false;}
  return true;
 };
 const addCart=()=>{
  if(raceUnavailable(r))return false;
  const remaining=Number(r.capacity)>0?Number(r.capacity)-Number(r.registered||0):Infinity;
  const inCart=(window.hamUnifiedCart?.exportCart()||[]).filter(item=>item.kind==='race'&&item.sourceIndex===index).reduce((a,x)=>a+x.qty,0);
  if(inCart+draft.count>remaining){const note=d.querySelector('.ham-reg-disclaimer');if(note){note.textContent='אין די מקומות פנויים לכמות הזו בסל ההדגמה.';note.classList.add('ham-reg-error')}return false;}
  const participants=draft.people.slice(0,draft.count).map(p=>{const full=String(p.full||'').trim().replace(/\s+/g,' '),names=full.split(' ');return {fullName:full,first:names[0]||'',last:names.slice(1).join(' '),shirt:r.shirtRequired?p.shirt:''};});
  window.hamUnifiedCart?.addRace({raceIndex:index,title:String(r.title||''),type:active().title,unitPrice:active().price,total:sum(),contact:{...draft.contact},participants});
  hamRegCartBadge();return true;
 };
 d.addEventListener('input',e=>{const x=e.target;if(x.dataset.regContact)draft.contact[x.dataset.regContact]=x.value;if(x.dataset.regPerson!==undefined)draft.people[Number(x.dataset.regPerson)][x.dataset.regField]=x.value;});
 d.addEventListener('change',e=>{const x=e.target;if(x.matches('[data-reg-quantity-input]')){updateCount(x.value);return;}if(x.dataset.regPerson!==undefined)draft.people[Number(x.dataset.regPerson)][x.dataset.regField]=x.value;});
 d.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-race-close')){d.close();return;}
  if(b.dataset.regType){draft.typeId=b.dataset.regType;render();return;}
  if(b.dataset.regQuantity){updateCount(draft.count+Number(b.dataset.regQuantity));return;}
  if(b.hasAttribute('data-reg-back')){step=1;render();return;}
  if(b.hasAttribute('data-reg-next')){step=2;render();return;}
  if(b.hasAttribute('data-reg-add')||b.hasAttribute('data-reg-checkout')){if(!validate()||!addCart())return;const checkout=b.hasAttribute('data-reg-checkout');d.close();hamOpenRegBasket(checkout);}
 });
 document.body.appendChild(d);d.addEventListener('close',()=>d.remove());render();d.showModal();
}
window.hamRaceRegistrationBridge=function(index){raceRegistrationDialog(index);};
document.addEventListener('click',e=>{const b=e.target.closest('[data-race-register]');if(b){e.preventDefault();e.stopPropagation();raceRegistrationDialog(Number(b.dataset.raceRegister));}});

function demoCommentDialog(){
 document.getElementById('ham-comment-dialog')?.remove();
 const d=document.createElement('dialog');d.id='ham-comment-dialog';d.className='ham-race-dialog';
 d.innerHTML=`<div class="ham-dialog-head"><div><small>תגובות הקמפיין · הדגמה</small><h2>הוספת תגובה</h2><p>התגובה תישמר כטיוטה מקומית ותחכה לאישור מנהל הקמפיין.</p></div><button data-comment-close type="button" aria-label="סגור">×</button></div><div class="ham-dialog-body"><label class="ham-comment-draft-label">שם<input data-comment-author required placeholder="איך קוראים לכם?"></label><label class="ham-comment-draft-label">התגובה<textarea data-comment-message required rows="4" placeholder="כתבו כמה מילים..."></textarea></label><p class="ham-dialog-notice">הדמיה בלבד: אין שליחה לשרת, והתגובה לא מופיעה לציבור עד שאושרה במסך הניהול.</p></div><div class="ham-dialog-actions"><button data-comment-close type="button">ביטול</button><button data-comment-submit type="button">שמור תגובה לדוגמה</button></div>`;
 document.body.appendChild(d);
 d.addEventListener('click',e=>{if(e.target.closest('[data-comment-close]'))d.close();if(e.target.closest('[data-comment-submit]')){
  const name=d.querySelector('[data-comment-author]').value.trim(),txt=d.querySelector('[data-comment-message]').value.trim();
  if(!name||!txt){(name?d.querySelector('[data-comment-message]'):d.querySelector('[data-comment-author]')).focus();return;}
  campaignState.current.management??={};campaignState.current.management.modules??={};campaignState.current.management.modules.comments??={items:[]};campaignState.current.management.modules.comments.items??=[];
  change(()=>campaignState.current.management.modules.comments.items.push({name,text:txt,date:new Date().toISOString().slice(0,10),approved:false}));
  toast('התגובה נשמרה כטיוטת הדגמה — אישור בניהול');d.close();
 }});
 d.addEventListener('close',()=>d.remove());d.showModal();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-comment-demo]');if(b){e.preventDefault();e.stopPropagation();demoCommentDialog();}});


window.hamonymUpdatePreviewCard=(r,cfg)=>cards.html('updatePreview',{item:r,cfg}); // v4.44: UpdatePreviewComponent


// v0.1.34 — shared RTL carousel. Keep the visual and data models untouched.
// First item is on the RIGHT. Right-facing arrow = previous; left-facing = next.
// One configuration and one layout engine for every campaign carousel.
const hamCarouselModules=[
 {scope:'rewards',track:'.reward-tiles',card:'.reward-tile',label:'תשורות',ordinary:'cards'},
 {scope:'sponsors',track:'.sponsor-grid',card:'.sponsor-tile',label:'חסויות',ordinary:'logos'},
 {scope:'donors',track:'.donors-items',card:'.donors-entry',label:'תורמים',ordinary:'list'},
 {scope:'ambassadors',track:'.ambassador-collection',card:'.ambassador-card',label:'שגרירים',ordinary:'cards'},
 {scope:'races',track:'.ham-race-grid',card:'.ham-race-card',label:'מירוצים',ordinary:'cards'},
 {scope:'updates',track:'.ham-update-grid',card:'.ham-update-card',label:'עדכונים',ordinary:'feed'},
 {scope:'comments',track:'.ham-comment-grid',card:'.ham-comment-card',label:'תגובות',ordinary:'list'}
];
const hamCarouselBaseline={
 rewards:[260,216],sponsors:[145,170],donors:[240,226],ambassadors:[235,230],
 races:[265,238],updates:[245,238],comments:[230,224]
};
function hamPresentationFor(scope,dev=device){return presentationFor(campaignState.current,scope,dev);}
function hamPresentationMetrics(scope,dev=device){
 const conf=campaignState.current.content?.[scope]||{},p=hamPresentationFor(scope,dev);
 const base=hamCarouselBaseline[scope]||[240,285];
 const nominal=base[dev==='mobile'?0:1];
 const variants={compact:.79,balanced:1,wide:1.2,two:dev==='mobile'?.57:.82};
 let width=Math.round(nominal*variants[p.preset]);
 if(p.preset==='two'&&dev==='mobile')width=Math.max(122,Math.min(147,width));
 // Respect customized dimensions only when no simple preset has been explicitly chosen.
 if(['rewards','races'].includes(scope)&&!conf.presentation?.[dev]?.preset&&p.preset==='balanced'){
  const saved=conf.cardSizing?.[dev]?.width;
  if(Number(saved)>=170)width=Number(saved);
 }
 const columns=dev==='mobile'
  ?(p.preset==='two'?2:p.preset==='wide'?1:(scope==='sponsors'?2:1))
  :(p.count==='auto'?4:Math.max(1,Math.min(4,Number(p.count)||1)));
 const gap=p.preset==='two'?8:p.preset==='compact'?9:Math.max(8,Math.min(24,Number(conf.gap)||12));
 const gutter=p.nav==='dots'?6:p.preset==='two'?26:34;
 return {...p,width,columns,gap,gutter};
}
function setupCampaignCarousels(){
 const preview=document.getElementById('preview');if(!preview)return;
 for(const def of hamCarouselModules){
  const {scope,track:selector,card:cardSelector,label}=def;
  const conf=campaignState.current.content?.[scope]||{};
  const block=preview.querySelector(`[data-part="${scope}"]`);if(!block)continue;
  if(scope==='donors'&&block.querySelector('.hc-public-collection'))continue;
  const track=block.querySelector(selector);if(!track)continue;
  const measured=hamPresentationMetrics(scope,device);
  const items=()=>Array.from(track.children).filter(el=>el.matches(cardSelector));
  const isCarousel=conf.layout==='carousel';
  track.classList.add('ham-present-track',`ham-present-${measured.preset}`);
  track.dataset.hamTextDensity=measured.text;
  if(!isCarousel){
   if(conf.layout==='cards'||(scope==='rewards'&&conf.layout==='compact')){
    track.classList.add('ham-centered-cards');
    const full=measured.preset==='two'&&device==='mobile'?2:Math.max(1,Math.min(5,Number(conf[device==='mobile'?'columnsMobile':'columnsDesktop'])||(device==='mobile'?1:2)));
    const cols=measured.preset==='two'?2:full;
    const width=measured.width;
    track.style.setProperty('--ham-present-card-width',width+'px');
    track.style.setProperty('--ham-present-columns',String(cols));
    track.style.setProperty('--ham-present-gap',measured.gap+'px');
   }
   continue;
  }
  const shell=document.createElement('div');shell.className='ham-carousel-shell ham-unified-carousel ham-present-'+measured.preset;
  shell.classList.toggle('ham-carousel-nav-dots',measured.nav==='dots');
  shell.dataset.hamTextDensity=measured.text;
  track.before(shell);
  const stage=document.createElement('div');stage.className='ham-carousel-stage';shell.append(stage);stage.append(track);
  const btn=(part,path,title)=>{const b=document.createElement('button');b.type='button';b.className='ham-carousel-arrow';b.dataset[part]='';b.setAttribute('aria-label',title);b.title=title;b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;stage.append(b);return b};
  const previous=btn('carouselPrev','m9 18 6-6-6-6','הקודם');
  const next=btn('carouselNext','m15 18-6-6 6-6','הבא');
  const nav=document.createElement('div');nav.className='ham-carousel-nav';nav.setAttribute('aria-label','ניווט בקרוסלת '+label);
  nav.innerHTML='<div class="ham-carousel-dots" role="group" aria-label="בחירת כרטיס"></div><span class="ham-carousel-status" aria-live="polite"></span><span class="ham-carousel-swipe-hint">החליקו לעוד</span>';shell.append(nav);
  const dots=nav.querySelector('.ham-carousel-dots');
  track.classList.add('ham-carousel-track');track.setAttribute('role','region');track.setAttribute('aria-roledescription','קרוסלה');track.setAttribute('aria-label','קרוסלת '+label);track.tabIndex=0;
  let index=0,visible=1,scrollTick=0;
  const maxIndex=()=>Math.max(0,items().length-visible);
  function paint(){
   index=Math.max(0,Math.min(index,maxIndex()));
   const enabled=maxIndex()>0;previous.hidden=next.hidden=nav.hidden=!enabled;
   previous.disabled=index===0;next.disabled=index>=maxIndex();
   nav.querySelector('.ham-carousel-status').textContent=`${Math.min(index+1,items().length)} / ${items().length}`;
   if(enabled){const max=maxIndex(),start=max<7?0:Math.max(0,Math.min(max-6,index-3)),end=Math.min(max,start+6);
    dots.innerHTML=Array.from({length:end-start+1},(_,i)=>{const at=start+i;return `<button type="button" class="ham-carousel-dot${at===index?' is-active':''}" data-carousel-dot="${at}" aria-label="כרטיס ${at+1}" ${at===index?'aria-current="true"':''}></button>`}).join('');
   }
  }
  function step(target){
   const row=items();if(!row.length)return;
   index=Math.max(0,Math.min(maxIndex(),target));
   const leftDiff=row[index].getBoundingClientRect().right-track.getBoundingClientRect().right;
   track.scrollBy({left:leftDiff,behavior:'smooth'});paint();
  }
  previous.addEventListener('click',e=>{e.stopPropagation();step(index-1)});
  next.addEventListener('click',e=>{e.stopPropagation();step(index+1)});
  dots.addEventListener('click',e=>{const b=e.target.closest('[data-carousel-dot]');if(b){e.stopPropagation();step(Number(b.dataset.carouselDot))}});
  track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowLeft'){e.preventDefault();step(index+1)}if(e.key==='ArrowRight'){e.preventDefault();step(index-1)}});
  track.addEventListener('scroll',()=>{cancelAnimationFrame(scrollTick);scrollTick=requestAnimationFrame(()=>{
   const right=track.getBoundingClientRect().right;let closest=index,best=Infinity;
   items().forEach((el,i)=>{if(i>maxIndex())return;const d=Math.abs(el.getBoundingClientRect().right-right);if(d<best){best=d;closest=i}});
   index=closest;paint();
  })},{passive:true});
  const fit=()=>{
   const width=shell.clientWidth;if(width<1)return;
   const length=items().length;
   const gap=measured.gap;
   // All modules share this one responsive sizing algorithm. The settings are
   // per-device; a saved mobile layout never constrains the desktop carousel.
   const allowed=Math.max(1,Math.min(length||1,device==='desktop'?4:2));
   const idealGutter=measured.nav==='dots'?8:measured.preset==='two'?33:39;
   const safe=Math.max(0,width-2*idealGutter);
   const requested=measured.count==='auto'?'auto':Math.max(1,Math.min(allowed,Number(measured.count)||1));
   const autoCount=Math.max(1,Math.floor((safe+gap)/(measured.width+gap)));
   let columns=requested==='auto'?Math.min(allowed,autoCount):Math.min(allowed,requested);
   // When a user explicitly requests 3 or 4, cards may shrink slightly to fit.
   // Below a readable minimum, reduce columns instead of cutting a card.
   const minimum=measured.preset==='two'?112:scope==='sponsors'?105:measured.preset==='compact'?145:170;
   while(columns>1&&columns*minimum+(columns-1)*gap>safe+0.5)columns--;
   const canNavigate=length>columns;
   const gutter=canNavigate?idealGutter:0;
   const usable=Math.max(0,width-2*gutter);
   const available=Math.max(0,(usable-(columns-1)*gap)/columns);
   const itemWidth=measured.spread==='stretch'?available:Math.min(measured.width,available);
   const contentWidth=Math.max(0,columns*itemWidth+(columns-1)*gap);
   visible=columns;
   shell.classList.toggle('ham-no-navigation',!canNavigate);
   shell.classList.toggle('ham-spread-stretch',measured.spread==='stretch');
   // Center complete cards. When no navigation is needed, the arrows have no
   // reserved gutter; optional stretch makes the cards fill the whole width.
   shell.style.setProperty('--ham-stage-w',Math.min(width,contentWidth+2*gutter)+'px');
   shell.style.setProperty('--ham-track-w',contentWidth+'px');
   shell.style.setProperty('--ham-gutter',gutter+'px');
   shell.style.setProperty('--ham-car-gap',gap+'px');
   shell.style.setProperty('--ham-col-count',String(columns));
   track.scrollLeft=0;index=0;paint();
  };
  fit();if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(fit);observer.observe(shell)}
 }
}

// v4.48: the donation amounts' columns and carousel are DonationBoxComponent's (`layoutDonationAmounts`, run by `cards.attachPage()`).
/* v0.1.74 — opt-in desktop layouts and photo slider. Same campaign model and renderer. */
// v4.46: the Hero slider's current slide is kept by PublicPartsService.
let hamStoryExpanded=true;
let hamPanoramaActiveTab='story';
// Angular bridge: retain the original renderer's lexical state when StoryExpandService updates it.
window.hamStoryExpansionBridge=function(expanded){hamStoryExpanded=!!expanded;hamPanoramaActiveTab='story';};
// Angular public-render finalizer compatibility: read the renderer-owned active tab.
window.hamPanoramaActiveTabBridge=function(){return hamPanoramaActiveTab;};
// Read the saved campaign placement, not the transient DOM (inactive Panorama tabs
// may be hidden/moved by the renderer when the finalizer runs).
window.hamRewardsMainPlacementBridge=function(){
 return campaignState.current.content?.rewards?.desktopPosition==='main'
   && campaignState.current.visible?.rewards!==false && (campaignState.current.content?.rewards?.items||[]).length>0;
};
window.hamUpdateModelBridge=function(index){try{return [campaignState.current.content.updates,...(campaignState.current.management?.modules?.updates?.items||[])][index];}catch(_){return undefined;}};

function hamTemplateThumbnail(id){
  const image='<span class="ham-thumb-image"></span>',copy='<span class="ham-thumb-copy"><i></i><i></i><i></i></span>',amount='<span class="ham-thumb-donation"><i></i><i></i></span>',story='<span class="ham-thumb-story"><i></i><i></i><i></i></span>';
  const bottom=`<div class="ham-thumb-bottom">${amount}${story}</div>`;
  if(id==='heroOverlay')return `<div class="ham-layout-picture ham-thumb-overlay">${image}<div class="ham-thumb-over-card">${amount}</div>${bottom}</div>`;
  if(id==='split')return `<div class="ham-layout-picture ham-thumb-split"><div class="ham-thumb-intro">${copy}${amount}</div>${image}${bottom}</div>`;
  if(id==='slider')return `<div class="ham-layout-picture ham-thumb-slider">${image}<span class="ham-thumb-dots">● ● ●</span>${bottom}</div>`;
  if(id==='panorama')return `<div class="ham-layout-picture ham-thumb-panorama">${image}${copy}${bottom}</div>`;
  if(id==='donation')return `<div class="ham-layout-picture ham-thumb-simple">${image}<div class="ham-thumb-simple-center">${copy}${amount}</div>${story}</div>`;
  if(id==='editorial')return `<div class="ham-layout-picture ham-thumb-editorial">${copy}${image}${story}</div>`;
  return `<div class="ham-layout-picture ham-thumb-blocks">${image}${copy}${amount}${story}</div>`;
}
// Simple donation checkout: purpose-built presentation, shared campaign identity/amount data.
// No campaign content or settings are deleted by changing the campaign kind.
// v0.1.225 — Only the simple donation flow is adapted from the user-supplied standalone demo.
// Existing campaign renderer, templates and public business state are unchanged.
const hamSimpleFlowState={step:1,frequency:'once',amount:180,custom:'',fullName:'',email:'',phone:'',identityNumber:'',anonymous:false,dedication:'',done:false,error:''};
function hamSimpleVisualSettings(){
 const m=campaignState.current.management||(campaignState.current.management={});
 // The settings live in management; changing campaign types does not overwrite them.
 return Object.assign({identityMode:'avatar',avatarSymbol:'heart',avatarColor:'#246f65',showHeroLogo:true,showSteps:true,showFrequency:true,logoAnchor:'top-center',titleAnchor:'middle-center',subtitleAnchor:'bottom-center',heroLogoAnchor:'top-center',heroTitleAnchor:'middle-center',heroSubtitleAnchor:'bottom-center',titleFontSize:19,titleWeight:800,titleColor:'#071b35',subtitleFontSize:12,subtitleWeight:500,subtitleColor:'#8499be',heroTitleColor:'#ffffff',heroSubtitleColor:'#ffffff',heroHeight:190,avatarSize:46,pageColor:'#ffffff',cardColor:'#ffffff',amountSelectedColor:'#f0faf4',continueButtonColor:'#73cc97',layoutMode:'',identityPosition:'middle-center',fontFamily:'Heebo',logoBorder:false,logoBorderColor:'#e1e8e5',logoBorderWidth:1,logoShape:'circle',logoBackground:'#ffffff',titleAlign:'center',heroHeightDesktop:210,heroHeightMobile:150,buttonHoverColor:'#64bd8e',buttonTextColor:'#ffffff',buttonBorderColor:'#73cc97',buttonRadius:22,amountColor:'#ffffff',amountBorderColor:'#dbe3ef',amountHoverColor:'#eef7f2',amountSelectedBorderColor:'#0d733b',stepsActiveColor:'#07682f',stepsInactiveColor:'#9baed0',textColor:'#071b35'},m.simpleDonation||{});
}

// v4.51: the simple donation page (old `hamRenderSimpleDonation` and its document handlers) is
// SimpleDonationComponent (public-page/parts), in the page's template; its state is still `hamSimpleFlowState`.
// v4.47: the page's layout (the panorama and slider columns, the panorama's sidebar, tabs, share strip,
// Hero logo and manager fact, the header's links and actions, the "donation" template's focus group) is
// rendered in place by PublicPageComponent (public-page/parts/page-layout.ts). v4.52: the container's panorama
// variables, menu class and stats-card classes are preview-host.ts's (`hamApplyCampaignLayout` and
// `hamApplyHeroStatsCard` are gone).
// v4.46: the slider arrows and dots (PublicPartsService), in this listener's place.
parts.listen();
document.addEventListener('click',e=>{
 if(e.target.closest('[data-ham-slide-nav],[data-ham-slide-dot]'))return;
 const storyToggle=e.target.closest('[data-ham-story-toggle]');
 if(storyToggle){
   const article=storyToggle.closest('.ham-story-article');
   if(article){
     hamStoryExpanded=!hamStoryExpanded;
     hamPanoramaActiveTab=hamStoryExpanded?'story':'donors';
     article.classList.toggle('ham-story-clamped',!hamStoryExpanded);
     storyToggle.textContent=hamStoryExpanded?'הצג פחות  ↑':'המשך לקרוא  ↓';
     storyToggle.setAttribute('aria-expanded',String(hamStoryExpanded));
     const storyRegion=article.querySelector(':scope > .story');
     if(storyRegion){if(hamStoryExpanded){storyRegion.setAttribute('role','region');storyRegion.setAttribute('aria-label','סיפור הקמפיין');}else{storyRegion.removeAttribute('role');storyRegion.removeAttribute('aria-label');article.scrollIntoView({behavior:'smooth',block:'start'});}}
     hamPanoramaSelectTab(hamPanoramaActiveTab,article.closest('#preview'),false);
     window.hamAlignPanoramaColumns?.();
     e.preventDefault();e.stopPropagation();
   }
   return;
 }
 const remove=e.target.closest('[data-ham-slider-remove]');if(remove){
   campaignState.current.content.hero.slides?.splice(Number(remove.dataset.hamSliderRemove),1);
   parts.resetSlideKey();persist();renderPreview();renderInspector();return;
 }
});
document.addEventListener('change',async e=>{
 if(!e.target.matches('[data-ham-slider-upload]'))return;
 const field=e.target, file=field.files?.[0];if(!file)return;
 try{
   const media=window.hamonymMediaFix;if(!media)throw Error('מנגנון העלאת התמונות עדיין אינו מוכן');
   campaignState.current.content.hero.slides ||= [];
   if(campaignState.current.content.hero.slides.length>=5)throw Error('אפשר להוסיף עד חמש תמונות לסליידר');
   const blob=await media.process(file,'hero'),ref=await media.save(blob);
   campaignState.current.content.hero.slides.push(ref);parts.resetSlideKey();persist();renderPreview();renderInspector();media.patchMedia?.();
 }catch(err){console.error('Slider image upload failed',err);toast(err.message||'שגיאה בהעלאת תמונה');}
 finally{field.value='';}
});

// Standalone HTML prototype: authentication is supplied by the host campaign application.
document.addEventListener('click',e=>{if(e.target.closest('[data-ham-login]'))toast('התחברות תיפתח דרך מערכת המשתמשים של המונים');});


// One stateful menu: below the story when compact, above when reading in full.
window.hamPanoramaSelectTab = hamPanoramaSelectTab;
function hamPanoramaSelectTab(id,preview=document.getElementById('preview'),scroll=false){
 if(!preview||!['story','rewards','donors','ambassadors','comments','updates','sponsors'].includes(id))return;
 hamPanoramaActiveTab=id;
 const wrap=preview.querySelector('.ham-panorama-tabs');
 if(!wrap)return;
 // v4.53: the tab buttons, the panels, the story article and the title render the chosen tab (PublicPageComponent).
 parts.selectPanoramaTab(id);
 if(scroll)requestAnimationFrame(()=>wrap.scrollIntoView({behavior:'smooth',block:'start'}));
}
// v0.1.95: The same navigational tab bar changes position when story expands.
document.addEventListener('click',e=>{
 const tab=e.target.closest('.ham-panorama-tabs [data-ham-panorama-tab]');
 if(!tab)return;
 const preview=tab.closest('#preview');
 if(!preview)return;
 const selected=tab.dataset.hamPanoramaTab;
 const article=preview.querySelector('.ham-story-article');
 hamPanoramaSelectTab(selected,preview,false);
 window.hamAlignPanoramaColumns?.();
 e.preventDefault();e.stopImmediatePropagation();
},true);



// Hero stats card (v4.47: PublicPageComponent renders the stats section inside the card, page-layout.ts).
// The classes of #preview stay here.

// Reusable outline SVG icons for funding metrics in both the footer and the upper card.
function hamStatSvg(id){
 const paths={
  days:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
  percent:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 7-7"/>',
  raised:'<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  donors:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2"/><circle cx="18" cy="9" r="2"/><path d="M18 14a5 5 0 0 1 4 5"/>'
 };
 return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[id]||paths.raised}</svg>`;
}

// v0.1.285: Footer + top/bottom data bars (same campaign funding source; visual configuration only).
// v4.46: the footer is FooterPartComponent (it renders what hamRenderFooter285 wrote over the old footer).
// The missing footer settings are still filled from the defaults on every render, before the page is written.
function hamFooterDefaults(){
 const c=campaignState.current.content;
 const f=c.footer ||= {};
 const footerDefaults=defaults().content.footer;
 for(const [key,value] of Object.entries(footerDefaults))if(f[key]===undefined)f[key]=value;
}
// v4.46: the footer's quick links and newsletter form are handled by FooterPartComponent.
document.addEventListener('change',e=>{
 const el=e.target.closest?.('[data-ham-text-icons]');if(!el)return;
 campaignState.current.management ||= {};campaignState.current.management.heroStatsCard ||= {};
 campaignState.current.management.heroStatsCard.textIcons=el.checked;
 persist();renderPreview();
},true);

function renderPreview(){
 // One-time, conservative panorama preset migration: only unchanged factory values.
 // Settings the campaign manager has selected remain untouched thereafter.
 if(campaignState.current.template==='panorama'){
   campaignState.current.management ||= {};
   if(!campaignState.current.management.panoramaStudioPreset82){
     const h=campaignState.current.content.hero, hd=campaignState.current.content.header;
     if(h.height===340)h.height=255;
     if(h.textAnchor==='bottom-center')h.textAnchor='top-right';
     if(h.logoAnchor==='top-right')h.logoAnchor='bottom-right';
     if(h.textAlign==='center')h.textAlign='right';
     if(!h.titleAlign)h.titleAlign='right';
     if(!h.subtitleAlign)h.subtitleAlign='right';
     if(h.logoWidth===110)h.logoWidth=105;
     const info=campaignState.current.content.campaignInfo;
     if(info.category && info.category!=='אחר')info.showCategory=true;
     hd.height ??= 60;
     hd.brandWidth ??= 140;
     hd.navGap ??= 12;
     hd.navFontSize ??= 13;
     hd.desktopMenuAlign ??= 'nearLogo';
     campaignState.current.management.panoramaStudioPreset82=true;
     persist();
   }
 }
 if(campaignState.current.template==='panorama'){
   campaignState.current.management ||= {};
   const h=campaignState.current.content.hero;
   if(!campaignState.current.management.panoramaReferencePreset83){
     // Factory Panorama initial layout only: centered vertically on right; logo below.
     if(h.textAnchor==='top-right' && h.logoAnchor==='bottom-right')h.textAnchor='middle-right';
     if(h.logoAnchor==='bottom-right' && h.logoBelowText===undefined)h.logoBelowText=true;
     h.mobileTextAnchor ??= 'middle-center';
     const menu=campaignState.current.content.header;
     if(menu.menuItems==='הסיפור,תורמים,עדכונים')menu.menuItems='הסיפור,תורמים,שגרירים,עדכונים';
     campaignState.current.management.panoramaReferencePreset83=true;persist();
   }
   // One-time migration of older drafts whose reference preset left text at TOP-right.
   // Future manual Studio position changes remain fully editable.
   if(!campaignState.current.management.panoramaHeroAnchorPreset85){
     const hero=campaignState.current.content.hero;
     if(hero.textAnchor==='top-right')hero.textAnchor='middle-right';
     if(hero.textAnchor==='middle-right'&&hero.textAlign==='center')hero.textAlign='right';
     if(hero.textAnchor==='middle-right'&&hero.titleAlign==='center')hero.titleAlign='right';
     if(hero.textAnchor==='middle-right'&&hero.subtitleAlign==='center')hero.subtitleAlign='right';
     campaignState.current.management.panoramaHeroAnchorPreset85=true;
     persist();
   }
   // The selected subtopic wins in the small public strip (e.g. התיישבות).
   const ci=campaignState.current.content.campaignInfo;
   const selectedId=campaignState.current.management.entryWizard?.categoryId;
   const selectedItem=campaignCategoryCatalog.find(x=>x.id===selectedId);
   if(selectedItem && (!ci.category||ci.category==='קהילה וחברה'&&selectedItem.label!=='קהילה וחברה'))ci.category=selectedItem.label;
   if((ci.subcategory||ci.category)&&ci.category!=='אחר'&&ci.showCategory!==true)ci.showCategory=true;
 }
 const c=campaignState.current.content,p=$('#preview');
 // v4.52: the container's classes and variables (preview-host.ts), written to the Studio's legacy #preview.
 // v4.53: the container's classes and variables are the page's host bindings (preview-host.ts).
hamFooterDefaults();
// v4.46: the page is PublicPageComponent (public-page/parts): the header, Hero, campaign info, title, stats,
// donate button, navigation, story and footer, and the blocks as its own child components. It reads the
// campaign as it is now (the guidance wrapper of the management screen included) and resolves media refs itself.
// v4.47: the page comes laid out (the blocks in the device's order, each with its `order`, and the
// desktop templates' columns, sidebar, tabs and Hero stats card: page-layout.ts).
// v4.53: the page is created once with #preview as its host, and rendered again in place on every call.
cards.renderPage(p);
hamHoverAfterRender?.();
 // v4.52: the Hero fits its subtitle to one line (unless 'auto'), the container's layout classes and variables, then
 // the race Hero card's position: the same points as before, the DOM changes are the components'.
cards.fitHeroSubtitle();
cards.layoutHost();
cards.placeRaceCard();
window.hamUnifiedCart?.mount();
// v4.48: `setupCampaignCarousels` is not run here any more: no block of the page renders the tracks it lays
// out (`.reward-tiles`, `.donors-items`, … are now `.hc-items`). The function stays for its bridge and the blocks' hook.
cards.attachPage();

syncDonationCtas();
}
// v4.54: the schema is inspector/inspector-schema.ts.
const schema=INSPECTOR_SCHEMA;

// Group numeric shekel fields in edit mode while retaining numeric application state.
function huReadAmount(value){
 const normalized=String(value??'').replace(/[₪,\s\u00a0\u200e\u200f]/g,'').replace(/[^0-9.]/g,'');
 const n=Number(normalized);return Number.isFinite(n)?n:0;
}
function huFormatAmount(value){
 if(value===null||value===undefined||String(value).trim()==='')return '';
 let digits=String(value).replace(/[₪,\s\u00a0\u200e\u200f]/g,'').replace(/[^0-9.]/g,'');
 if(!digits)return '';
 const dot=digits.indexOf('.');
 if(dot>=0)digits=digits.slice(0,dot+1)+digits.slice(dot+1).replace(/\./g,'');
 let [integer,decimal]=digits.split('.');
 integer=(integer||'0').replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return integer+(dot>=0?'.'+String(decimal||'').slice(0,2):'');
}
// Capture before both v13.3 and Unified Studio's delegated input handlers.
document.addEventListener('input',e=>{
 const el=e.target;if(!el.matches?.('input[data-money]'))return;
 const before=el.value, caret=el.selectionStart??before.length;
 const numericalBefore=before.slice(0,caret).replace(/[^0-9.]/g,'').length;
 const after=huFormatAmount(before);if(before===after)return;
 el.value=after;
 let offset=0,seen=0;
 while(offset<after.length&&seen<numericalBefore){if(/[0-9.]/.test(after[offset]))seen++;offset++}
 try{el.setSelectionRange(offset,offset)}catch{}
},true);
document.addEventListener('blur',e=>{
 const el=e.target;if(!el.matches?.('input[data-money]'))return;
 if(el.value)el.value=huFormatAmount(huReadAmount(el.value));
},true);
function hamSliderUnit(key){
 return /(?:Weight|Count|Columns|Rows|Opacity|Percent|Speed|Scale|Order|Index|Duration|Delay|Ratio)$/.test(key)?'':' px';
}
function applyTypographyPreset(scope,id){
 const obj=campaignState.current.content[scope];if(!obj)return;
 const t={
  classic:{align:'right',weight:800,subWeight:400,size:26,subSize:15,effect:'none',spacing:0},
  bold:{align:'center',weight:900,subWeight:600,size:34,subSize:16,effect:'none',spacing:-.5},
  elegant:{align:'right',weight:500,subWeight:400,size:30,subSize:16,effect:'none',spacing:.5},
  emotional:{align:'center',weight:900,subWeight:500,size:35,subSize:17,effect:'shadow',spacing:-.5}
 }[id];if(!t)return;
 if(scope==='hero'){
  Object.assign(obj,{titleAlign:t.align,subtitleAlign:t.align,titleWeight:t.weight,subtitleWeight:t.subWeight,titleFontSize:Math.max(24,t.size+8),subtitleFontSize:t.subSize,titleEffect:t.effect,subtitleEffect:id==='emotional'?'shadow':'none',titleLetterSpacing:t.spacing,subtitleLetterSpacing:0,titleColor:'#ffffff',subtitleColor:'#ffffff'});
 }else if(scope==='title'){
  Object.assign(obj,{titleAlign:t.align,subtitleAlign:t.align,descriptionAlign:t.align,titleWeight:t.weight,subtitleWeight:t.subWeight,descriptionWeight:400,titleFontSize:t.size,subtitleFontSize:t.subSize,descriptionFontSize:14,titleEffect:t.effect,subtitleEffect:'none',descriptionEffect:'none',titleLetterSpacing:t.spacing,subtitleLetterSpacing:0,descriptionLetterSpacing:0,titleColor:'#203a36',subtitleColor:'#5f726d',descriptionColor:'#4f605b'});
 }else{
  Object.assign(obj,{headingAlign:t.align,headingWeight:t.weight,headingSize:t.size,headingEffect:t.effect,headingLetterSpacing:t.spacing,headingColor:'#203a36'});
  if(scope!=='updates')Object.assign(obj,{subtitleAlign:t.align,subtitleWeight:t.subWeight,subtitleSize:t.subSize,subtitleEffect:'none',subtitleLetterSpacing:0,subtitleColor:'#657a70'});
  if(scope==='donors')obj.titleSize=t.size;
 }
 obj.typographyPreset=id;
}
let hamAdvancedOpen=false;
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-hsd-layout],[data-hsd-palette],[data-hsd-position]');
 if(!el||campaignState.current.management?.campaignKind!=='simple')return;
 e.preventDefault();snapshot();campaignState.current.management.simpleDonation||={};
 const v=campaignState.current.management.simpleDonation;
 if(el.dataset.hsdLayout){v.layoutMode=el.dataset.hsdLayout;if(v.layoutMode!=='center')v.showHeroImage=true;}
 if(el.dataset.hsdPosition){v.identityPosition=el.dataset.hsdPosition;}
 if(el.dataset.hsdPalette){
   const p={green:['#ffffff','#ffffff','#f0faf4','#17784f','#11613f','#17784f'],blue:['#f4f8fc','#ffffff','#eaf3fc','#2879bb','#1c679e','#236fa7'],warm:['#fcf7f0','#ffffff','#fff0df','#ad784c','#95613b','#a56b42'],purple:['#f8f5fc','#ffffff','#f2eafd','#7860ad','#604a9c','#7760ad']}[el.dataset.hsdPalette];
   if(p)Object.assign(v,{pageColor:p[0],cardColor:p[1],amountSelectedColor:p[2],continueButtonColor:p[3],buttonHoverColor:p[4],stepsActiveColor:p[5],amountSelectedBorderColor:p[5],buttonBorderColor:p[3],avatarColor:p[5]});
 }
 persist();renderPreview();renderInspector();
});
document.addEventListener('input',e=>{
 const el=e.target;if(!el.matches('[data-hsd-key]')||campaignState.current.management?.campaignKind!=='simple')return;
 if(!inspector.has(el,'hsdStarted')){snapshot();inspector.flag(el,'hsdStarted');}
 campaignState.current.management.simpleDonation||={};
 campaignState.current.management.simpleDonation[el.dataset.hsdKey]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
 persist();renderPreview();
 const note=el.parentElement?.querySelector('small');if(note&&el.type==='range')inspector.text(note,el.value+' px');
});
document.addEventListener('change',e=>{
 const el=e.target;if(!el.matches('[data-hsd-key]')||campaignState.current.management?.campaignKind!=='simple')return;
 if(!inspector.has(el,'hsdStarted')){snapshot();campaignState.current.management.simpleDonation||={};campaignState.current.management.simpleDonation[el.dataset.hsdKey]=el.type==='checkbox'?el.checked:el.value;persist();renderPreview();}
 renderInspector();
});
// Shared card-style library. The only registered consumer is fundraising statistics;
// other campaign components retain their existing independent styling.
const hamCardDesignLibrary=Object.freeze({
  // Two BASE layouts. Glass and bold are independently combinable modifiers.
  presets:Object.freeze({
    classic:{label:'קלאסי',symbol:'▤',bg:'#ffffff',text:'#223e35',border:'#d9e5df',accent:'#246f65',opacity:100,glass:false,shadow:true,borderEnabled:false,meter:'horizontal',radius:20},
    dashboard:{label:'לוח מחוונים',symbol:'◉',bg:'#ffffff',text:'#223e35',border:'#d9e5df',accent:'#246f65',opacity:100,glass:false,shadow:true,borderEnabled:false,meter:'circular',radius:22},
    icons:{label:'מדדים עם אייקונים',symbol:'◈',bg:'#ffffff',text:'#223e35',border:'#d9e5df',accent:'#246f65',opacity:100,glass:false,shadow:true,borderEnabled:false,meter:'horizontal',radius:17},
    text:{label:'טקסט בלבד',symbol:'≡',bg:'#ffffff',text:'#223e35',border:'#d9e5df',accent:'#246f65',opacity:100,glass:false,shadow:false,borderEnabled:false,meter:'horizontal',radius:14}
  }),
  shapes:Object.freeze([['square','כרטיס','▣']]),
  meters:Object.freeze([['horizontal','פס אופקי'],['circular','טבעת']]),
  applyPreset(cfg,id,primary){
    const preset=this.presets[id]||this.presets.classic;
    const {shape,enabled,sidebarStyled,textTiles,bg,text,border,accent,opacity,glass,shadow,borderEnabled,borderWidth,radius,meter,bold}=cfg;
    Object.assign(cfg,preset,{preset:id});
    // Preserve individually customized appearance when changing the content layout.
    Object.assign(cfg,{shape,enabled,sidebarStyled,textTiles,bg:bg||preset.bg,text:text||preset.text,border:border||preset.border,accent:accent||primary||preset.accent,
      opacity:opacity??preset.opacity,glass:glass??preset.glass,shadow:shadow??preset.shadow,
      borderEnabled:borderEnabled??preset.borderEnabled,borderWidth:borderWidth??1,radius:radius??preset.radius,
      meter:preset.meter,bold:!!bold});
  },
  markup(cfg,primary){
    const base=['classic','dashboard','text','icons'].includes(cfg.preset)?cfg.preset:'classic';
    const shape=this.shapes.some(x=>x[0]===cfg.shape)?cfg.shape:'square';
    const meter=this.meters.some(x=>x[0]===cfg.meter)?cfg.meter:(base==='dashboard'?'circular':'horizontal');
    const hex=(key,def)=>/^#[0-9a-fA-F]{6}$/.test(String(cfg[key]||''))?cfg[key]:def;
    const color=(key,title,def)=>`<label class="ham-cdl-color">${title}<input type="color" data-hsc-setting="${key}" value="${hex(key,def)}"></label>`;
    const slider=(key,title,min,max,def)=>`<label class="ham-cdl-range"><span>${title} <output>${cfg[key]??def}</output></span><input type="range" min="${min}" max="${max}" data-hsc-setting="${key}" value="${cfg[key]??def}"></label>`;
    const toggle=(key,title,checked)=>`<label class="ham-cdl-toggle">${title}<input type="checkbox" data-hsc-setting="${key}" ${checked?'checked':''}></label>`;
    return `<section class="ham-cdl-panel ham-cdl-v251" aria-label="עיצוב נתוני גיוס">
      <div class="ham-cdl-head"><h3>עיצוב נתוני הגיוס</h3><small>מתאים ל־Hero ולסיידבר · דסקטופ</small></div>
      <div class="ham-cdl-heading">בסיס העיצוב</div>
      <div class="ham-cdl-presets">${Object.entries(this.presets).map(([id,p])=>`<button type="button" data-hsc-preset="${id}" class="${base===id?'is-active':''}" aria-pressed="${base===id}"><span class="ham-cdl-preset-icon">${p.symbol}</span><span>${p.label}</span></button>`).join('')}</div>
      <div class="ham-cdl-heading">מיקום</div><div class="ham-cdl-location"><button type="button" data-hsc-location="sidebar" class="${!cfg.enabled?'is-active':''}">בסיידבר</button><button type="button" data-hsc-location="hero" class="${cfg.enabled?'is-active':''}">על ה־Hero</button></div>${['classic','dashboard'].includes(base)?`<div class="ham-cdl-heading">מד התקדמות</div><div class="ham-cdl-meters">${this.meters.map(([id,label])=>`<button type="button" data-hsc-meter="${id}" class="${meter===id?'is-active':''}" aria-pressed="${meter===id}">${label}</button>`).join('')}</div>`:''}
      
      <div class="ham-cdl-heading">אפקטים</div>
      <div class="ham-cdl-switches">${['classic','dashboard'].includes(base)?toggle('bold','סכום בולט (Bold)',cfg.bold===true):''}${toggle('glass','זכוכית שקופה',cfg.glass===true)}</div>
      <div class="ham-cdl-subhead"><strong>עיצוב מהיר</strong><button type="button" data-hsc-reset>איפוס עיצוב</button></div>
      ${slider('opacity','אטימות (%)',20,100,100)}
      <div class="ham-cdl-colors">${color('bg','רקע','#ffffff')}${color('accent','צבע הדגשה',primary||'#246f65')}</div>
      ${['classic','dashboard'].includes(base)?`<div class="ham-cdl-heading">צבעי האריחים</div><div class="ham-cdl-colors">${color('tileBg','רקע אריחים','#eaf4f0')}${color('tileText','טקסט באריחים','#223e35')}</div>`:''}
      <div class="ham-cdl-heading">פלטות צבע לכרטיס</div>
      <div class="ham-cdl-palettes" role="group" aria-label="פלטות צבע מוכנות">${[['mint','מנטה','#ffffff','#167363','#e8f5f0','#203d34','#223e35'],['ocean','אוקיינוס','#eaf5f8','#176d86','#d4eaf0','#174658','#174658'],['sand','חול','#fffaf0','#a46b32','#f7ead8','#604126','#604126'],['lavender','לבנדר','#faf6ff','#7653a1','#eee4f7','#47335f','#47335f'],['night','לילה','#173b3c','#82dbbe','#275657','#ffffff','#f4fff9'],['pearl','פנינה','#ffffff','#246f65','#f2f5f4','#213d35','#213d35'],['gold','זהב','#392b19','#e9bc67','#654b2b','#fff8e9','#fff5d9'],['champagne','שמפניה','#fff6e5','#b47c37','#f4e2bf','#604422','#5c3f24'],['navy','נייבי','#14283f','#8ac7e7','#253f57','#f4f9ff','#f1f7ff'],['royal','כחול מלכותי','#182d68','#92bdff','#2d4884','#ffffff','#f0f6ff'],['ice','כחול קרח','#eef8fc','#277eae','#d6eefa','#204c62','#204c62'],['midnight','חצות וזהב','#111c31','#eac476','#263653','#fff1cf','#fff6e7'],['emerald','אמרלד','#123c36','#89d5b4','#23584a','#f2fff9','#e8fff4'],['rose','רוז גולד','#fff3f1','#b87372','#f8dfdd','#623f47','#623f47'],['plum','שזיף','#332341','#d4a4ef','#513b61','#fff4ff','#f8e9ff']].map(([id,name,bg,accent,tileBg,tileText,textColor])=>`<button type="button" data-hsc-palette="${id}" data-bg="${bg}" data-accent="${accent}" data-tile-bg="${tileBg}" data-tile-text="${tileText}" data-text-color="${textColor}" title="${name}" aria-label="פלטת ${name}"><i style="background:${bg}"></i><i style="background:${accent}"></i><i style="background:${tileBg}"></i><span>${name}</span></button>`).join('')}</div>
      ${slider('radius','פינות מעוגלות',0,42,20)}
      <div class="ham-cdl-switches">${toggle('borderEnabled','מסגרת',cfg.borderEnabled===true)}${toggle('shadow','צל',cfg.shadow!==false)}</div>
      <details class="ham-cdl-more"><summary>אפשרויות נוספות <small>צבע טקסט ומסגרת</small></summary><div class="ham-cdl-more-body"><div class="ham-cdl-colors">${color('text','צבע טקסט','#223e35')}${color('border','צבע מסגרת','#d9e5df')}</div>${slider('borderWidth','עובי מסגרת',0,5,1)}</div></details>
      <p class="ham-cdl-note">אותם עיצובים זמינים גם בסיידבר וגם על ה־Hero. סגנון מדדים עם אייקונים מציג גם תאריך סיום או, כשאין תאריך מוגדר, ימים שנותרו.</p>
    </section>`;
  }
});
// Preserve the user's disclosure choices across preview/inspector rebuilds.
// The map is UI-only: no persisted campaign-schema change is needed.
// Shared progressive-disclosure layout for every standard design inspector.
// All original settings remain in the DOM and keep their original data-field bindings.
// Wide design workspace: the ORIGINAL #fields node is moved, never cloned.
// This preserves delegated events, data bindings, current draft, and undo/redo.
let hamWidePanel:HTMLElement|null=null;
let hamWideHost:HTMLElement|null=null;
let hamWideLauncher:HTMLElement|null=null;
let hamWideCategory='all';
let hamWideLastFocus:HTMLElement|null=null;
let hamWideObserver:MutationObserver|null=null;
const hamWideCategoryNames:{[key:string]:string}={all:'כל האפשרויות',layout:'פריסה ומיקום',look:'מראה',color:'צבעים',type:'טקסט',advanced:'מתקדם',content:'מידע ופעולות'};
function hamWideClassify(label:string,fieldKey=''){
 const s=(label+' '+fieldKey).toLowerCase();
 if(/צבע|רקע|גוון|palette|color|background|accent|bordercolor|bg\b|gradient|גוונים/.test(s))return 'color';
 if(/טיפוגרפ|פונט|גופן|כותרת|טקסט|אותיות|גודל כתב|font|heading|subtitle|textsize|lineheight|letterspacing/.test(s))return 'type';
 if(/פריסה|מיקום|תצוגה|סידור|עמודות|שורות|קרוסל|גריד|ניווט|layout|placement|position|columns|display|viewmode|align/.test(s))return 'layout';
 if(/עיגול|מסגרת|פינות|ריווח|מרווח|צל|אפקט|רדיוס|קוטר|תמונה|סגנון|עיצוב|shape|radius|shadow|gap|size|style|image|width|height/.test(s))return 'look';
 return 'advanced';
}
function hamWideFieldCategory(node:Element){
 const labels=[...node.querySelectorAll('label')].map(x=>x.textContent||'').join(' ');
 const keys=[...node.querySelectorAll('[data-field],[data-db-key],[data-ham-card-slider]')].map(x=>{
  const e=x as HTMLElement;return [e.dataset['field'],e.dataset['dbKey'],e.dataset['hamCardSlider']].join(' ');
 }).join(' ');
 return hamWideClassify(labels,keys);
}
function hamWideRefresh(){
 if(!hamWidePanel||!hamWidePanel.isConnected)return;
 const root=document.getElementById('fields');if(!root)return;
 // The selected category is already the disclosure: never require a second
 // click on a nested 'Advanced' accordion.
 hamWidePanel.setAttribute('data-ham-wide-active-category',hamWideCategory);
 // Advanced is a direct workspace category: hide quick-start and redundant
 // section chrome, not only the nested Advanced summary.
 root.querySelectorAll<HTMLElement>('.ham-unified-preset-header,.ham-unified-presets,.ham-easy-design').forEach(el=>{
  if(hamWideCategory==='advanced')el.style.setProperty('display','none','important');
  else el.style.removeProperty('display');
 });
 const appearanceSummary=root.querySelector<HTMLElement>('.ham-unified-appearance > summary');
 if(appearanceSummary){if(hamWideCategory==='advanced')appearanceSummary.style.setProperty('display','none','important');else appearanceSummary.style.removeProperty('display');}
 // No nested Advanced panel when the user has already selected Advanced.
 root.querySelectorAll<HTMLDetailsElement>('.ham-easy-advanced').forEach(group=>{
  const flatten=true;
  group.classList.toggle('ham-wide-flatten-advanced',flatten);
  if(flatten)group.open=true;
  // Apply directly rather than relying on cascade order between legacy styles.
  // CSS owns disclosure flattening; avoid inline !important overriding category visibility.
  group.style.removeProperty('display');
  const summary=group.querySelector<HTMLElement>(':scope > summary');
  if(summary)summary.style.setProperty('display',flatten?'none':'',flatten?'important':'');
  const body=group.querySelector<HTMLElement>(':scope > .ham-easy-advanced-body');
  if(body)body.style.setProperty('display',flatten?'contents':'',flatten?'important':'');
 });
 const title=hamWidePanel.querySelector('[data-ham-wide-title]');
 if(title)title.textContent=document.getElementById('inspectorTitle')?.textContent||'עריכת הרכיב';
 const tabs=hamWidePanel.querySelector('[data-ham-wide-categories]');
 tabs?.querySelectorAll<HTMLButtonElement>('[data-wide-category]').forEach(button=>{
  const active=button.dataset['wideCategory']===hamWideCategory;
  button.setAttribute('aria-selected',String(active));button.classList.toggle('is-active',active);
  button.tabIndex=active?0:-1;
 });
 // Rewards placement is a first-class decision, not an advanced/hidden field.
 // Move the ORIGINAL control rather than cloning controls or creating new state.
 if(selected==='rewards'){
  const placement=root.querySelector<HTMLElement>('.ham-reward-placement');
  if(placement&&placement.parentElement!==root){
   const intro=root.querySelector('.ham-unified-intro');
   if(intro)intro.insertAdjacentElement('afterend',placement);
   else root.prepend(placement);
  }
 }
 const contentOnly=hamWideCategory==='content';
 const all=hamWideCategory==='all';
 const appearance=root.querySelector<HTMLElement>('.ham-unified-appearance');
 const content=root.querySelector<HTMLElement>('.ham-unified-content');
 if(appearance){appearance.classList.toggle('ham-wide-hidden',contentOnly);if(!contentOnly)appearance.open=true;}
 if(content){content.classList.toggle('ham-wide-hidden',!all&&!contentOnly);if(all||contentOnly)content.open=true;}
 const placement=root.querySelector<HTMLElement>('.ham-reward-placement');
 if(placement)placement.classList.toggle('ham-wide-hidden',!all&&hamWideCategory!=='layout');
 const intro=root.querySelector<HTMLElement>('.ham-unified-intro');
 if(intro)intro.classList.toggle('ham-wide-hidden',!all);
 const fields=[...root.querySelectorAll<HTMLElement>('.field')];
 fields.forEach(field=>{
  const inContent=!!field.closest('.ham-unified-content');
  const advancedField=!!field.closest('.ham-easy-advanced,.ham-simple-more,.ham-inspector-advanced');
  const visible=all||(hamWideCategory==='advanced'&&!inContent&&advancedField)||(contentOnly?inContent:!inContent&&!advancedField&&hamWideFieldCategory(field)===hamWideCategory);
  field.classList.toggle('ham-wide-hidden',!visible);
 });
 // Expand groups with matching fields, while preserving the user's other options.
 [...root.querySelectorAll<HTMLDetailsElement>('details')].reverse().forEach(group=>{
  if(group===appearance||group===content)return;
  const contained=[...group.querySelectorAll<HTMLElement>('.field')];
  if(!contained.length)return;
  const matches=contained.some(field=>!field.classList.contains('ham-wide-hidden'));
  group.classList.toggle('ham-wide-hidden',!all&&!matches);
  if(matches&&!all)group.open=true;
  if(hamWideCategory==='advanced' && group.matches('.ham-easy-advanced,.ham-simple-more,.ham-inspector-advanced')){group.classList.remove('ham-wide-hidden');group.open=true;}
 });
 [...root.children].forEach(child=>{
  const el=child as HTMLElement;
  if(el===appearance||el===content||el===placement||el===intro)return;
  const contained=[...el.querySelectorAll<HTMLElement>('.field')];
  if(contained.length){el.classList.toggle('ham-wide-hidden',!all&&!contained.some(n=>!n.classList.contains('ham-wide-hidden')));return;}
  const label=(el.querySelector('h3,strong,summary,label')?.textContent||el.textContent||'').slice(0,130);
  const group=hamWideClassify(label,el.className||'');
  el.classList.toggle('ham-wide-hidden',!all&&(contentOnly?group!=='content':group!==hamWideCategory));
 });
 const empty=hamWidePanel.querySelector<HTMLElement>('[data-ham-wide-empty]');
 if(empty)empty.hidden=!![...root.children].find(el=>!el.classList.contains('ham-wide-hidden')&&el!==intro);
}
function hamWideClose(){
 if(!hamWidePanel||!hamWidePanel.isConnected)return;
 hamWideObserver?.disconnect();hamWideObserver=null;
 const fields=document.getElementById('fields');
 if(fields&&hamWideHost){
  const placement=fields.querySelector('.ham-reward-placement');
  const appearanceBody=fields.querySelector('.ham-unified-appearance > .ham-unified-section-body');
  if(placement&&appearanceBody)appearanceBody.prepend(placement);
  hamWideHost.appendChild(fields);
 }
 fields?.querySelectorAll('.ham-wide-hidden').forEach(e=>e.classList.remove('ham-wide-hidden'));
 hamWidePanel.remove();hamWidePanel=null;
 document.body.classList.remove('ham-wide-open');
 hamWideCategory='all';hamWideLastFocus?.focus();hamWideLastFocus=null;
}
function hamWideOpen(){
 if(hamWidePanel?.isConnected)return;
 const fields=document.getElementById('fields');if(!fields||!fields.isConnected)return;
 hamHoverRemove();
 hamWideHost=fields.parentElement;
 hamWideLastFocus=document.activeElement as HTMLElement|null;
 const overlay=document.createElement('div');overlay.className='ham-wide-backdrop';
 overlay.innerHTML=`<section class="ham-wide-panel inspector" role="dialog" aria-modal="true" aria-labelledby="hamWideTitle" dir="rtl">
 <header class="ham-wide-head"><div><span class="ham-wide-eyebrow">HAMONYM · חלון עריכה גדול</span><h2 id="hamWideTitle" data-ham-wide-title>עריכת רכיב</h2><p>כל האפשרויות באותו מקום, מסודרות לפי נושאים. השינויים מופיעים מיד בקמפיין.</p></div><button type="button" class="ham-wide-close" data-ham-wide-close aria-label="סגירת חלון העיצוב">✕ <span>חזרה לפאנל</span></button></header>
 <div class="ham-wide-workspace"><nav class="ham-wide-categories" role="tablist" aria-orientation="horizontal" aria-label="קטגוריות עריכה" data-ham-wide-categories>${Object.entries(hamWideCategoryNames).map(([key,label])=>`<button type="button" role="tab" data-wide-category="${key}" aria-selected="${key==='all'}">${label}</button>`).join('')}</nav>
 <div class="ham-wide-main"><div class="ham-wide-body" data-ham-wide-body></div><div class="ham-wide-empty" hidden data-ham-wide-empty>אין אפשרויות בקטגוריה הזאת לרכיב שנבחר. אפשר לעבור ל״כל האפשרויות״.</div></div></div>
 <footer class="ham-wide-foot"><span>✓ כל השינויים נשמרים באותו מסמך קמפיין</span><button type="button" data-ham-wide-close>סיום עריכה</button></footer></section>`;
 document.body.appendChild(overlay);hamWidePanel=overlay;
 overlay.querySelector('[data-ham-wide-body]')?.appendChild(fields);
 document.body.classList.add('ham-wide-open');
 overlay.addEventListener('click',e=>{
  const target=e.target as HTMLElement;
  if(target===overlay||target.closest('[data-ham-wide-close]')){hamWideClose();return;}
  const choice=target.closest('[data-wide-category]') as HTMLElement|null;
  if(choice){hamWideCategory=choice.dataset['wideCategory']||'all';hamWideRefresh();
   const body=overlay.querySelector('.ham-wide-body');if(body)body.scrollTop=0;
  }
 });
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hamWideClose()}});
 // Refresh only when the renderer replaces fields, not after class changes.
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'))queueMicrotask(()=>{if(overlay.isConnected)hamWideRefresh()});});
 observer.observe(fields,{childList:true});hamWideObserver=observer;
 // Observer is disposed from hamWideClose for all exit paths (button, ESC, backdrop).
 hamWideRefresh();(overlay.querySelector('.ham-wide-close') as HTMLElement)?.focus();
}
// Contextual direct editing: the existing preview section remains the source of
// selection, data and rendering. Only one transient pencil is ever mounted.
// Event delegation survives renderPreview replacing the preview's innerHTML.
let hamHoverPart:HTMLElement|null=null;
let hamHoverButton:HTMLButtonElement|null=null;
let hamHoverPreview:HTMLElement|null=null;
// The inspector may be replaced while select() redraws the preview. Open the
// large editor only once that redraw has settled, and never drop a first click.
let hamWideOpenRequest=0;
// Every large-editor entry point must activate Design mode first. The toolbar
// already did this, while contextual preview/tree buttons previously skipped it:
// Management mode kept the inspector hidden and the first click appeared inert.
function hamEnsureDesignMode():boolean{
 const workspace=document.querySelector<HTMLElement>('.workspace');
 if(!workspace)return false;
 if(!workspace.classList.contains('hu-management-mode'))return true;
 // The management engine owns the mode. Request its transition through the
 // explicit controller rather than simulating a click on a toolbar control.
 const request=new CustomEvent('hamonym:request-design-mode',{detail:{handled:false}});
 window.dispatchEvent(request);
 // A listener claiming the request is NOT enough: check the actual workspace.
 // This also prevents an editor overlay being built against a hidden inspector.
 if(!workspace.classList.contains('hu-management-mode'))return true;
 // Compatibility fallback for the standalone editor only.
 const control=document.querySelector<HTMLElement>('#huToolbar [data-hu-mode="design"]');
 if(control)control.click();
 return !workspace.classList.contains('hu-management-mode');
}
// The management controller completes mode transition and selection in one
// synchronous transaction. This is the same path for the tree and preview pencil.
// Do not rely on a previous toolbar click or a detached preview element.
/**
 * Open a component with a single controller transaction.  The management engine
 * owns the design/management workspace switch; the campaign engine owns the
 * inspector dialog.  Dispatching the request BEFORE touching the inspector is
 * essential after loading a demo (the initial workspace is Management).
 */
function hamOpenLargeEditorFor(id:string){
 if(!id||hamSimpleDesignLocked(id))return;
 const action=++hamWideOpenRequest;
 const request:{id:string,handled:boolean,error?:string}={id,handled:false};
 try{
  window.dispatchEvent(new CustomEvent('hamonym:open-component-editor',{detail:request}));
 }catch(error){
  console.error('[HAMONYM] Component editor controller failed',id,error);
 }
 // The management layer only changes mode. Core owns selection in every
 // entry path: otherwise a model render can replace #fields during first open.
 if(!request.handled)hamEnsureDesignMode();
 try{
  select(id);
 }catch(error){
  console.error('[HAMONYM] Core inspector selection failed',id,error);
  toast('לא ניתן לפתוח כרגע את עריכת הרכיב');
  return;
 }
 // Prepare the shared editor entry point as well as the component selection.
 // Loading a demo does not implicitly call hamWideSetup (the old toolbar did),
 // which made the first contextual action depend on a prior toolbar click.
 hamWideSetup();
 const mount=()=>{
  if(action!==hamWideOpenRequest)return true;
  if(document.querySelector('.workspace')?.classList.contains('hu-management-mode'))hamEnsureDesignMode();
  if(hamWidePanel?.isConnected){
   const active=document.getElementById('fields');
   if(active && hamWidePanel.contains(active)){hamWideRefresh();return true;}
   hamWideClose();
  }
  let fields=document.getElementById('fields');
  if(!fields?.isConnected){
   try{renderInspector();}catch(error){console.error('[HAMONYM] Inspector creation failed',error);}
   fields=document.getElementById('fields');
  }
  if(!fields?.isConnected)return false;
  try{hamWideOpen();}catch(error){console.error('[HAMONYM] Dialog mount error',id,error);return false;}
  return Boolean(hamWidePanel?.isConnected);
 };
 // Retry across short Angular re-renders rather than relying on the first
 // two frames. A later render must never silently discard the original click.
 let attempts=0;
 const retry=()=>{
  if(action!==hamWideOpenRequest)return;
  if(mount())return;
  if(++attempts<20){requestAnimationFrame(retry);return;}
  console.error('[HAMONYM] Editor cannot open', {id,controllerHandled:request.handled,workspace:document.querySelector('.workspace')?.className,fields:!!document.getElementById('fields')});
  toast('חלון העריכה לא נפתח. פרטים בקונסול.');
 };
 retry();
}

// The floating edit control is draggable. Keep its position per component across
// preview re-renders and never turn a drag gesture into an editor-opening click.
const hamFloatingOffsets=new Map<string,{x:number,y:number}>();
let hamFloatingDragActive=false;
function hamApplyFloatingOffset(button:HTMLElement,id:string){
 const offset=hamFloatingOffsets.get(id);
 if(!offset)return;
 button.style.setProperty('right','auto','important');
 button.style.setProperty('left',offset.x+'px','important');
 button.style.setProperty('top',offset.y+'px','important');
}
const hamHoverExcluded='button:not(.ham-preview-edit-launcher),a,input,textarea,select,[contenteditable="true"],[role="button"],[data-ham-panorama-tab],[data-ham-mobile-tab]';
// v4.53: the hovered block's class is the part's (PublicPartsService `setHover`); a render clears it, as a new
// page had no hovered block, and the block is then a new one for this code (`hamHoverRevision`).
let hamHoverRevision=-1;
var hamLastPointer:{x:number,y:number,type:string}|null=null;
var hamHoverAfterRender:(()=>void)|null=null;
function hamHoverRemove(){
 if(hamFloatingDragActive)return;
 hamHoverButton?.remove();
 hamHoverButton=null;
 if(hamHoverPart&&hamHoverRevision===parts.revision)parts.setHover(null);
 hamHoverPart=null;
}
function hamHoverShow(part:HTMLElement){
 if(hamFloatingDragActive)return;
 const id=part.dataset['part'];
 if(!id||hamWidePanel?.isConnected||hamSimpleDesignLocked(id)){hamHoverRemove();return;}
 if(hamHoverPart===part && hamHoverRevision===parts.revision && hamHoverButton?.isConnected)return;
 hamHoverRemove();
 hamHoverPart=part;
 hamHoverRevision=parts.revision;
 parts.setHover(id);
 // Every editor block, including sidebar rewards and race registration, uses
 // exactly the same action, ownership and delegated click handler.
 const name=sections.find(item=>item[0]===id)?.[1]||'הרכיב';
 const button=document.createElement('button');
 button.type='button';
 button.className='ham-preview-edit-launcher';
 button.dataset['hamPreviewEdit']=id;
 button.title=`עריכת ${name} בחלון גדול`;
 button.setAttribute('aria-label',`עריכת ${name} בחלון גדול`);
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>עריכה בחלון גדול</span>';
 // The launcher lives OUTSIDE the campaign's rendered DOM. A state update or
 // management-to-design transition may replace `part` before the click finishes.
 // Keeping the action in document.body prevents that replacement from eating it.
 document.body.appendChild(button);
 const rect=part.getBoundingClientRect();
 button.style.setProperty('position','fixed','important');
 button.style.setProperty('z-index','2147483000','important');
 button.style.setProperty('top',Math.max(8,rect.top+10)+'px','important');
 button.style.setProperty('left',Math.max(8,rect.left+10)+'px','important');
 button.style.setProperty('right','auto','important');
 button.style.setProperty('bottom','auto','important');
 hamHoverButton=button;
 // Use the same offsets, but position is viewport-relative for the stable portal.
 const offset=hamFloatingOffsets.get(id);
 if(offset){button.style.setProperty('left',offset.x+'px','important');button.style.setProperty('top',offset.y+'px','important');}
}
function hamPreviewContextualSetup(){
 const preview=document.getElementById('preview');
 if(!preview||preview===hamHoverPreview)return;
 if(hamHoverPreview)hamHoverRemove();
 hamHoverPreview=preview;
 // The preview is re-rendered repeatedly. Document-level delegation ensures
 // sidebar elements moved by Panorama and ordinary sections behave identically.
 // These listeners are installed once, not again on every inspector render.
 if(document.documentElement.dataset['hamContextualEditingReady']==='1')return;
 document.documentElement.dataset['hamContextualEditingReady']='1';
 const resolvePart=(target:EventTarget|null):HTMLElement|null=>{
  if(!(target instanceof Element))return null;
  const part=target.closest<HTMLElement>('#preview [data-part].editable');
  return part&&document.getElementById('preview')?.contains(part)?part:null;
 };
 let pending:{id:string,pointerId:number,x:number,y:number,button:HTMLButtonElement,part:HTMLElement,dragged:boolean,startX:number,startY:number}|null=null;
 let ignoredClickUntil=0;
 const open=(id:string)=>hamOpenLargeEditorFor(id);
 // v4.53: the page is updated in place. When it was written again, the browser saw a new block under a pointer that
 // did not move, and sent it a pointer event: the block under the pointer is hovered again after a render.
 document.addEventListener('pointermove',event=>{hamLastPointer={x:event.clientX,y:event.clientY,type:event.pointerType};},true);
 hamHoverAfterRender=()=>{
  const at=hamLastPointer;
  if(!at||at.type==='touch')return;
  requestAnimationFrame(()=>{
   if(hamWidePanel?.isConnected)return;
   const target=document.elementFromPoint(at.x,at.y);
   if(target instanceof Element && target.closest('[data-ham-preview-edit]'))return;
   const part=resolvePart(target);
   if(part)hamHoverShow(part);
  });
 };
 document.addEventListener('pointerover',event=>{
  if(event.pointerType==='touch'||hamWidePanel?.isConnected)return;
  if(event.target instanceof Element && event.target.closest('[data-ham-preview-edit]'))return;
  const part=resolvePart(event.target);
  if(part)hamHoverShow(part);
  // Keep the launcher available while moving the pointer between the preview
  // and the body-level editor action. A transient gap must not destroy it.
 },true);
 document.addEventListener('pointermove',event=>{
  if(pending&&pending.pointerId===event.pointerId){
   const dx=event.clientX-pending.x,dy=event.clientY-pending.y;
   if(!pending.dragged&&Math.hypot(dx,dy)<6)return;
   pending.dragged=true;hamFloatingDragActive=true;
   if(!pending.button.isConnected)return;
   const x=Math.min(Math.max(8,window.innerWidth-pending.button.offsetWidth-8),Math.max(8,pending.startX+dx));
   const y=Math.min(Math.max(8,window.innerHeight-pending.button.offsetHeight-8),Math.max(8,pending.startY+dy));
   hamFloatingOffsets.set(pending.id,{x,y});
   hamApplyFloatingOffset(pending.button,pending.id);
   pending.button.classList.add('ham-preview-edit-dragging');
   event.preventDefault();return;
  }
  if(event.pointerType==='touch'||hamWidePanel?.isConnected)return;
  if(event.target instanceof Element && event.target.closest('[data-ham-preview-edit]'))return;
  const part=resolvePart(event.target);
  if(part)hamHoverShow(part);
  // Keep the launcher available while moving the pointer between the preview
  // and the body-level editor action. A transient gap must not destroy it.
 },true);
 document.addEventListener('pointerout',event=>{
  if(event.pointerType==='touch'||!hamHoverPart||pending)return;
  if(!hamHoverPart.contains(event.target as Node))return;
  const next=event.relatedTarget;
  if(next instanceof Node&&hamHoverPart.contains(next))return;
  if(resolvePart(next)===hamHoverPart)return;
  if(next instanceof Element && next.closest('[data-ham-preview-edit]'))return;
  // Leaving the component is not an instruction to dismiss its editor action.
  // It is replaced when hovering a different component or on opening the dialog.
 },true);
 document.addEventListener('pointerdown',event=>{
  const target=event.target;
  const button=target instanceof Element?target.closest<HTMLButtonElement>('[data-ham-preview-edit]'):null;
  if(button){
   const id=button.dataset['hamPreviewEdit'];
   const part=hamHoverPart;
   // A detached/re-rendered preview section must never invalidate its own button.
   if(!id)return;
   event.preventDefault();event.stopImmediatePropagation();
   // Activate on the first pointer press. Waiting for pointerup/click was
   // unreliable after demo loading because the preview and workspace re-render.
   // Opening is the primary action; dragging this control is no longer required.
   open(id);
   ignoredClickUntil=performance.now()+450;
   return;
  }
  if(event.pointerType==='touch'){
   const part=resolvePart(target);
   if(part&&!(target instanceof Element&&target.closest('button,a,input,textarea,select,[role="button"]')))hamHoverShow(part);
  }
 },true);
 document.addEventListener('pointerup',event=>{
  if(!pending||pending.pointerId!==event.pointerId)return;
  const action=pending;pending=null;
  hamFloatingDragActive=false;
  action.button.classList.remove('ham-preview-edit-dragging');
  if(action.dragged){
   // A drag must never activate the button via the subsequent click.
   ignoredClickUntil=performance.now()+450;
   event.preventDefault();event.stopImmediatePropagation();
  }
  if(!action.dragged){
   // The preview is reconstructed when Management switches to Design. The
   // browser may then dispatch click on the former ancestor instead of this
   // detached launcher. Capture the target at pointerup and activate once.
   ignoredClickUntil=performance.now()+450;
   event.preventDefault();event.stopImmediatePropagation();
   open(action.id);
  }
 },true);
 document.addEventListener('pointercancel',event=>{
  if(pending?.pointerId===event.pointerId){pending.button.classList.remove('ham-preview-edit-dragging');pending=null;hamFloatingDragActive=false;}
 },true);
 document.addEventListener('click',event=>{
  const target=event.target;
  const button=target instanceof Element?target.closest<HTMLButtonElement>('[data-ham-preview-edit]'):null;
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(pending||performance.now()<ignoredClickUntil)return;
  const id=button.dataset['hamPreviewEdit'];
  if(id)open(id); // Keyboard, assistive technology and synthetic click.
 },true);
 document.addEventListener('focusin',event=>{
  const part=resolvePart(event.target);
  if(part)hamHoverShow(part);
 },true);
}
function hamWideSetup(){
 hamPreviewContextualSetup();
 // The studio opens from a contextual action on each component in the right-hand tree.
 // The regular left inspector remains available without extra launch controls.
 hamAttachTreeStudioActions();
}
// A compatibility entry point for older integrations, including when the user is
// currently in Management or Publish mode. This does not duplicate form state.
window.addEventListener('hamonym:open-design-studio', () => {
  hamEnsureDesignMode();
  hamWideSetup();
  if(document.getElementById('fields')) hamWideOpen();
});
// v4.54: the pane (`hamRenderInspectorPane`) and the field markup (`fieldHtml`, `hamFriendlyDesignFields`, the
// specialized panels' markup) are inspector/inspector-model.ts, rendered by InspectorComponent (inspector/).
function hamInspectorEnv(){
 // A copy: the view shows the campaign as it was at this render (a handler's later change shows at the next one).
 return {state:structuredClone(campaignState.current),selected,device,cardSizeDevice:hamCardSizeDevice,dbEditScope,advancedOpen:hamAdvancedOpen,
  categorySearch,categoryIconPickerOpen,palettes,navTargets,carouselModules:hamCarouselModules,cardSizeDefaults:hamCardSizeDefaults,
  cardSizeFor:(scope,dev)=>hamCardSizeFor(scope,dev),presentationFor:(scope,dev)=>hamPresentationFor(scope,dev),dbStyleForDevice:d=>dbStyleForDevice(d),
  simpleVisual:()=>hamSimpleVisualSettings(),categoryByLabel:label=>categoryByLabel(label),catalog:campaignCategoryCatalog,categoryIconName:c=>categoryIconName(c),
  mediaSrc:ref=>window.hamonymMediaFix?.src?.(ref)||'',extras:()=>window.hamInspectorExtras?.()||[]};
}
// v4.1: unified component editing, using the EXISTING original controls for both
// areas. A single editor surface replaces the artificial content/design tabs.
// The former rendering paths remain intact, so imports, media, visibility,
// story blocks, layout choices and domain-specific actions are not discarded.
const hamUnifiedPresets:{[key:string]:{label:string;description:string;primary:string;background:string;surface:string;text:string}}={
 classic:{label:'קלאסי',description:'נקי ומאוזן',primary:'#246f65',background:'#ffffff',surface:'#f8fbf9',text:'#203a36'},
 warm:{label:'חמים',description:'רך ומזמין',primary:'#b37a45',background:'#fffaf5',surface:'#fff3e6',text:'#5c4331'},
 civic:{label:'קהילתי',description:'ברור ובטוח',primary:'#285b87',background:'#f9fbff',surface:'#edf4fa',text:'#213f59'},
 elegant:{label:'אלגנטי',description:'עדין ומרווח',primary:'#785c85',background:'#ffffff',surface:'#f7f4f9',text:'#433a4b'}
};
function hamUnifiedApplyPreset(id:string){
 const p=hamUnifiedPresets[id];if(!p)return;
 const target=selected==='theme'?campaignState.current.theme:selected==='donationBox'?campaignState.current.content.donate:campaignState.current.content[selected];if(!target)return;
 // Only adjust keys already present on this component. Never overwrite content,
 // device visibility, placement, sizes, media, payment or campaign data.
 const keyColors:{[k:string]:string}={bg:p.background,cardBg:p.background,background:p.background,logoBg:p.background,
  surface:p.surface,textColor:p.text,titleColor:p.text,headingColor:p.text,nameColor:p.text,
  accentColor:p.primary,primary:p.primary,color:p.primary,buttonBg:p.primary,rewardButtonBg:p.primary,
  borderColor:p.surface,border:p.surface,subtitleColor:p.text,descriptionColor:p.text,
  boxCardBg:p.background,boxCardBorder:p.surface,boxBg:p.background,boxText:p.text,boxAccent:p.primary,ink:p.text};
 change(()=>{for(const [key,value] of Object.entries(keyColors)){if(Object.prototype.hasOwnProperty.call(target,key))target[key]=value;}});
}
// v4.54: the inspector is built as a view (inspector-model.ts `buildInspector`) and rendered in place by
// InspectorService; the disclosure memory and the reset of what a new #fields started without are there.
function renderInspector(){
 hamWideSetup();
 const templateButton=document.getElementById('templatesBtn');
 if(templateButton)templateButton.style.display=campaignState.current.management?.campaignKind==='simple'?'none':'';
 inspector.remember();
 const view=buildInspector(hamInspectorEnv());
 tab='design';
 inspector.render(view);
 if(hamWidePanel?.isConnected)queueMicrotask(hamWideRefresh);
}
// Reuse the active device preview buttons; there is one device state, not a
// second disconnected mobile/desktop design model.
document.addEventListener('click',(event)=>{
 const target=event.target as HTMLElement;
 const preset=target.closest('[data-ham-unified-preset]') as HTMLElement|null;
 if(preset){event.preventDefault();hamUnifiedApplyPreset(preset.dataset['hamUnifiedPreset']||'');return;}
 const dev=target.closest('[data-ham-unified-device]') as HTMLElement|null;
 if(dev){event.preventDefault();const value=dev.dataset['hamUnifiedDevice'];
  const button=document.querySelector(`.device-switch [data-device="${value}"]`) as HTMLElement|null;
  if(button){button.click();}else if(value==='desktop'||value==='mobile'){
   device=value;hamCardSizeDevice=value;renderSections();renderPreview();renderInspector();
  }
 }
});

// Angular owns render ordering; original render implementations remain available during the bridge phase.
window.hamAngularCampaignRuntime?.register({renderSections:()=>renderSections(),renderPreview:()=>renderPreview(),renderInspector:()=>renderInspector(),title:()=>campaignState.current.content.hero.title});
function render(){if(window.hamAngularCampaignRuntime){window.hamAngularCampaignRuntime.render();updateUndo();return;}renderSections();renderPreview();renderInspector();updateUndo();const titleNode=$('#projectTitle');if(titleNode)titleNode.textContent=campaignState.current.content.hero.title}

// Hero-card appearance is managed independently, using the existing draft persistence.
document.addEventListener('click',event=>{
 const shape=event.target.closest('[data-hsc-shape]');
 const preset=event.target.closest('[data-hsc-preset]');
 const meter=event.target.closest('[data-hsc-meter]');
 const reset=event.target.closest('[data-hsc-reset]');
 const palette=event.target.closest('[data-hsc-palette]');
 const location=event.target.closest('[data-hsc-location]');
 if(!shape&&!preset&&!meter&&!reset&&!palette&&!location)return;
 event.preventDefault();event.stopImmediatePropagation();
 campaignState.current.management ||= {};const cfg=campaignState.current.management.heroStatsCard ||= {};
 snapshot();
 if(shape){cfg.shape=shape.dataset.hscShape;if(shape.closest('.ham-layout-shape-submenu'))cfg.enabled=true;}
 if(location){cfg.enabled=location.dataset.hscLocation==='hero';cfg.sidebarStyled=!cfg.enabled;}
 if(preset){hamCardDesignLibrary.applyPreset(cfg,preset.dataset.hscPreset,campaignState.current.theme.primary);if(!cfg.enabled)cfg.sidebarStyled=true;}
 if(meter)cfg.meter=meter.dataset.hscMeter;
 if(palette){cfg.bg=palette.dataset.bg;cfg.accent=palette.dataset.accent;cfg.tileBg=palette.dataset.tileBg;cfg.tileText=palette.dataset.tileText;cfg.text=palette.dataset.textColor||cfg.text;}
 if(reset){const enabled=cfg.enabled,sidebarStyled=cfg.sidebarStyled,shapeBefore=cfg.shape;Object.assign(cfg,{...hamCardDesignLibrary.presets.classic,preset:'classic',enabled,sidebarStyled,shape:shapeBefore||'square',bold:false,glass:false});}
 persist();renderPreview();renderInspector();document.querySelectorAll('.ham-layout-shape-submenu [data-hsc-shape]').forEach(b=>{const active=b.dataset.hscShape===cfg.shape;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
},true);
for(const kind of ['input','change'])document.addEventListener(kind,event=>{
 const el=event.target.closest('[data-hsc-setting]');if(!el)return;
 event.stopImmediatePropagation();
 campaignState.current.management ||= {};const cfg=campaignState.current.management.heroStatsCard ||= {};
 cfg[el.dataset.hscSetting]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
 if(el.type==='range')inspector.text(el.parentElement.querySelector('output'),el.value);
 persist();renderPreview();
},true);

$('#preview').addEventListener('scroll',syncDonationCtas,{passive:true});
window.addEventListener('resize',syncDonationCtas,{passive:true});
// v4.46: the Hero's play button is handled by HeroPartComponent.
let mainDragId=null;
$('#sectionList').addEventListener('dragstart',e=>{
 const row=e.target.closest('.main-order-item.reorderable');
 if(!row||hamSimpleDesignLocked(row.dataset.orderId))return;
 mainDragId=row.dataset.orderId;
 e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',mainDragId);
 row.classList.add('dragging');
});
$('#sectionList').addEventListener('dragover',e=>{
 const row=e.target.closest('.main-order-item.reorderable');
 if(!row||!mainDragId||hamSimpleDesignLocked(row.dataset.orderId)||row.dataset.orderId===mainDragId)return;
 e.preventDefault();e.dataTransfer.dropEffect='move';
 $('#sectionList').querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
 row.classList.add('drop-target');
});
$('#sectionList').addEventListener('drop',e=>{
 const row=e.target.closest('.main-order-item.reorderable');
 if(row&&mainDragId&&!hamSimpleDesignLocked(row.dataset.orderId)){e.preventDefault();moveMainSection(mainDragId,row.dataset.orderId)}
 mainDragId=null;
});
$('#sectionList').addEventListener('dragend',()=>{
 mainDragId=null;
 $('#sectionList').querySelectorAll('.dragging,.drop-target').forEach(el=>el.classList.remove('dragging','drop-target'));
});
$('#sectionList').addEventListener('click',e=>{const studio=e.target.closest('[data-ham-tree-studio]');if(studio){e.preventDefault();e.stopPropagation();const id=studio.dataset.hamTreeStudio;if(!id||hamSimpleDesignLocked(id))return;hamOpenLargeEditorFor(id);return;}const move=e.target.closest('[data-main-move]');if(move){e.stopPropagation();if(hamSimpleDesignLocked(move.dataset.mainId))return;const order=orderFor(),id=move.dataset.mainId,idx=order.indexOf(id),to=idx+(move.dataset.mainMove==='up'?-1:1);if(to>=0&&to<order.length)moveMainSection(id,order[to]);return;}const vis=e.target.closest('[data-visibility]');if(vis){e.stopPropagation();const id=vis.dataset.visibility;if(hamSimpleDesignLocked(id))return;change(()=>{if(id==='donationBox')campaignState.current.content.donate.boxEnabled=!campaignState.current.content.donate.boxEnabled;else campaignState.current.visible[id]=!campaignState.current.visible[id]});return}const row=e.target.closest('[data-select]');if(row&&!hamSimpleDesignLocked(row.dataset.select))select(row.dataset.select)});
// v4.45: the donors and content toolbars are handled by their blocks (public-page/collections).
$('#preview').addEventListener('click',e=>{if(e.target.closest('.ambassador-profile-link'))e.stopPropagation();});

// v0.1.40 – details on the reward surface, never on its explicit selection CTA.
let hamRewardDialog=null;
window.hamCloseRewardDetails=()=>closeHamRewardDetails();
function closeHamRewardDetails(){
 if(!hamRewardDialog)return;
 const {element,previousFocus,previousOverflow,keyHandler}=hamRewardDialog;
 document.removeEventListener('keydown',keyHandler,true);
 element.remove();document.body.style.overflow=previousOverflow;
 hamRewardDialog=null;
 if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
}
function openHamRewardDetails(index,card){
 const item=campaignState.current.content.rewards?.items?.[index];if(!item)return;
 if(hamRewardDialog)closeHamRewardDetails();
 const cfg=campaignState.current.content.rewards||{};
 const visibleName=card?.querySelector('.reward-tile-copy>strong')?.textContent?.trim()||item.name||'תשורה';
 const visibleDescription=card?.querySelector('.reward-tile-copy>p')?.textContent?.trim()||item.description||'';
 const soldOut=!!item.stockEnabled&&Number(item.quantity||0)<=0;
 const photo=huRacePhotoSrc(item.image)
   ?`<img class="ham-reward-dialog-photo" src="${esc(huRacePhotoSrc(item.image))}" alt="${esc(item.name||'תמונת תשורה')}">`
   :`<div class="ham-reward-dialog-placeholder" aria-hidden="true">◇</div>`;
 const stock=item.stockEnabled?`<span class="ham-reward-dialog-stock">${soldOut?'התשורה אזלה מהמלאי':`נותרו ${Math.max(0,Number(item.quantity)||0)} יחידות`}</span>`:'';
 const featured=item.recommended?'<span class="ham-reward-dialog-featured">★ מומלץ</span>':'';
 const element=document.createElement('div');element.className='ham-reward-dialog-backdrop '+(device==='mobile'?'ham-detail-mobile':'ham-detail-desktop');element.id='hamRewardDetails';
 const detailExpanded=cfg.detailViewStyle==='expanded';
 element.innerHTML=`<section class="ham-reward-dialog ${detailExpanded?'ham-detail-expanded':'ham-detail-compact'}" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="hamRewardDialogTitle" style="--detail-accent:${esc(cfg.accentColor||campaignState.current.theme.primary||'#246f65')};--detail-button:${esc(cfg.rewardButtonBg||'#246f65')};--detail-button-ink:${esc(cfg.rewardButtonColor||'#ffffff')}">
  <button type="button" class="ham-reward-dialog-close" data-ham-detail-close aria-label="סגירת פרטי התשורה">×</button>
  <div class="ham-reward-dialog-media">${photo}</div>
  <div class="ham-reward-dialog-content">${featured}<small class="ham-reward-dialog-kicker">פרטי התשורה</small>
   <h2 id="hamRewardDialogTitle">${esc(visibleName)}</h2><strong class="ham-reward-dialog-amount">${money(item.amount||0)}</strong>
   ${visibleDescription?`<p class="ham-reward-dialog-description">${esc(visibleDescription)}</p>`:''}
   ${stock}<button type="button" class="ham-reward-dialog-cta" data-ham-detail-select data-ham-detail-index="${index}" ${soldOut?'disabled':''}>${soldOut?'אזל מהמלאי':'בחירת תשורה'}</button>
   <small class="ham-reward-dialog-note">התשלום יחובר בהמשך למנגנון התרומות של HAMONYM.</small>
  </div>
 </section>`;
 const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
 document.body.appendChild(element);document.body.style.overflow='hidden';
 const keyHandler=e=>{
  if(e.key==='Escape'){e.preventDefault();closeHamRewardDetails();return;}
  if(e.key!=='Tab')return;
  const focusable=[...element.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')];
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 };
 hamRewardDialog={element,previousFocus,previousOverflow,keyHandler};
 document.addEventListener('keydown',keyHandler,true);
 element.addEventListener('click',e=>{
  if(e.target===element||e.target.closest('[data-ham-detail-close]')){closeHamRewardDetails();return;}
  if(e.target.closest('[data-ham-detail-select]')){closeHamRewardDetails();toast('בחירת תשורה תחובר לסל התשלום המאוחד של HAMONYM');}
 });
 element.querySelector('[data-ham-detail-close]').focus();
}
const hamRewardPreview=document.getElementById('preview');
hamRewardPreview.addEventListener('click',e=>{
 const card=e.target.closest('[data-reward-details]');if(!card||!hamRewardPreview.contains(card))return;
 if(e.target.closest('button,a,input,select,textarea,[role="button"]'))return;
 e.preventDefault();e.stopPropagation();
 openHamRewardDetails(Number(card.dataset.rewardDetails),card);
},true);
hamRewardPreview.addEventListener('keydown',e=>{
 const card=e.target.closest('[data-reward-details]');
 if(card&&e.target===card&&(e.key==='Enter'||e.key===' ')){
  e.preventDefault();e.stopPropagation();openHamRewardDetails(Number(card.dataset.rewardDetails),card);
 }
},true);

// v4.46: the navigation's dropdown / "עוד" and the header's hamburger open in their components; here they are only kept from selecting the block.
$('#preview').addEventListener('click',e=>{if(e.target.closest('[data-nav-dropdown],[data-nav-more]'))return;const navLink=e.target.closest('[data-nav-target]');if(navLink){const target=navLink.dataset.navTarget;
 if(device==='desktop'&&campaignState.current.template==='panorama'&&['story','donors','ambassadors','comments','updates','sponsors'].includes(target)){
   const wrap=$('#preview .ham-panorama-tabs');const tabButton=wrap?.querySelector('[data-ham-panorama-tab="'+target+'"]');
   if(tabButton){hamPanoramaSelectTab(target,$('#preview'),true);return;}
 }
 if(device==='mobile'){activeNavSection=campaignState.current.content.nav.placement?.[target]==='menu'?target:null;renderPreview();}const section=$('#preview [data-part="'+target+'"]');if(section){section.scrollIntoView({behavior:'smooth',block:'start'});/* v4.53: the navigation renders the chosen link */if($('#preview .nav-component'))parts.nav?.choose(target,navLink.textContent)}return}if(e.target.closest('[data-menu-toggle]'))return;if(e.target.closest('[data-ambassador]')){toast('הצטרפות לשגרירים תחובר לתהליך הקיים ב־HAMONYM');return}if(e.target.closest('[data-menu-item]')){toast('ניווט לעמוד הקמפיין יחובר במימוש Angular');return}// v4.53: the donation box renders its choice and its "other amount" field (DonationBoxComponent).
if(e.target.closest('[data-donation-other]')){
 const box=DonationBoxComponent.of(e.target.closest('.donation-box'));
 if(box&&box.hasEntry){box.showEntry(true);e.target.closest('.donation-box').querySelector('.donation-custom-entry input')?.focus()}
 box?.choose('other');return;
}
if(e.target.closest('[data-donation-choice]')){
 const btn=e.target.closest('[data-donation-choice]'),box=DonationBoxComponent.of(btn.closest('.donation-box'));
 box?.choose(btn.dataset.donationChoice);box?.showEntry(false);return;
}
if(e.target.closest('[data-donation-continue]')){toast('המשך התרומה יחובר למנוע התרומות הקיים ב־HAMONYM');return}if(e.target.closest('[data-donate]')){toast('כפתור התרומה יחובר לתהליך התרומה הקיים ב־HAMONYM');return}if(e.target.closest('[data-share]')){/* v4.53: the share block renders its options (CampaignShareComponent) */const share=CampaignShareComponent.of($('#preview .share-options')?.closest('.campaign-share'));share?.toggle();return}if(e.target.closest('[data-copy]')){const link=shareData().url;const fallback=()=>{const input=document.createElement('textarea');input.value=link;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();try{document.execCommand('copy');toast('הקישור הועתק')}catch{toast('לא ניתן להעתיק קישור')}input.remove()};if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>toast('הקישור הועתק')).catch(fallback);else fallback();return}if(e.target.closest('[data-share-whatsapp]')){const link=shareData().url;window.open('https://wa.me/?text='+encodeURIComponent(shareData().text+'\n'+link),'_blank','noopener,noreferrer');return}if(e.target.closest('[data-share-facebook]')){window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareData().url),'_blank','noopener,noreferrer');return}if(e.target.closest('[data-share-telegram]')){const d=shareData();window.open('https://t.me/share/url?url='+encodeURIComponent(d.url)+'&text='+encodeURIComponent(d.text),'_blank','noopener,noreferrer');return}if(e.target.closest('[data-share-native]')){const link=shareData().url;if(navigator.share)navigator.share(shareData()).catch(()=>{});else toast('שיתוף מערכת אינו זמין בדפדפן זה');return}if(e.target.closest('[data-load],[data-donors-search],[data-hcc-search],.donors-sort-wrap,.hc-carousel-nav,.ambassador-profile-link,[data-ham-slide-nav],[data-ham-slide-dot],.ham-footer-news-form'))return;const el=e.target.closest('[data-part]');if(el)select(el.dataset.part)});
function editInput(e){const el=e.target;if(el.matches('[data-category-search]')){categorySearch=el.value;inspector.filterCategories(categorySearch);return;}if(el.matches('[data-nav-placement]')){change(()=>{campaignState.current.content.nav.placement[el.dataset.navPlacement]=el.value;if(activeNavSection===el.dataset.navPlacement)activeNavSection=null});return;}if(el.matches('[data-field]')){const obj=el.dataset.scope==='theme'?campaignState.current.theme:campaignState.current.content[el.dataset.scope];const key=el.dataset.field;if(el.dataset.scope==='title'&&key==='description'&&el.value.length>120)el.value=el.value.slice(0,120);const val=el.type==='checkbox'?el.checked:el.dataset.money!==undefined?huReadAmount(el.value):(el.type==='number'||el.type==='range')?Number(el.value):el.value;if(el.type==='range'&&!Number.isFinite(val))return;if(!inspector.has(el,'started')){snapshot();inspector.flag(el,'started')}obj[key]=key==='count'?Math.min(30,Math.max(1,val)):val;if((el.dataset.scope==='hero'||el.dataset.scope==='title'||['donors','ambassadors','rewards','updates'].includes(el.dataset.scope))&&tab==='design')obj.typographyPreset='';if(el.dataset.scope==='hero'&&key==='video'&&String(val).trim())obj.mediaType='video';if(el.dataset.scope==='hero'&&key==='image'&&String(val).trim())obj.mediaType='image';if(el.type==='range'){const out=$(`[data-slider-output="${el.dataset.scope}-${key}"]`);inspector.text(out,val+sliderUnit(key))}persist();renderPreview();renderSections();if(key==='logoResponsive'||key==='iconMode'||(el.dataset.scope==='donors'&&key==='showSubtitle')||(el.dataset.scope==='rewards'&&key==='showIntro'))renderInspector();$('#projectTitle').textContent=campaignState.current.content.hero.title}else if(el.matches('[data-block-edit]')){if(!inspector.has(el,'started')){snapshot();inspector.flag(el,'started')}campaignState.current.content.story.blocks[Number(el.dataset.blockEdit)].value=el.value;persist();renderPreview()}else if(el.matches('[data-visible]')){change(()=>campaignState.current.visible[el.dataset.visible]=el.checked)}}
$('#fields').addEventListener('click',e=>{
 const subCategoryPick=e.target.closest('[data-category-sub-pick]');if(subCategoryPick){categorySearch='';change(()=>chooseCampaignCategory(subCategoryPick.dataset.categorySubPick,subCategoryPick.dataset.categorySubValue));return;}
 const categoryPick=e.target.closest('[data-category-pick]');if(categoryPick){categorySearch='';change(()=>chooseCampaignCategory(categoryPick.dataset.categoryPick));return;}
 const categoryToggle=e.target.closest('[data-category-icon-toggle]');if(categoryToggle){categoryIconPickerOpen=!categoryIconPickerOpen;renderInspector();return;}
 const iconPick=e.target.closest('[data-category-icon]');if(iconPick){const name=iconPick.dataset.categoryIcon;if(categorySolidIcons[name])change(()=>campaignState.current.content.campaignInfo.categoryIcon=name);return;}
 const iconReset=e.target.closest('[data-category-icon-reset]');if(iconReset){change(()=>campaignState.current.content.campaignInfo.categoryIcon='');return;}
 const visibilityButton=e.target.closest('[data-device-visibility]');if(visibilityButton){change(()=>{campaignState.current.deviceVisibility[selected]=visibilityButton.dataset.deviceVisibility});return;}const placementButton=e.target.closest('[data-placement-id]');if(placementButton){change(()=>{campaignState.current.content.nav.placement[placementButton.dataset.placementId]=placementButton.dataset.placementValue;if(activeNavSection===placementButton.dataset.placementId)activeNavSection=null});return;}const typography=e.target.closest('[data-typo-preset]');if(typography){change(()=>applyTypographyPreset(typography.dataset.typoScope,typography.dataset.typoPreset));return;}const b=e.target.closest('[data-choice-field]');if(!b)return;const obj=b.dataset.choiceScope==='theme'?campaignState.current.theme:campaignState.current.content[b.dataset.choiceScope];change(()=>{obj.typographyPreset='';obj[b.dataset.choiceScope==='hero'&&b.dataset.choiceField==='textAnchor'&&device==='mobile'?'mobileTextAnchor':b.dataset.choiceField]=b.dataset.choiceScope==='donors'&&['columnsMobile','columnsDesktop'].includes(b.dataset.choiceField)?Number(b.dataset.choiceValue):b.dataset.choiceValue;if(b.dataset.choiceScope==='hero'&&b.dataset.choiceField==='logoAnchor'){obj.logoBelowText=false;}if(b.dataset.choiceScope==='hero'&&b.dataset.choiceField==='textAnchor'){const alignment=b.dataset.choiceValue.endsWith('-right')?'right':b.dataset.choiceValue.endsWith('-left')?'left':'center';if(device==='desktop'){obj.textAlign=alignment;obj.titleAlign=alignment;}}});});

$('#fields').addEventListener('input',e=>{
 const el=e.target;if(!el.matches('[data-db-setting],[data-db-key]'))return;
 const d=campaignState.current.content.donate;
 if(!inspector.has(el,'dbStarted')){snapshot();inspector.flag(el,'dbStarted')}
 const val=el.type==='checkbox'?el.checked:el.dataset.money!==undefined?huReadAmount(el.value):el.type==='number'||el.type==='range'?Number(el.value):el.value;
 if(typeof val==='number'&&!Number.isFinite(val))return;
 if(el.dataset.dbSetting){if(dbStyleKeys.includes(el.dataset.dbSetting))dbUpdateStyle(d,el.dataset.dbSetting,val);else d[el.dataset.dbSetting]=val;}
 else{const a=d.boxAmounts?.[Number(el.dataset.dbIndex)];if(a)a[el.dataset.dbKey]=val}
 persist();renderPreview();
 if(el.type==='range'){const label=el.closest('label');const readout=label?.querySelector('span')||el.nextElementSibling;inspector.text(readout,val+(el.dataset.dbSetting==='boxColumns'?'':'px'));}
});
$('#fields').addEventListener('change',e=>{
 const el=e.target;
 if(el.matches('[data-db-setting],[data-db-key]')){inspector.flag(el,'dbStarted',false);if(el.type!=='range'&&el.type!=='color'&&el.type!=='text'&&el.type!=='number')renderInspector()}
 if(el.matches('[data-db-label-icon-upload]')){const file=el.files?.[0];if(!file)return;if(file.size>1200000||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){toast('בחר תמונה או GIF עד 1.2MB');return}const index=Number(el.dataset.dbLabelIconUpload);const reader=new FileReader();reader.onload=()=>change(()=>{const a=campaignState.current.content.donate.boxAmounts[index];if(a){a.labelIcon=String(reader.result);a.labelIconSize=a.labelIconSize||22}});reader.readAsDataURL(file);return;}
 if(el.matches('[data-db-upload]')){const file=el.files?.[0];if(!file)return;if(file.size>2500000||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){toast('יש לבחור תמונה או GIF עד 2.5MB');return}const reader=new FileReader();reader.onload=()=>change(()=>{const a=campaignState.current.content.donate.boxAmounts[Number(el.dataset.dbUpload)];if(a)a.image=String(reader.result)});reader.readAsDataURL(file)}
});
$('#fields').addEventListener('click',e=>{
 const rewardsPosition=e.target.closest('[data-rewards-desktop-position]');if(rewardsPosition){change(()=>{campaignState.current.content.rewards.desktopPosition=rewardsPosition.dataset.rewardsDesktopPosition});return;}
 const scope=e.target.closest('[data-db-scope]');if(scope){dbEditScope=scope.dataset.dbScope;renderInspector();return;}
 const presentation=e.target.closest('[data-db-presentation]');if(presentation){change(()=>dbUpdateStyle(campaignState.current.content.donate,'boxCardPresentation',presentation.dataset.dbPresentation));return;}const otherStyle=e.target.closest('[data-db-other-style]');if(otherStyle){change(()=>{campaignState.current.content.donate.boxOtherStyle=otherStyle.dataset.dbOtherStyle});return;}
 const removeIcon=e.target.closest('[data-db-label-icon-remove]');if(removeIcon){change(()=>{const a=campaignState.current.content.donate.boxAmounts[Number(removeIcon.dataset.dbLabelIconRemove)];if(a)a.labelIcon=''});return;}
 const emojiButton=e.target.closest('[data-db-label-emoji]');
 if(emojiButton){const index=Number(emojiButton.dataset.dbIndex),emoji=emojiButton.dataset.dbLabelEmoji;const field=[...$('#fields').querySelectorAll('[data-db-key="label"]')].find(x=>Number(x.dataset.dbIndex)===index);const old=field?.value??campaignState.current.content.donate.boxAmounts[index]?.label??'';const pos=field?.selectionStart??old.length;const updated=old.slice(0,pos)+emoji+old.slice(pos);change(()=>{if(campaignState.current.content.donate.boxAmounts[index])campaignState.current.content.donate.boxAmounts[index].label=updated});const next=[...$('#fields').querySelectorAll('[data-db-key="label"]')].find(x=>Number(x.dataset.dbIndex)===index);if(next){next.focus();next.setSelectionRange(pos+emoji.length,pos+emoji.length)}return;}
 const kind=e.target.closest('[data-db-kind]');
 if(kind){const index=Number(kind.dataset.dbIndex),value=kind.dataset.dbKind;if(campaignState.current.content.donate.boxAmounts[index]?.kind!==value)change(()=>{campaignState.current.content.donate.boxAmounts[index].kind=value});return}
 const add=e.target.closest('[data-db-add]'),remove=e.target.closest('[data-db-remove]');
 const distribution=e.target.closest('[data-db-distribution]');if(distribution){change(()=>dbUpdateStyle(campaignState.current.content.donate,'boxDistribution',distribution.dataset.dbDistribution));return;}const layout=e.target.closest('[data-db-layout]');if(layout){change(()=>dbUpdateStyle(campaignState.current.content.donate,'boxLayout',layout.dataset.dbLayout));return;}const shape=e.target.closest('[data-db-shape]');if(shape){change(()=>{dbUpdateStyle(campaignState.current.content.donate,'boxShape',shape.dataset.dbShape)});return;}
 if(add){change(()=>{campaignState.current.content.donate.boxAmounts.push({id:'a'+Date.now(),amount:100,kind:'once',months:1,label:''})});return}
 if(remove){change(()=>campaignState.current.content.donate.boxAmounts.splice(Number(remove.dataset.dbRemove),1));return}
});
// One editor handler for carousel/card presentation across all component lists.
$('#fields').addEventListener('click',e=>{
 const deviceBtn=e.target.closest('[data-ham-device]');
 if(deviceBtn){const dev=deviceBtn.dataset.hamDevice;hamCardSizeDevice=dev;document.querySelector(`.device-switch [data-device="${dev}"]`)?.click();return;}
 const layoutBtn=e.target.closest('[data-ham-layout]');
 if(layoutBtn){const scope=layoutBtn.dataset.hamScope,conf=campaignState.current.content[scope],value=layoutBtn.dataset.hamLayout;
  change(()=>{if(value==='carousel'){if(conf.layout!=='carousel')conf.beforeCarouselLayout=conf.layout;conf.layout='carousel';}
   else conf.layout=conf.beforeCarouselLayout||hamCarouselModules.find(m=>m.scope===scope).ordinary;});return;
 }
 const rewardImageBtn=e.target.closest('[data-ham-reward-image]');
 if(rewardImageBtn){const dev=hamCardSizeDevice,pos=rewardImageBtn.dataset.hamRewardImage;
  if(pos==='top'||pos==='side')change(()=>{const conf=campaignState.current.content.rewards;conf.presentation??={};conf.presentation[dev]={...conf.presentation[dev],imagePosition:pos};});
  return;
 }
 const navBtn=e.target.closest('[data-ham-nav]');
 if(navBtn){const scope=navBtn.dataset.hamScope;change(()=>{campaignState.current.content[scope].carouselNavStyle=navBtn.dataset.hamNav});return;}
 const countBtn=e.target.closest('[data-ham-count]');
 if(countBtn){const scope=countBtn.dataset.hamScope,dev=hamCardSizeDevice;change(()=>{const conf=campaignState.current.content[scope];conf.presentation??={};conf.presentation[dev]={...conf.presentation[dev],count:countBtn.dataset.hamCount};});return;}
 const spreadBtn=e.target.closest('[data-ham-spread]');
 if(spreadBtn){const scope=spreadBtn.dataset.hamScope,dev=hamCardSizeDevice;change(()=>{const conf=campaignState.current.content[scope];conf.presentation??={};conf.presentation[dev]={...conf.presentation[dev],spread:spreadBtn.dataset.hamSpread};});return;}
 const textBtn=e.target.closest('[data-ham-text]');
 if(textBtn){const scope=textBtn.dataset.hamScope,dev=hamCardSizeDevice;change(()=>{const conf=campaignState.current.content[scope];conf.presentation??={};conf.presentation[dev]={...conf.presentation[dev],text:textBtn.dataset.hamText};});return;}
 const presetBtn=e.target.closest('[data-ham-presentation]');
 if(presetBtn){const scope=presetBtn.dataset.hamScope,dev=hamCardSizeDevice,mode=presetBtn.dataset.hamPresentation;
  change(()=>{const conf=campaignState.current.content[scope];conf.presentation??={};conf.presentation[dev]={...conf.presentation[dev],preset:mode,text:mode==='two'?'hide':mode==='compact'?'one':'two'};
   if(['rewards','races'].includes(scope)){
    const metrics=hamPresentationMetrics(scope,dev);const template=hamCardSizeDefaults[scope][dev];
    conf.cardSizing??={};conf.cardSizing[dev]={width:metrics.width,image:mode==='two'?62:mode==='compact'?77:mode==='wide'?117:template.image,padding:mode==='two'?7:mode==='compact'?9:template.padding,button:mode==='two'?30:template.button};
   }
  });return;
 }
});
$('#fields').addEventListener('toggle',e=>{
 const node=e.target;if(!(node instanceof HTMLDetailsElement))return;
 if(node.matches('.ham-easy-advanced'))hamAdvancedOpen=node.open;
 inspector.recordToggle(node,selected+':unified');
},true);
// Card sizing controls are shared by reward and race inspectors; no duplicated state.
$('#fields').addEventListener('click',e=>{
 const switcher=e.target.closest('[data-ham-card-device]');
 if(switcher){hamCardSizeDevice=switcher.dataset.hamCardDevice;const b=document.querySelector(`.device-switch [data-device="${hamCardSizeDevice}"]`);if(b)b.click();else renderInspector();return;}
 const choice=e.target.closest('[data-ham-card-preset]');
 if(!choice)return;
 const scope=choice.dataset.hamSizeScope,dev=hamCardSizeDevice,kind=choice.dataset.hamCardPreset;
 const presets={compact:{width:dev==='mobile'?195:228,image:66,padding:8,button:30},balanced:{...hamCardSizeDefaults[scope][dev]},spacious:{width:dev==='mobile'?310:380,image:dev==='mobile'?150:185,padding:20,button:46}};
 change(()=>{campaignState.current.content[scope].cardSizing??={};campaignState.current.content[scope].cardSizing[dev]={...presets[kind]};});
});
$('#fields').addEventListener('input',e=>{
 const input=e.target.closest('[data-ham-card-slider]');if(!input)return;
 const scope=input.dataset.hamSizeScope,dev=hamCardSizeDevice,key=input.dataset.hamCardSlider;
 if(!inspector.has(input,'editing')){snapshot();inspector.flag(input,'editing');}
 campaignState.current.content[scope].cardSizing??={};campaignState.current.content[scope].cardSizing[dev]??={};
 const safeNumber=Number(input.value);if(!Number.isFinite(safeNumber))return;campaignState.current.content[scope].cardSizing[dev][key]=safeNumber;
 inspector.text(input.closest('label')?.querySelector('output'),input.value+' px');
 persist();renderPreview();
});
$('#fields').addEventListener('change',e=>{if(e.target.matches('[data-ham-card-slider]')){inspector.flag(e.target,'editing',false);}});
$('#fields').addEventListener('input',editInput);$('#fields').addEventListener('change',async e=>{if(!['orgLogoUpload','heroImageUpload','heroVideoUpload','heroPosterUpload','managerPhotoUpload','donateIconUpload'].includes(e.target.id))return;const isDonateIcon=e.target.id==='donateIconUpload';const isManager=e.target.id==='managerPhotoUpload';const isHero=e.target.id==='heroImageUpload';const isVideo=e.target.id==='heroVideoUpload';const isPoster=e.target.id==='heroPosterUpload';const f=e.target.files?.[0];if(!f)return;if(f.size>(isDonateIcon?1000000:isVideo?20000000:isHero?3000000:1500000)){toast('התמונה גדולה מדי');return}if(!(isVideo?['video/mp4','video/webm']:isHero?['image/png','image/jpeg','image/webp']:['image/png','image/jpeg','image/webp','image/svg+xml']).includes(f.type)){toast('יש לבחור תמונת PNG, JPG, WEBP או SVG');return}const reader=new FileReader();reader.onload=()=>{change(()=>{if(isDonateIcon){campaignState.current.content.donate.customIcon=String(reader.result);campaignState.current.content.donate.iconMode='custom'}else if(isManager){campaignState.current.content.campaignInfo.photo=String(reader.result)}else if(isPoster){campaignState.current.content.hero.videoPoster=String(reader.result)}else if(isVideo){campaignState.current.content.hero.video=String(reader.result);campaignState.current.content.hero.mediaType='video'}else if(isHero){campaignState.current.content.hero.image=String(reader.result);campaignState.current.content.hero.mediaType='image'}else{campaignState.current.content.hero.orgLogo=String(reader.result);campaignState.current.content.hero.showOrgLogo=true}});toast(isDonateIcon?'סמל כפתור התרומה עודכן':isManager?'תמונת מנהל הקמפיין עודכנה':isPoster?'התמונה המקדימה עודכנה':isVideo?'סרטון ה־Hero עודכן':isHero?'תמונת ה־Hero עודכנה':'לוגו העמותה עודכן')};reader.readAsDataURL(f)});$('#fields').addEventListener('change',e=>{if(e.target.matches('[data-field],[data-block-edit]'))inspector.flag(e.target,'started',false)});$('#fields').addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.donorLayout){change(()=>campaignState.current.content.donors.layout=btn.dataset.donorLayout);return}if(btn.dataset.pickEmoji){change(()=>{campaignState.current.content.donate.emoji=btn.dataset.pickEmoji;campaignState.current.content.donate.iconMode='emoji'});return}if(btn.dataset.clearDonateIcon){change(()=>campaignState.current.content.donate.customIcon='');return}if(btn.dataset.palette){const t=palettes[btn.dataset.palette];change(()=>{campaignState.current.theme={...campaignState.current.theme,...Object.fromEntries(['primary','secondary','surface','ink'].map(k=>[k,t[k]]))}});return}if(btn.dataset.removeOrgLogo){change(()=>campaignState.current.content.hero.orgLogo='');return}if(btn.dataset.openTheme){select('theme');return}if(btn.dataset.addBlock){addBlock(btn.dataset.addBlock);return}const ops=[['blockUp',-1],['blockDown',1],['blockDelete',null]];for(const [name,delta] of ops)if(btn.dataset[name]!==undefined){const i=Number(btn.dataset[name]);change(()=>{const arr=campaignState.current.content.story.blocks;if(delta===null)arr.splice(i,1);else{const [b]=arr.splice(i,1);arr.splice(i+delta,0,b)}});break}});
function addBlock(type){change(()=>campaignState.current.content.story.blocks.push({id:'b'+Date.now(),type,value:type==='image'?'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1100&q=85':'פסקה חדשה — ערוך את הטקסט כאן.'}));select('story')}
$('#addStoryBtn').onclick=()=>{addBlock('text');toast('בלוק חדש נוסף לסיפור')};$$('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderInspector()});$$('[data-device]').forEach(b=>b.onclick=()=>{device=b.dataset.device;hamCardSizeDevice=device;$$('[data-device]').forEach(x=>x.classList.toggle('active',x===b));renderSections();renderPreview();renderInspector()});$('#highlightToggle').onchange=e=>{highlight=e.target.checked;renderPreview()};function hamRestoreEditor(direction){if(!campaignState.restore(direction))return;persist();render();if($('#storyBuilder').classList.contains('open'))sbRender();updateUndo();}$('#undoBtn').onclick=()=>hamRestoreEditor('undo');$('#redoBtn').onclick=()=>hamRestoreEditor('redo');$('#saveBtn').onclick=()=>{persist();toast('הגרסה נשמרה בדפדפן זה')};$('#exportBtn').onclick=async()=>{let portable;try{portable=await huPortableCampaignCopy()}catch(error){toast('גיבוי נכשל: '+error.message);return}try{if(window.hamAngularCampaignExport?.download){window.hamAngularCampaignExport.download(portable)}else{const blob=new Blob([JSON.stringify(portable,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hamonym-campaign.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}toast('קובץ JSON יוצא בהצלחה')}catch(error){toast('גיבוי נכשל: '+error.message)}};$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());campaignState.importDocument(parsed);toast('הקמפיין נטען בהצלחה')}catch(err){toast('שגיאה בטעינת JSON: '+err.message)}e.target.value=''};// Clear CAMPAIGN content while leaving the editor's stable component definitions intact.
function hamonymResetToBlankCampaign(){
 campaignState.replace(defaults());
 ensureComponentDefaults(campaignState.current);
 const c=campaignState.current.content;
 c.hero.title='';c.hero.subtitle='';c.hero.tag='';c.hero.image='';c.hero.video='';c.hero.videoPoster='';c.hero.orgLogo='';c.hero.slides=[];
 c.title.title='';c.title.subtitle='';c.title.description='';
 c.campaignInfo.manager='';c.campaignInfo.role='';c.campaignInfo.photo='';c.campaignInfo.location='';c.campaignInfo.category='';c.campaignInfo.subcategory='';c.campaignInfo.endAt='';
 c.story.blocks=[];c.story.heading='';
 c.stats.goal=0;c.stats.raised=0;c.stats.donors=0;c.stats.days=0;
 c.updates.title='';c.updates.text='';c.share.url='';c.share.message='';c.footer.title='';c.footer.subtitle='';
 c.rewards.items=[];
 c.donate.boxAmounts=[];
 campaignState.current.management ||= {};campaignState.current.management.modules ||= {};
 for(const key of ['donors','ambassadors','updates','comments','sponsors','races']){
   campaignState.current.management.modules[key] ||= {};campaignState.current.management.modules[key].items=[];
 }
 // Remove both temporary fixtures and stale presentation values.
 c.hero.showOrgLogo=false;c.hero.logoBelowText=false;
 c.rewards.items=[];
 c.stats.raised=0;c.stats.goal=0;c.stats.donors=0;
 for(const key of ['donors','ambassadors','updates','comments','sponsors','races']){
   campaignState.current.visible[key]=true;
   const mod=campaignState.current.management.modules[key];mod.items=[];
 }
 delete campaignState.current.management.demoFixtureSeedV0190;
 // Stay in the editor; the campaign is now empty and the temporary demo button is available.
 campaignState.current.management.entryWizard={step:-1,status:'draft',version:2};
 // Manual full reset is a blank campaign, not a request to preview mock content.
 campaignState.current.management.readinessTrackingV0111=true;
 campaignState.current.management.readinessEvidence={};
 campaignState.current.management.suppressPreviewGuidanceAfterReset=true;
 campaignState.current.management.name='';
 campaignState.current.management.mobileHero={enabled:false,title:'',subtitle:''};
 hamStoryExpanded=true;
}
document.getElementById('hamResetTopButton')?.addEventListener('click',()=>document.getElementById('resetBtn')?.click());
document.addEventListener('click',e=>{
 if(!e.target.closest('[data-ham-quick-reset]'))return;
 e.preventDefault();e.stopImmediatePropagation();
 document.getElementById('resetBtn')?.click();
},true);
$('#resetBtn').onclick=()=>{
 // v0.1.166: reset in place. Reloading a locally opened/sandboxed HTML can
 // produce a blank page; never navigate for this action.
 const oldWizard=document.getElementById('hwWizard');
 const oldCanvas=document.getElementById('canvas');
 const originalStage=document.querySelector('main.stage');
 if(oldCanvas&&originalStage&&oldCanvas.parentElement!==originalStage){
   const stageFoot=originalStage.querySelector('.stage-foot');
   originalStage.insertBefore(oldCanvas,stageFoot||null);
 }
 if(oldWizard)oldWizard.remove();
 document.body.classList.remove('hw-wizard-active');
 hamonymResetToBlankCampaign();
 // Bootstrap the same full management schema as a fresh campaign. Do not rely
 // on previous campaign's in-memory management state.
 const m=campaignState.current.management;
 m.entryWizard={step:-1,status:'draft',version:2};
 m.funding={start:'',duration:'ongoing',model:'flexible',matching:false,matchingFactor:2,matchingCap:50000};
 m.donations={suggestedAmounts:true,monthlyEnabled:true,monthlyPeriod:'until-cancel',monthlyCount:12,installments:true,maxInstallments:6,installmentOptions:[1,2,3,4,5,6]};
 m.mobileHero={enabled:false,title:'',subtitle:''};
 m.access={editors:'',allowEditorPublish:false};
 m.readinessTrackingV0111=true;m.readinessEvidence={};
 for(const key of ['rewards','races','sponsors','ambassadors','updates','donors','comments']){
   m.modules[key]||={};
   if(!Array.isArray(m.modules[key].items))m.modules[key].items=[];
 }
 // FIX v4.43: clear the real (Angular) undo history; v4.42 cleared unused engine arrays.
 campaignState.clearHistory();
 {const result=campaignState.saveDraft();if(!result.ok)console.warn('Reset draft could not be saved',result.message);result.pending?.then(r=>{if(!r.ok)console.warn('Reset draft could not be saved',r.message)})}
 // Start a completely new wizard, at welcome step -1, without a page refresh.
 window.hamOpenEntryWizard?.();
};
$('#hamDemoLoadBtn').onclick=()=>{
 change(()=>hamonymSeedTemporaryCampaignDemo(window.hamDemoKind==='race'?'race':'donation'));
 select('hero');toast(window.hamDemoKind==='race'?'קמפיין דמה מירוץ נטען. הגדרות המקצים בניהול ותוכן.':'קמפיין דמה רגיל נטען.');
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-ham-demo-kind]');if(!b||e.target.closest('#hwWizard'))return;window.hamDemoKind=b.dataset.hamDemoKind;document.getElementById('hamDemoLoadBtn')?.click();});

function hamHeroShapeSubmenu(context='main'){
 const current=campaignState.current.management?.heroStatsCard?.shape||'square';
 const items=[['square','כרטיס','▣']];
 return '';
}
function openTemplates(){
 if(campaignState.current.management?.campaignKind==='simple')return;
 const simple=campaignState.current.management?.campaignKind==='simple';
 const active=['panorama','sidebarCard','heroCard'];
 const card=id=>{const cfg=campaignState.current.management?.heroStatsCard||{};const chosen=id==='heroCard'?!!cfg.enabled:id==='sidebarCard'?!cfg.enabled&&!!cfg.sidebarStyled:!cfg.enabled&&!cfg.sidebarStyled;return `<div class="ham-layout-menu-entry"><button type="button" class="template-card ${chosen?'active':''}" data-template="${id}" aria-pressed="${chosen}"><span class="ham-layout-menu-icon" aria-hidden="true">${id==='heroCard'?'▣':id==='sidebarCard'?'▥':'▤'}</span><span>${id==='heroCard'?'כרטיס על ה־Hero':id==='sidebarCard'?'כרטיס בסיידבר':'פריסה רגילה'} ${chosen?'✓':''}</span></button></div>`;};
 $('#templateGrid').innerHTML=active.map(card).join('');
 $('#templateModal').classList.remove('hidden');
}
$('#templatesBtn').onclick=()=>{
 const compact=document.querySelector('body > .top [data-ham-v209-dropdown="layout"]');
 if(compact&&!compact.hidden){compact.open=true;return;}
 openTemplates();
};
$('#closeModal').onclick=()=>$('#templateModal').classList.add('hidden');
$('#templateModal').onclick=e=>{
 if(e.target===$('#templateModal'))$('#templateModal').classList.add('hidden');
 const card=e.target.closest('[data-template]');
 if(card){const id=card.dataset.template;if(!['panorama','sidebarCard','heroCard'].includes(id))return;change(()=>{campaignState.current.template='panorama';campaignState.current.management ||= {};campaignState.current.management.fullCampaignTemplate='panorama';campaignState.current.management.heroStatsCard ||= {};campaignState.current.management.heroStatsCard.enabled=id==='heroCard';campaignState.current.management.heroStatsCard.sidebarStyled=id==='sidebarCard';});$('#templateModal').classList.add('hidden');toast('מיקום נתוני הגיוס עודכן — התוכן נשמר')}
};

// Story Builder: standalone, persistent, nested content tree.
let sbSelected=null,sbDevice='mobile';
const sbTypes={text:['טקסט','T'],image:['תמונה','▧'],gallery:['גלריה','▦'],video:['וידאו','▷'],container:['קונטיינר','▤'],divider:['קו מפריד','—'],spacer:['מרווח','↕']};
const sbId=()=> 'sb'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function sbNew(type){return {id:sbId(),type,value:type==='text'?'<p>כתבו כאן את הסיפור שלכם…</p>':'',children:[],layout:'2',mobileLayout:'stack',images:[],galleryStyle:'slideshow',slideSeconds:3.5,imageFit:'cover',style:{mobile:{},desktop:{}}};}
function sbNodes(){return campaignState.current.content.story.blocks;}
function sbFind(id,items=sbNodes(),parent=null){for(let i=0;i<items.length;i++){let n=items[i];if(n.id===id)return {n,items,i,parent};if(n.children){let f=sbFind(id,n.children,n);if(f)return f;}}return null;}
function sbSafeUrl(u){u=String(u||'').trim();if(u.startsWith('hamonymmedia:'))return window.hamonymMediaFix?.src(u)||'';return /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(u)?u:'';}
function sbStyle(n,dev){return n.style?.[dev]||{};}
function sbInline(n,dev){const x=sbStyle(n,dev);return `margin:${Math.max(-100,Math.min(160,+x.margin||0))}px;padding:${Math.max(0,+x.padding||0)}px;${x.background?'background:'+esc(x.background)+';':''}${x.color?'color:'+esc(x.color)+';':''}${x.fontSize?'font-size:'+Number(x.fontSize)+'px;':''}${x.lineHeight?'--sb-line-height:'+Number(x.lineHeight)+';':''}${x.align?'text-align:'+esc(x.align)+';':''}${n.type==='image'?`--sb-image-vpos:${Math.max(0,Math.min(100,Number(x.imageVerticalPosition??50)))};`:''}${n.type==='container'?`border:${Math.max(0,Math.min(20,Number(x.borderWidth)||0))}px solid ${/^#[0-9a-fA-F]{6}$/.test(x.borderColor||'')?x.borderColor:'#d4ded9'};border-radius:${Math.max(0,Math.min(80,Number(x.borderRadius)||0))}px;`:''}`;}
function sbRenderNode(n,dev,editing){const type=n.type||'text',inner=(()=>{if(type==='text')return `<div class="sb-rich" ${editing?'contenteditable="true" data-sb-edit="'+esc(n.id)+'"':''}>${n.value?.startsWith('<')?n.value:esc(n.value||'')}</div>`;if(type==='image')return sbSafeUrl(n.value)?`<div class="sb-image-frame" style="--image-fit:${n.imageFit==='contain'?'contain':n.imageFit==='fill'?'fill':'cover'}"><img class="sb-image" style="object-fit:${n.imageFit==='contain'?'contain':n.imageFit==='fill'?'fill':'cover'};object-position:center ${Math.max(0,Math.min(100,Number(sbStyle(n,dev).imageVerticalPosition??50)))}%" src="${esc(sbSafeUrl(n.value))}" alt="תמונת סיפור"></div>`:'<div class="sb-empty">בחרו תמונה במאפיינים</div>';if(type==='gallery'){const imgs=(n.images||[]).filter(sbSafeUrl);const show=n.galleryStyle==='slideshow'||n.galleryStyle==='carousel';return `<div class="sb-gallery ${esc(n.galleryStyle||'grid')}" style="--sb-image-fit:${n.imageFit==='contain'?'contain':n.imageFit==='fill'?'fill':'cover'}" data-sb-seconds="${Math.max(0.5,Math.min(30,Number(n.slideSeconds)||3.5))}" ${show?'data-sb-slideshow="'+esc(n.id)+'"':''}>${imgs.map((u,i)=>`<img class="${show&&i===0?'sb-gallery-active':''}" src="${esc(sbSafeUrl(u))}" alt="תמונת גלריה ${i+1}">`).join('')||'<div class="sb-empty">הוסיפו תמונות לגלריה</div>'}${show&&imgs.length>1?'<button type="button" class="sb-gallery-nav sb-gallery-prev" data-sb-slide="prev" aria-label="תמונה קודמת">❮</button><button type="button" class="sb-gallery-nav sb-gallery-next" data-sb-slide="next" aria-label="תמונה הבאה">❯</button><span class="sb-gallery-count">1 / '+imgs.length+'</span>':''}</div>`;}if(type==='video')return sbSafeUrl(n.value)?`<video class="sb-video" controls preload="metadata" src="${esc(sbSafeUrl(n.value))}"></video>`:'<div class="sb-empty">הוסיפו כתובת MP4 או WebM</div>';if(type==='divider'){const w=Math.max(5,Math.min(100,Number(sbStyle(n,dev).dividerWidth??100)));return `<hr class="sb-divider" style="width:${w}%;max-width:100%;margin-inline:auto;box-sizing:border-box;border-top-width:${Math.max(1,Math.min(20,Number(sbStyle(n,dev).dividerThickness??1)))}px">`;}if(type==='spacer')return `<div class="sb-spacer" style="height:${Math.max(0,Number(sbStyle(n,dev).height ?? n.height ?? 24))}px"></div>`;if(type==='container'){const mobileMode=n.mobileLayout||'stack';const mobileCols=mobileMode==='columns'?Math.max(1,Math.min(3,Number(n.layout)||2)):1;return `<div class="sb-grid cols-${n.layout||'2'} ${sbStyle(n,dev).equalHeight==='yes' && (dev!=='mobile'||mobileMode==='columns')?'sb-equal-height':''}" ${dev==='mobile'?`style="grid-template-columns:repeat(${mobileCols},minmax(0,1fr))!important"`:''}>${(n.children||[]).map(c=>sbRenderNode(c,dev,editing)).join('')||'<div class="sb-empty">בחרו את הקונטיינר והוסיפו אליו רכיב</div>'}</div>`;}return '';})();return `<div class="${editing?'sb-node '+(sbSelected===n.id?'selected':''):'story-block'} ${type==='image'&&n.imageFit==='fill'?'sb-image-stretch':''}" ${editing?'data-sb-node="'+esc(n.id)+'"':'data-sb-story-id="'+esc(n.id)+'"'} style="${sbInline(n,dev)}">${editing?'<span class="sb-node-toolbar">'+esc(sbTypes[type]?.[0]||type)+'</span>':''}${inner}</div>`;}
function storyRenderPublic(nodes){return (nodes||[]).map(n=>sbRenderNode(n,device,false)).join('');}
function sbTreeRows(nodes,depth=0){return nodes.map(n=>`<div class="sb-tree-row ${sbSelected===n.id?'selected':''}" data-sb-pick="${esc(n.id)}" style="padding-right:${depth*13+4}px"><span>${sbTypes[n.type]?.[1]||'T'}</span><span class="sb-tree-label">${sbTypes[n.type]?.[0]||'טקסט'}</span><button title="למעלה" data-sb-move="up" data-id="${esc(n.id)}">↑</button><button title="למטה" data-sb-move="down" data-id="${esc(n.id)}">↓</button><button title="העבר לתוך הקונטיינר שמעל" data-sb-nest="${esc(n.id)}">↳</button><button title="הוצא מהקונטיינר" data-sb-out="${esc(n.id)}">↰</button><button type="button" title="מחק רכיב" aria-label="מחק רכיב" data-sb-tree-delete="${esc(n.id)}"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 10v7M14 10v7"/></svg></button></div>${n.children?.length?sbTreeRows(n.children,depth+1):''}`).join('');}
// v4.51: the slideshows' state and clock are StorySlidesService's (public-page/parts/story-slides.service.ts,
// `window.hamStorySlides`): a gallery of the page shows its slide itself; the canvas's galleries are changed as before.
function sbClearSlides(){window.hamStorySlides?.clear();}
function sbStepSlide(g,step=1){window.hamStorySlides?.step(g,step);}
function sbInitSlides(){window.hamStorySlides?.init();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-sb-slide]');if(!b)return;e.preventDefault();e.stopPropagation();const g=b.closest('.sb-gallery');if(g)sbStepSlide(g,b.dataset.sbSlide==='prev'?-1:1);});
// v4.54: the canvas, the tree and the properties panel are StoryBuilderComponent's (story-builder/): a render passes
// a copy of the blocks, the selection and the device; the old `sbRenderNode` editing markup and `sbProps` are its template.
function sbRender(){builder.render({nodes:structuredClone(sbNodes()),selected:sbSelected,device:sbDevice,font:campaignState.current.theme.font||'Heebo'});sbInitSlides();}
function sbProps(){builder.refresh();}
function sbUpdate(fn){snapshot();fn();persist();sbRender();renderPreview();}
function sbMigrateLegacyWizardLead(){
 const wiz=campaignState.current.management?.entryWizard;
 if(!wiz||campaignState.current.management.storyLeadMigrationV0170)return;
 campaignState.current.management.storyLeadMigrationV0170=true;
 const blocks=campaignState.current.content.story?.blocks;
 if(Array.isArray(blocks)&&blocks.length>=2&&blocks[0]?.type==='text'&&blocks[1]?.type==='image'){
   // Earlier versions positioned two independent blocks side by side only in the renderer.
   // Materialize that existing wizard pair once; never reconstruct it after deletion.
   const container=sbNew('container');
   container.layout='2';container.mobileLayout='stack';
   container.children=blocks.splice(0,2);
   container.storyWizardLeadV0170=true;
   blocks.unshift(container);
 }
 persist();
}
function sbOpen(){sbMigrateLegacyWizardLead();select('story');builder.open(true);sbSelected=sbNodes()[0]?.id||null;sbRender();}
function sbClose(){builder.open(false);render();}
$('#fields').addEventListener('click',e=>{if(e.target.closest('#openStoryBuilder'))sbOpen();});
$('#sbClearStory').addEventListener('click',e=>{
 e.preventDefault();e.stopPropagation();
 // Clear the live state (not a stale reference), including every nested child.
 const story=campaignState.current.content.story;
 if(!Array.isArray(story.blocks))story.blocks=[];
 if(story.blocks.length===0 && !story.heading){toast('הסיפור כבר ריק');return;}
 snapshot();
 campaignState.current.content.story={...story,blocks:[],heading:''};
 sbSelected=null;
 persist();
 sbRender();
 renderPreview();
 renderInspector();
 toast('כל הסיפור נמחק. אפשר לשחזר באמצעות ביטול פעולה');
});
function sbRestore(direction){if(!campaignState.restore(direction))return;if(sbSelected&&!sbFind(sbSelected))sbSelected=null;persist();render();sbRender();updateUndo();}
$('#sbUndo').onclick=()=>sbRestore('undo');$('#sbRedo').onclick=()=>sbRestore('redo');
// Record the state before the first edit in a continuous interaction, not on every slider tick.
let sbInputTransaction=null;
$('#sbProps').addEventListener('focusin',e=>{if(e.target.matches('[data-sb-style],[data-sb-value],[data-sb-property-range]')){sbInputTransaction={el:e.target,before:JSON.stringify(campaignState.current)};}});
$('#sbProps').addEventListener('focusout',e=>{if(sbInputTransaction?.el===e.target){if(sbInputTransaction.before!==JSON.stringify(campaignState.current)){campaignState.recordStoryEdit(sbInputTransaction.before);}sbInputTransaction=null;}});
$('#sbCanvas').addEventListener('focusin',e=>{if(e.target.matches('[data-sb-edit]'))sbInputTransaction={el:e.target,before:JSON.stringify(campaignState.current)};});
$('#sbCanvas').addEventListener('focusout',e=>{if(sbInputTransaction?.el===e.target){if(sbInputTransaction.before!==JSON.stringify(campaignState.current)){campaignState.recordStoryEdit(sbInputTransaction.before);}sbInputTransaction=null;}});
$('#storyBuilder').addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const key=e.key.toLowerCase();if(key!=='z'&&key!=='y')return;if(e.target.closest('[contenteditable],input,textarea'))return;e.preventDefault();sbRestore(key==='y'||e.shiftKey?'redo':'undo');});
$('#sbBack').onclick=sbClose;$('#sbMobile').onclick=()=>{sbDevice='mobile';sbRender()};$('#sbDesktop').onclick=()=>{sbDevice='desktop';sbRender()};
// v4.54: the palette is StoryBuilderComponent's template.
$('#sbPalette').onclick=e=>{let b=e.target.closest('[data-sb-add]');if(!b)return;const n=sbNew(b.dataset.sbAdd);sbUpdate(()=>{const f=sbFind(sbSelected);if(f?.n.type==='container'){f.n.children??=[];f.n.children.push(n)}else if(f){f.items.splice(f.i+1,0,n)}else sbNodes().push(n);sbSelected=n.id;});};
$('#sbTree').onclick=e=>{const del=e.target.closest('[data-sb-tree-delete]');if(del){const f=sbFind(del.dataset.sbTreeDelete);if(!f)return;sbUpdate(()=>{f.items.splice(f.i,1);if(sbSelected===f.n.id||!sbFind(sbSelected))sbSelected=null;});return;}const nest=e.target.closest('[data-sb-nest]');if(nest){const f=sbFind(nest.dataset.sbNest);if(!f||f.i===0)return;const prev=f.items[f.i-1];if(prev.type!=='container'){toast('כדי להכניס רכיב, מקמו אותו מתחת לקונטיינר');return;}sbUpdate(()=>{f.items.splice(f.i,1);prev.children??=[];prev.children.push(f.n);sbSelected=f.n.id;});return;}const out=e.target.closest('[data-sb-out]');if(out){const f=sbFind(out.dataset.sbOut);if(!f||!f.parent){toast('הרכיב כבר ברמה הראשית');return;}const parent=sbFind(f.parent.id);if(!parent)return;sbUpdate(()=>{f.items.splice(f.i,1);parent.items.splice(parent.i+1,0,f.n);sbSelected=f.n.id;});return;}const move=e.target.closest('[data-sb-move]');if(move){const f=sbFind(move.dataset.id),next=f.i+(move.dataset.sbMove==='up'?-1:1);if(next<0||next>=f.items.length)return;sbUpdate(()=>{[f.items[f.i],f.items[next]]=[f.items[next],f.items[f.i]];});return;}const pick=e.target.closest('[data-sb-pick]');if(pick){sbSelected=pick.dataset.sbPick;sbRender();}};
$('#sbCanvas').addEventListener('click',e=>{const el=e.target.closest('[data-sb-node]');if(el&&sbSelected!==el.dataset.sbNode){sbSelected=el.dataset.sbNode;sbRender();}});
$('#sbCanvas').addEventListener('input',e=>{const el=e.target.closest('[data-sb-edit]');if(!el)return;const f=sbFind(el.dataset.sbEdit);if(!f)return;f.n.value=el.innerHTML;persist();renderPreview();});
$('#sbProps').addEventListener('input',e=>{const el=e.target;if(el.dataset.sbPropertyRange){const f=sbFind(sbSelected);if(!f)return;f.n[el.dataset.sbPropertyRange]=Number(el.value);builder.text($('#sbProps').querySelector('[data-sb-output="'+el.dataset.sbPropertyRange+'"]'),el.value+' שניות');persist();
if(el.dataset.sbPropertyRange==='slideSeconds'){
  const id=f.n.id;
  const seconds=Number(el.value);
  // v4.54: the canvas's gallery shows the seconds (its data-sb-seconds); the page's galleries show them on the render below.
  builder.setSeconds(id,seconds);
  window.hamStorySlides?.setSeconds(id,seconds);
}
renderPreview();sbInitSlides();return;}if(el.dataset.sbStyle){const id=sbSelected;const key=el.dataset.sbStyle;const value=el.value;const f=sbFind(id);if(!f)return;f.n.style??={};f.n.style[sbDevice]??={};f.n.style[sbDevice][key]=value;persist();builder.restyle(id,sbInline(f.n,sbDevice));builder.text($('#sbProps').querySelector('[data-sb-output="'+key+'"]'),key==='lineHeight'?Number(value).toFixed(2):(key==='imageVerticalPosition'||key==='dividerWidth')?value+'%':value+' px');if(key==='equalHeight'||key==='imageVerticalPosition'||key==='dividerWidth'||key==='dividerThickness')sbRender();renderPreview();}else if(el.hasAttribute('data-sb-value')){const f=sbFind(sbSelected);if(f){f.n.value=el.value;persist();renderPreview();}}});
$('#sbProps').addEventListener('change',e=>{const el=e.target;if(el.dataset.sbProperty){sbUpdate(()=>{sbFind(sbSelected).n[el.dataset.sbProperty]=el.value;});return;}if(el.hasAttribute('data-sb-value')){sbRender();return;}if(el.hasAttribute('data-sb-upload')||el.hasAttribute('data-sb-gallery-upload')){const files=[...(el.files||[])];if(!files.length)return;if(files.some(f=>f.size>2500000)){toast('קובץ גדול מדי לגרסת ההדגמה (עד 2.5MB)');return;}const targetId=sbSelected,isGallery=el.hasAttribute('data-sb-gallery-upload');Promise.all(files.map(async f=>{if(f.type.startsWith('image/')){const bitmap=await createImageBitmap(f);const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();return c.toDataURL('image/jpeg',0.76);}return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(f)});})).then(urls=>{if(!sbFind(targetId))return;sbUpdate(()=>{const n=sbFind(targetId).n;if(isGallery){n.images??=[];n.images.push(...urls);}else n.value=urls[0];sbSelected=targetId;});}).catch(err=>{console.error(err);toast('העלאת הקובץ נכשלה');});}});
$('#sbProps').addEventListener('mousedown',e=>{if(e.target.closest('[data-sb-heading],[data-sb-format]'))e.preventDefault();});
$('#sbProps').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const f=sbFind(sbSelected);if(!f)return;if(b.dataset.sbChoice){const key=b.dataset.sbChoice,val=b.dataset.sbChoiceValue;sbUpdate(()=>{if(b.hasAttribute('data-sb-choice-style')){f.n.style??={};f.n.style[sbDevice]??={};f.n.style[sbDevice][key]=val;}else f.n[key]=val;});return;}if(b.dataset.sbHeading){const edit=$('#sbCanvas').querySelector('[data-sb-edit="'+sbSelected+'"]');if(edit){edit.focus();document.execCommand('formatBlock',false,b.dataset.sbHeading.toUpperCase());f.n.value=edit.innerHTML;persist();renderPreview();}return;}if(b.dataset.sbFormat){const edit=$('#sbCanvas').querySelector('[data-sb-edit="'+sbSelected+'"]');if(edit){edit.focus();const cmd=b.dataset.sbFormat;if(cmd==='createLink'){const url=prompt('כתובת קישור');if(url)document.execCommand('createLink',false,url);}else document.execCommand(cmd,false,null);f.n.value=edit.innerHTML;persist();renderPreview();}return;}if(b.hasAttribute('data-sb-wrap-image')){if(f.n.type!=='image'||f.parent?.type!=='container')return;const wrapper=sbNew('container');wrapper.layout='1';wrapper.children=[f.n,sbNew('image')];sbUpdate(()=>{f.items.splice(f.i,1,wrapper);sbSelected=wrapper.id;});return;}if(b.hasAttribute('data-sb-swap-columns')){if(f.n.type!=='container'||(f.n.children||[]).length<2)return;sbUpdate(()=>{[f.n.children[0],f.n.children[1]]=[f.n.children[1],f.n.children[0]];});return;}if(b.hasAttribute('data-sb-add-inside')){const picker=$('#sbInsidePicker');if(!picker)return;builder.togglePicker();return;}if(b.dataset.sbInsertType){if(f.n.type!=='container')return;const n=sbNew(b.dataset.sbInsertType);sbUpdate(()=>{f.n.children??=[];f.n.children.push(n);sbSelected=n.id;});return;}if(b.hasAttribute('data-sb-clear-gallery')){sbUpdate(()=>f.n.images=[]);return;}if(b.hasAttribute('data-sb-duplicate')){const n=JSON.parse(JSON.stringify(f.n));const rekey=x=>{x.id=sbId();(x.children||[]).forEach(rekey)};rekey(n);sbUpdate(()=>{f.items.splice(f.i+1,0,n);sbSelected=n.id;});return;}if(b.hasAttribute('data-sb-delete')){sbUpdate(()=>{f.items.splice(f.i,1);sbSelected=null;});}});


// Native drag-and-drop for the Story Builder: palette -> canvas/tree and tree/canvas -> containers or siblings.
let sbDragging=null;
function sbDragClear(){builder.clearMarks();}
function sbDropLocation(target,event){
 if(target.closest('[data-sb-drop-end]'))return {id:null,where:'end',row:target.closest('[data-sb-drop-end]')};
 const row=target.closest('[data-sb-node],[data-sb-pick]');
 if(!row)return {id:null,where:'end'};
 const id=row.dataset.sbNode||row.dataset.sbPick;
 const found=sbFind(id);if(!found)return null;
 const r=row.getBoundingClientRect(),y=(event.clientY-r.top)/Math.max(1,r.height);
 // Containers have an obvious central drop zone; outer bands insert before/after.
 const where=found.n.type==='container' && y>=.20 && y<=.80?'inside':y<.5?'before':'after';
 return {id,where,row};
}
function sbIsDescendant(node,id){return !!(node.children||[]).some(child=>child.id===id||sbIsDescendant(child,id));}
function sbPerformDrop(destination){
 if(!sbDragging||!destination)return;
 const source=sbDragging;
 const target=destination.id?sbFind(destination.id):null;
 if(destination.id&&!target)return;
 if(source.kind==='existing'){
   const from=sbFind(source.id);if(!from)return;
   if(target && (target.n.id===from.n.id || sbIsDescendant(from.n,target.n.id)))return;
   if(!target && from.items===sbNodes() && from.i===sbNodes().length-1)return;
   sbUpdate(()=>{
     const moving=from.n;
     from.items.splice(from.i,1);
     if(!destination.id)sbNodes().push(moving);
     else {
       const fresh=sbFind(destination.id);
       if(destination.where==='inside' && fresh.n.type==='container'){
         fresh.n.children??=[];fresh.n.children.push(moving);
       } else fresh.items.splice(fresh.i+(destination.where==='after'?1:0),0,moving);
     }
     sbSelected=moving.id;
   });
 }else if(source.kind==='new'){
   const n=sbNew(source.type);
   sbUpdate(()=>{
     if(!destination.id)sbNodes().push(n);
     else if(destination.where==='inside' && target.n.type==='container'){
       target.n.children??=[];target.n.children.push(n);
     }else target.items.splice(target.i+(destination.where==='after'?1:0),0,n);
     sbSelected=n.id;
   });
 }
}
function sbIsStoryOpen(){return builder.isOpen;}
$('#sbPalette').addEventListener('dragstart',e=>{
 const el=e.target.closest('[data-sb-add]');if(!el)return;
 sbDragging={kind:'new',type:el.dataset.sbAdd};e.dataTransfer.effectAllowed='copy';
 e.dataTransfer.setData('text/plain','hamonym-story-new:'+el.dataset.sbAdd);
 builder.mark(el,'sb-dragging');
});
$('#sbTree').addEventListener('dragstart',e=>{
 const el=e.target.closest('[data-sb-pick]');if(!el||e.target.closest('button'))return;
 sbDragging={kind:'existing',id:el.dataset.sbPick};e.dataTransfer.effectAllowed='move';
 e.dataTransfer.setData('text/plain','hamonym-story-move:'+el.dataset.sbPick);
 builder.mark(el,'sb-dragging');
});
$('#sbCanvas').addEventListener('dragstart',e=>{
 if(e.target.closest('[contenteditable],video'))return;
 const el=e.target.closest('[data-sb-node]');if(!el)return;
 sbDragging={kind:'existing',id:el.dataset.sbNode};e.dataTransfer.effectAllowed='move';
 e.dataTransfer.setData('text/plain','hamonym-story-move:'+el.dataset.sbNode);
 builder.mark(el,'sb-dragging');
});
for(const area of [$('#sbCanvas'),$('#sbTree')]){
 area.addEventListener('dragover',e=>{
   if(!sbDragging||!sbIsStoryOpen())return;
   e.preventDefault(); // accept drops even when hovering over images or nested text
   const dest=sbDropLocation(e.target,e);
   if(!dest)return;
   if(sbDragging.kind==='existing'){
     const from=sbFind(sbDragging.id),to=dest.id&&sbFind(dest.id);
     if(to && from && (to.n.id===from.n.id || sbIsDescendant(from.n,to.n.id))){sbDragClear();return;}
   }
   e.dataTransfer.dropEffect=sbDragging.kind==='new'?'copy':'move';
   sbDragClear();
   if(dest.row)builder.mark(dest.row,dest.where==='end'?'sb-drop-inside':'sb-drop-'+dest.where);
   else builder.mark(area,'sb-drop-inside');
 });
 area.addEventListener('drop',e=>{
   if(!sbDragging||!sbIsStoryOpen())return;
   e.preventDefault();e.stopPropagation();
   const dest=sbDropLocation(e.target,e);
   sbDragClear();try{sbPerformDrop(dest);}finally{sbDragging=null;}
 });
}
document.addEventListener('dragend',()=>{sbDragging=null;sbDragClear();});
// Refresh draggable affordances whenever the editor re-renders.
const sbRenderWithoutDnD=sbRender;
// v4.54: the draggable affordances (`draggable`, `title`) are StoryBuilderComponent's template.

// v4.48: the rewards shortcut ("לצפייה בתשורות") is rendered by PublicPageComponent (page-layout.ts `rewardsShortcut`).
// Works in the public preview even if the Angular adapter has not started.
document.addEventListener('click',event=>{
 const button=event.target instanceof Element?event.target.closest('#preview [data-ham-jump-rewards]'):null;
 if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 const preview=document.getElementById('preview');
 const tab=preview?.querySelector('[data-ham-panorama-tab="rewards"],[data-ham-mobile-tab="rewards"]');
 if(tab){tab.click();tab.closest('.ham-panorama-tabs,.ham-mobile-content')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 preview?.querySelector('[data-part="rewards"]')?.scrollIntoView({behavior:'smooth',block:'start'});
},true);
// v4.48: the shortcut is in the page's template (page-layout.ts `rewardsShortcut`); `hamFinishCampaignRender` is
// still called here, after the page is written: the header, the race participants, the updates sort and the
// shared collection headers hook into it.
const sbOriginalRenderPreview=renderPreview;renderPreview=function(...args){const result=sbOriginalRenderPreview.apply(this,args);sbInitSlides();window.hamFinishCampaignRender?.();return result;};

// HAMONYM v0.1.92 — temporary DEMO FIXTURES, inserted by explicit user action only;
// every generated item has demoFixtureV0190:true for precise cleanup in a later version.
const hamDemoEmbeddedPictures = {"hero": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzRlODc5MCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZTVjMzkyIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZDI4ZTc2Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxwYXRoIGQ9Ik0xNjAgMjY1IEw0NDAgOTAgNzIwIDI2NSBWNDYwIEgxNjBaIiBmaWxsPSIjZmZmOWU5IiBvcGFjaXR5PSIuNjUiLz48cGF0aCBkPSJNMTMwIDI3MCA0NDAgNTggNzUwIDI3MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmNmRkIiBzdHJva2Utd2lkdGg9IjM1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cmVjdCB4PSIzNTQiIHk9IjI4MCIgd2lkdGg9IjE2OSIgaGVpZ2h0PSIxODEiIHJ4PSIzNSIgZmlsbD0iI2JmNzg2MCIvPjxyZWN0IHg9IjIxNSIgeT0iMjk5IiB3aWR0aD0iOTUiIGhlaWdodD0iNzgiIHJ4PSIxOCIgZmlsbD0iIzliYmFiNyIvPjxyZWN0IHg9IjU3MCIgeT0iMjk5IiB3aWR0aD0iOTUiIGhlaWdodD0iNzgiIHJ4PSIxOCIgZmlsbD0iIzliYmFiNyIvPjxjaXJjbGUgY3g9IjM1OCIgY3k9IjM3MCIgcj0iMzQiIGZpbGw9IiNlOWIzOWEiLz48Y2lyY2xlIGN4PSI1MTEiIGN5PSIzNjkiIHI9IjMyIiBmaWxsPSIjZTliMzlhIi8+PHBhdGggZD0iTTMxMCA0NzBRMzIwIDM4OSAzNTkgNDAxUTQwNSA0MTAgNDA4IDQ3MCBNNDY2IDQ3MFE0NzUgNDAwIDUwOCA0MDBRNTU5IDQxMSA1NjcgNDcwIiBmaWxsPSIjNTM2YzY3Ii8+PHBhdGggZD0iTTQwMCAyMzdDNDA1IDIwNiA0NDQgMjA0IDQ1MCAyMzBDNDYwIDIwMCA1MDIgMjEzIDQ5MSAyNDVRNDc1IDI2NyA0NDcgMjkwUTQwNiAyNjQgNDAwIDIzN1oiIGZpbGw9IiNlZjc5N2IiLz48L3N2Zz4=", "story": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzg4YWVhNCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZTJjMGEyIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTFiOWFiIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxnPjxjaXJjbGUgY3g9IjI4MCIgY3k9IjIyMyIgcj0iNzAiIGZpbGw9IiNlNWI0OTQiLz48cGF0aCBkPSJNMTU1IDQ2NXEzLTE2NSAxMjUtMTY3IDEyMyA4IDEzMCAxNjciIGZpbGw9IiM0NzdiNzIiLz48cGF0aCBkPSJNMjE0IDE5MnE2LTEwMiA4OS04NiA3MiA2IDQ4IDExOC0zMy0zMC03My0yNC00OCAxMS02NC04IiBmaWxsPSIjNjI0ZTRiIi8+PC9nPjxnPjxjaXJjbGUgY3g9IjU0NSIgY3k9IjIyMSIgcj0iNzUiIGZpbGw9IiNmMGM1YTIiLz48cGF0aCBkPSJNNDEwIDQ2NXE1LTE3NSAxMzUtMTc0IDE0MiA5IDE0NSAxNzQiIGZpbGw9IiNlZWEzNmYiLz48cGF0aCBkPSJNNDgyIDE3N3ExNi0xMDEgMTAwLTc1IDgwIDIxIDQyIDEyNy0yMC01Ni03NC00OC0zNiAxOC02OC00IiBmaWxsPSIjNGM1MzRmIi8+PC9nPjwvc3ZnPg==", "food": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI2M0YjY5OCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZThjYTkxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjOGRiYWE0Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxlbGxpcHNlIGN4PSI0NDAiIGN5PSIzMzgiIHJ4PSIyOTIiIHJ5PSIxMjQiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9Ii44NSIvPjxlbGxpcHNlIGN4PSI0NDAiIGN5PSIzMzIiIHJ4PSIyNDIiIHJ5PSI5MyIgZmlsbD0iI2MwZDZiYyIvPjxlbGxpcHNlIGN4PSI0NDAiIGN5PSIzMjkiIHJ4PSIyMDMiIHJ5PSI2OSIgZmlsbD0iI2U4YTg2YSIvPjxnIGZpbGw9IiM3MzlhNjciPjxjaXJjbGUgY3g9IjM1MCIgY3k9IjMxMyIgcj0iMjEiLz48Y2lyY2xlIGN4PSI0NzciIGN5PSIzNTQiIHI9IjE5Ii8+PGNpcmNsZSBjeD0iNTM1IiBjeT0iMjk2IiByPSIxNyIvPjwvZz48ZyBmaWxsPSIjZjdkODg5Ij48Y2lyY2xlIGN4PSI0MjAiIGN5PSIzMTkiIHI9IjI3Ii8+PGNpcmNsZSBjeD0iNTMwIiBjeT0iMzQyIiByPSIyNCIvPjwvZz48cGF0aCBkPSJNNjcwIDE1NWwtMzAgMTU1bTYxLTE1My0zMCAxNTUiIHN0cm9rZT0iI2VlZTdkNiIgc3Ryb2tlLXdpZHRoPSIxNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+", "team": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzhhYTVhYSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZDdjMGFjIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNmY5NThjIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxnPjxjaXJjbGUgY3g9IjI4MCIgY3k9IjIyMyIgcj0iNzAiIGZpbGw9IiNlNWI0OTQiLz48cGF0aCBkPSJNMTU1IDQ2NXEzLTE2NSAxMjUtMTY3IDEyMyA4IDEzMCAxNjciIGZpbGw9IiM0NzdiNzIiLz48cGF0aCBkPSJNMjE0IDE5MnE2LTEwMiA4OS04NiA3MiA2IDQ4IDExOC0zMy0zMC03My0yNC00OCAxMS02NC04IiBmaWxsPSIjNjI0ZTRiIi8+PC9nPjxnPjxjaXJjbGUgY3g9IjU0NSIgY3k9IjIyMSIgcj0iNzUiIGZpbGw9IiNmMGM1YTIiLz48cGF0aCBkPSJNNDEwIDQ2NXE1LTE3NSAxMzUtMTc0IDE0MiA5IDE0NSAxNzQiIGZpbGw9IiNlZWEzNmYiLz48cGF0aCBkPSJNNDgyIDE3N3ExNi0xMDEgMTAwLTc1IDgwIDIxIDQyIDEyNy0yMC01Ni03NC00OC0zNiAxOC02OC00IiBmaWxsPSIjNGM1MzRmIi8+PC9nPjwvc3ZnPg==", "gift": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI2JiOWJiOCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZWNkMGIwIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjODRhOGE1Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxyZWN0IHg9IjIxMCIgeT0iMjE2IiB3aWR0aD0iNDYzIiBoZWlnaHQ9IjIzNSIgcng9IjE3IiBmaWxsPSIjZjJkZmM4Ii8+PHJlY3QgeD0iMTg1IiB5PSIxNzciIHdpZHRoPSI1MTAiIGhlaWdodD0iNjQiIHJ4PSIxNCIgZmlsbD0iI2ZmZjRlMiIvPjxyZWN0IHg9IjQwNCIgeT0iMTc4IiB3aWR0aD0iNzMiIGhlaWdodD0iMjczIiBmaWxsPSIjYTliN2FiIi8+PHBhdGggZD0iTTQ0MiAxNzhRMzAzIDE2OCAzMjEgOThxNDEtODcgMTIxIDgwUTUxNiAxMCA1ODAgODlxMzkgODQtMTM4IDg5WiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYTliN2FiIiBzdHJva2Utd2lkdGg9IjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=", "race": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzkxYjhiYyIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZTRjNWFlIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjN2FhZmE2Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxjaXJjbGUgY3g9IjQ2MCIgY3k9IjEzNyIgcj0iNDgiIGZpbGw9IiNmNGNjYWEiLz48cGF0aCBkPSJNNDY0IDE5NyA0MDAgMjgzIDQ4NiAzMTcgNTU4IDI0MiIgc3Ryb2tlPSIjZjRlYmRmIiBzdHJva2Utd2lkdGg9IjQyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJtNDA5IDI3NS0xMzIgMzVtMjA1IDExLTc2IDExMm0xNS0xNTMgODkgODUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzQ0NmY3NyIgc3Ryb2tlLXdpZHRoPSIzNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0ibTU1MiAyNDIgOTAgNTUiIHN0cm9rZT0iI2Y0Y2NhYSIgc3Ryb2tlLXdpZHRoPSIyNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTAgNDQyaDg4MCIgc3Ryb2tlPSIjZTllMGM5IiBzdHJva2Utd2lkdGg9IjE0Ii8+PHBhdGggZD0iTTc3IDM4MWgxMDBNMTIwIDMzM2g2NCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIG9wYWNpdHk9Ii42Ii8+PC9zdmc+", "abstract": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzcyOTg5ZCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZGJiNWE4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTZiY2EyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxwYXRoIGQ9Ik04NyA0MjFRMjM4IDE1OSA0MTggMzE5VDgwOCAyNzAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI0NCIgb3BhY2l0eT0iLjQzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSI0NzQiIGN5PSIyMDYiIHI9IjExNSIgZmlsbD0iI2Y2ZGZiMyIgb3BhY2l0eT0iLjgiLz48cGF0aCBkPSJNMCA0NDcgMTgxIDMzMyAzNTYgNDEzIDU1OCAyOTQgODgwIDQ0NyIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjI0Ii8+PC9zdmc+", "avatar1": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Q5ZWNlNiIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjNzY5ZDhlIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzRkNDg0NSIvPjwvc3ZnPg==", "avatar2": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Y2ZTNkOSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjYjc3ODc4Ii8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzcxNTQ1MSIvPjwvc3ZnPg==", "avatar3": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Q3ZGZlYyIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjNmM5MGIwIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzM0M2I0NCIvPjwvc3ZnPg==", "avatar4": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Y0ZTZjOSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjYmQ5MDc4Ii8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzYyNGI0NyIvPjwvc3ZnPg==", "avatar5": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2RjZThkOSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjYTc3ODkxIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzZkNjI1YyIvPjwvc3ZnPg==", "avatar6": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2U0ZTFlZiIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjNzI4ZGEwIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzU2NDk0YSIvPjwvc3ZnPg=="};
function hamonymSeedTemporaryCampaignDemo(kind='donation'){
 const isRace=kind==='race';
 campaignState.current.management ||= {};
 campaignState.current.management.campaignKind=isRace?'race':'donation';
 campaignState.current.management.raceParticipants=[];
 if(!isRace && campaignState.current.management.modules?.races)campaignState.current.management.modules.races.items=[];

 // Demo campaign URL: populate the mandatory slug field in wizard step 02.
 // Do not overwrite a URL the user has already customized.
 if(!campaignState.current.content.share)campaignState.current.content.share={};
 const existingDemoSlug=String(campaignState.current.content.share.url||'').split(/[?#]/)[0].split('/').filter(Boolean).pop()||'';
 if(!existingDemoSlug||existingDemoSlug==='demo'||existingDemoSlug==='campaign-name'){
   campaignState.current.content.share.url='https://hamonym.com/campaign/bayit-ham-layeladim';
 }
 campaignState.current.management ||= {};campaignState.current.management.modules ||= {};
 campaignState.current.management.suppressPreviewGuidanceAfterReset=false;
 const modules=campaignState.current.management.modules;
 const c=campaignState.current.content;
 if(!c.hero.title)c.hero.title='בית חם לילדים';
 if(!c.hero.orgLogo)c.hero.orgLogo='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgMTYwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgcng9IjM2IiBmaWxsPSIjZmZmZGY3Ii8+PGNpcmNsZSBjeD0iODAiIGN5PSI4MCIgcj0iNTkiIGZpbGw9IiNmM2VhZDciLz48cGF0aCBkPSJNMzkgNzkgODAgNDNsNDEgMzZ2NDRIMzlaIiBmaWxsPSIjZmZmIiBzdHJva2U9IiMyZTcxNjIiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik02NCAxMjJWOTJhMTYgMTYgMCAwIDEgMzIgMHYzMCIgZmlsbD0iI2VmYzk5MiIvPjxwYXRoIGQ9Ik04MCA3OWMtMTUtMTAtMjEtMjItMTAtMjcgNi0zIDEwIDEgMTAgNCA0LTkgMTctNyAxOCAxIDAgOS0xMCAxNi0xOCAyMloiIGZpbGw9IiNkMTc3NzgiLz48cGF0aCBkPSJNNTUgMTI2aDUwIiBzdHJva2U9IiMyZTcxNjIiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';
 c.hero.showOrgLogo=true;c.hero.logoBelowText=true;
 if(!c.hero.image || c.hero.image===defaults().content.hero.image){c.hero.image=hamDemoEmbeddedPictures.hero;c.hero.mediaType='image';c.hero.video='';c.hero.slides=[];}
 if(c.hero.image===hamDemoEmbeddedPictures.hero)c.hero.mediaType='image';
 if(!c.hero.subtitle)c.hero.subtitle='אוכל חם, תמיכה ואהבה לכל ילד';
 if(!c.title.title)c.title.title='מעניקים לילדים בית חם';
 if(!c.title.description)c.title.description='עוזרים לילדים ולמשפחות לקבל ארוחה חמה ומעטפת תומכת.';
 // Demo loading restores the manager only when the demo supplies the name.
 // Do not override a deliberate visibility choice on an already configured campaign.
 if(!c.campaignInfo.manager){
  c.campaignInfo.manager='צוות הבית החם';
  c.campaignInfo.showManager=true;
 }
 if(!c.campaignInfo.category)c.campaignInfo.category='קהילה וחברה';
 if(!c.campaignInfo.location)c.campaignInfo.location='ירושלים';
 if(!c.donate.boxAmounts?.some(a=>a.kind!=='recurring'&&Number(a.amount)>0))c.donate.boxAmounts=[
  {amount:100,kind:'once',label:'ארוחה חמה'},
  {amount:180,kind:'once',label:'נותנים באהבה'},
  {amount:360,kind:'once',label:'מעניקים שבוע חם'},
  {amount:1000,kind:'once',label:'שותפים לדרך'}
 ];
 const put=(key,items)=>{
  modules[key] ||= {};
  if(!Array.isArray(modules[key].items)||!modules[key].items.length){
    modules[key].items=items.map((item,i)=>({...item,id:'demo-0190-'+key+'-'+(i+1),demoFixtureV0190:true}));
    modules[key].enabled=true;modules[key].visible=true;
    if(campaignState.current.visible[key]===false)campaignState.current.visible[key]=true;
  }
 };
 put('donors',[
  {name:'משפחת לוי',photo:hamDemoEmbeddedPictures.avatar1,amount:1000,time:'לפני 4 דקות',dedication:'שמחים לעזור לילדים. בהצלחה רבה!',anonymous:false},
  {name:'רחל כהן',photo:hamDemoEmbeddedPictures.avatar2,amount:360,time:'לפני 12 דקות',dedication:'שכל ילד ירגיש בבית.',anonymous:false},
  {name:'תורם אנונימי',amount:180,time:'לפני 25 דקות',anonymous:true,dedication:'למען הילדים',dedicationPublic:true},
  {name:'איתי ברק',photo:hamDemoEmbeddedPictures.avatar3,amount:500,time:'לפני שעה',dedication:'ביחד נעשה שינוי.',anonymous:false},
  {name:'שרה ואברהם מזרחי',photo:hamDemoEmbeddedPictures.avatar4,amount:720,time:'לפני שעתיים',dedication:'מחזקים את הצוות המדהים.',anonymous:false},
  {name:'יעל ישראלי',photo:hamDemoEmbeddedPictures.avatar5,amount:100,time:'אתמול',dedication:'תרומה קטנה באהבה גדולה.',anonymous:false},
  {name:'דוד אברהם',photo:hamDemoEmbeddedPictures.avatar3,amount:250,time:'אתמול',dedication:'בהצלחה!',anonymous:false},
  {name:'משפחת שלום',photo:hamDemoEmbeddedPictures.avatar6,amount:1800,time:'לפני יומיים',dedication:'תודה על כל מה שאתם עושים.',anonymous:false},
  {name:'אורית רוזן',photo:hamDemoEmbeddedPictures.avatar1,amount:180,time:'לפני 3 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'משפחת אביטל',photo:hamDemoEmbeddedPictures.avatar2,amount:360,time:'לפני 4 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'שמואל לוי',photo:hamDemoEmbeddedPictures.avatar3,amount:500,time:'לפני 5 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'דנה שחר',photo:hamDemoEmbeddedPictures.avatar4,amount:72,time:'לפני 6 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'אפרת מימון',photo:hamDemoEmbeddedPictures.avatar5,amount:1000,time:'לפני 7 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'משפחת קדם',photo:hamDemoEmbeddedPictures.avatar6,amount:250,time:'לפני 8 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'איילת ברק',photo:hamDemoEmbeddedPictures.avatar1,amount:540,time:'לפני 9 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'ניר כהן',photo:hamDemoEmbeddedPictures.avatar2,amount:1200,time:'לפני 10 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'רוני אלון',photo:hamDemoEmbeddedPictures.avatar3,amount:180,time:'לפני 11 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'אורן מזרחי',photo:hamDemoEmbeddedPictures.avatar4,amount:420,time:'לפני 12 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false}
 ]);
 put('ambassadors',[
  {name:'נועה כהן',target:15000,raised:9300,photo:hamDemoEmbeddedPictures.avatar4,url:''},
  {name:'דניאל לוי',target:12000,raised:7850,photo:hamDemoEmbeddedPictures.avatar5,url:''},
  {name:'משפחת מזרחי',target:10000,raised:6250,photo:hamDemoEmbeddedPictures.avatar1,url:''},
  {name:'יעל ברק',target:8000,raised:3700,photo:hamDemoEmbeddedPictures.avatar2,url:''},
  {name:'איתי ישראלי',target:5000,raised:2150,photo:hamDemoEmbeddedPictures.avatar3,url:''},
  {name:'רחל אברהם',target:7000,raised:5450,photo:hamDemoEmbeddedPictures.avatar6,url:''},
  {name:'תמר לוי',target:8000,raised:4500,photo:hamDemoEmbeddedPictures.avatar3,url:''},
  {name:'משפחת נבון',target:10000,raised:6700,photo:hamDemoEmbeddedPictures.avatar4,url:''},
  {name:'אורי בן דוד',target:5000,raised:2900,photo:hamDemoEmbeddedPictures.avatar5,url:''},
  {name:'מיכל רוזן',target:7500,raised:3800,photo:hamDemoEmbeddedPictures.avatar6,url:''},
  {name:'דניאל פלד',target:12000,raised:8500,photo:hamDemoEmbeddedPictures.avatar1,url:''},
  {name:'אורית הדר',target:6000,raised:2400,photo:hamDemoEmbeddedPictures.avatar2,url:''},
  {name:'משפחת בר',target:10000,raised:9100,photo:hamDemoEmbeddedPictures.avatar3,url:''},
  {name:'אלעד צור',target:4000,raised:2500,photo:hamDemoEmbeddedPictures.avatar4,url:''},
  {name:'יערה כץ',target:9000,raised:3300,photo:hamDemoEmbeddedPictures.avatar5,url:''},
  {name:'נעמי גל',target:7000,raised:4000,photo:hamDemoEmbeddedPictures.avatar6,url:''},
  {name:'משפחת רז',target:9000,raised:6300,photo:hamDemoEmbeddedPictures.avatar1,url:''},
  {name:'איילה כהן',target:6000,raised:3350,photo:hamDemoEmbeddedPictures.avatar2,url:''},
  {name:'יונתן ברק',target:11000,raised:7200,photo:hamDemoEmbeddedPictures.avatar3,url:''},
  {name:'משפחת שלו',target:13000,raised:8850,photo:hamDemoEmbeddedPictures.avatar4,url:''},
  {name:'מאיה רון',target:8000,raised:4600,photo:hamDemoEmbeddedPictures.avatar5,url:''},
  {name:'אלון שרון',target:5000,raised:2050,photo:hamDemoEmbeddedPictures.avatar6,url:''},
  {name:'שירה פרידמן',target:12000,raised:9800,photo:hamDemoEmbeddedPictures.avatar1,url:''},
  {name:'משפחת אדרי',target:7000,raised:4100,photo:hamDemoEmbeddedPictures.avatar2,url:''},
  {name:'רותם קדם',target:10000,raised:5900,photo:hamDemoEmbeddedPictures.avatar3,url:''},
  {name:'יובל לוי',target:8500,raised:5100,photo:hamDemoEmbeddedPictures.avatar4,url:''}
 ]);
 // Add the extra fixture ambassadors to already-seeded demo campaigns, never to real campaigns.
 if(Array.isArray(modules.ambassadors.items)&&modules.ambassadors.items.length>=16&&modules.ambassadors.items.every(x=>x.demoFixtureV0190)){
  const newNames=['משפחת רז','איילה כהן','יונתן ברק','משפחת שלו','מאיה רון','אלון שרון','שירה פרידמן','משפחת אדרי','רותם קדם','יובל לוי'];
  const existing=new Set(modules.ambassadors.items.map(x=>x.name));
  const extras=[
   [9000,6300,1],[6000,3350,2],[11000,7200,3],[13000,8850,4],[8000,4600,5],
   [5000,2050,6],[12000,9800,1],[7000,4100,2],[10000,5900,3],[8500,5100,4]
  ];
  newNames.forEach((name,i)=>{if(!existing.has(name)){const [target,raised,avatar]=extras[i];modules.ambassadors.items.push({id:'demo-0190-ambassadors-extra-'+(i+1),name,target,raised,photo:hamDemoEmbeddedPictures['avatar'+avatar],url:'',demoFixtureV0190:true});}});
 }

 if(modules.ambassadors.items?.some(x=>x.demoFixtureV0190))modules.ambassadors.publicAmounts=true;
 put('updates',[
  {title:'היוזמה יצאה לדרך',text:'בזכות עשרות שותפים נרגשים פתחנו את הקמפיין. היעד שלנו הוא לתת לכל ילד ארוחה חמה, תחושת שייכות ומעטפת אוהבת.',date:'2026-11-15',status:'published',pinned:true,image:hamDemoEmbeddedPictures.hero},
  {title:'כבר מאות ארוחות חמות',text:'הצוות והמתנדבים חילקו ארוחות חמות ומזינות. תודה לכל מי שבישל, ארז והגיע לעזור.',date:'2026-11-12',status:'published',pinned:false,image:hamDemoEmbeddedPictures.food},
  {title:'פותחים שבוע של נתינה',text:'השבוע הצטרפו שגרירים חדשים ואנו ממשיכים להרחיב את מעגל התומכים.',date:'2026-11-09',status:'published',pinned:false,image:hamDemoEmbeddedPictures.team}
 ]);
 put('races',[
  {title:'רצים למען הילדים',desc:'מסלול קהילתי של 5 ק״מ למען פעילות הבית החם.',date:'2026-12-18',price:60,capacity:150,registered:48,status:'open',image:hamDemoEmbeddedPictures.race},
  {title:'צועדים ביחד',desc:'מסלול הליכה משפחתי של 2 ק״מ, מתאים לכל הגילים.',date:'2026-12-18',price:30,capacity:250,registered:102,status:'open',image:hamDemoEmbeddedPictures.race}
 ]);
 put('comments',[
  {name:'מיכל לוי',text:'יוזמה מבורכת. כל הכבוד למתנדבים!',date:'2026-11-16',approved:true},
  {name:'יוסי אברהם',text:'שמח להיות שותף למטרה הזו.',date:'2026-11-15',approved:true},
  {name:'עדי רוזן',text:'בהצלחה גדולה! מחזקת את ידיכם.',date:'2026-11-14',approved:true}
 ]);
 put('sponsors',[
  {name:'חברים למען הקהילה',logo:hamDemoEmbeddedPictures.gift,description:'שותפים מרכזיים',url:''},
  {name:'עסקים עם לב',logo:hamDemoEmbeddedPictures.abstract,description:'נותני חסות',url:''},
  {name:'יחד למען הילדים',logo:hamDemoEmbeddedPictures.home||hamDemoEmbeddedPictures.hero,description:'שותפים לדרך',url:''},
  {name:'לב פתוח',logo:hamDemoEmbeddedPictures.gift,description:'שותפים בקהילה',url:''},
  {name:'חברים לעשייה',logo:hamDemoEmbeddedPictures.abstract,description:'שותפים בקהילה',url:''},
  {name:'בית של תקווה',logo:hamDemoEmbeddedPictures.hero,description:'שותפים בקהילה',url:''},
  {name:'קהילה תומכת',logo:hamDemoEmbeddedPictures.food,description:'שותפים בקהילה',url:''},
  {name:'כוח הנתינה',logo:hamDemoEmbeddedPictures.team,description:'שותפים בקהילה',url:''},
  {name:'עושים טוב יחד',logo:hamDemoEmbeddedPictures.gift,description:'שותפים בקהילה',url:''},
  {name:'מרכז החסד',logo:hamDemoEmbeddedPictures.abstract,description:'שותפים בקהילה',url:''},
  {name:'מעגל הלב',logo:hamDemoEmbeddedPictures.hero,description:'שותפים בקהילה',url:''},
  {name:'שבילי קהילה',logo:hamDemoEmbeddedPictures.food,description:'שותפים בקהילה',url:''},
  {name:'שותפות לצמיחה',logo:hamDemoEmbeddedPictures.team,description:'שותפים בקהילה',url:''}
 ]);
 if(!Array.isArray(campaignState.current.content.rewards.items)||!campaignState.current.content.rewards.items.length){
  campaignState.current.content.rewards.items=[
   {name:'תודה מכל הלב',description:'מכתב תודה אישי מהצוות.',amount:100,recommended:false,stockEnabled:false,image:hamDemoEmbeddedPictures.gift,demoFixtureV0190:true},
   {name:'שותפים לארוחה חמה',description:'תעודת הוקרה דיגיטלית מעוצבת.',amount:250,recommended:true,stockEnabled:false,image:hamDemoEmbeddedPictures.gift,demoFixtureV0190:true},
   {name:'מעגל החברים',description:'הוקרה מיוחדת לשותפים המשמעותיים.',amount:500,recommended:false,stockEnabled:false,image:hamDemoEmbeddedPictures.gift,demoFixtureV0190:true},
   {name:'שותפי זהב',description:'תעודת תודה מיוחדת והזמנה למפגש הפעילים.',amount:1200,recommended:false,stockEnabled:true,quantity:25,image:hamDemoEmbeddedPictures.gift,demoFixtureV0190:true}
  ];campaignState.current.visible.rewards=true;
 }
 if(!campaignState.current.content.story.blocks?.length){
  campaignState.current.content.story.blocks=[
   {id:'demo-0190-story-intro',type:'text',value:'<h2>בית חם מתחיל בלב פתוח</h2><p>יש ילדים שעבורם ארוחה חמה אינה מובנת מאליה. בכל יום, מתנדבים פותחים את הלב ומביאים אוכל מזין, יחס אישי ותחושה של בית לילדים הזקוקים לכך.</p><p>הקמפיין נועד להרחיב את פעילות החלוקה ולוודא שגם ביום עמוס, ובכל מזג אוויר, אף ילד לא יישאר בלי מענה.</p>',children:[],demoFixtureV0190:true},
   {id:'demo-0190-story-photo',type:'image',value:hamDemoEmbeddedPictures.story,children:[],demoFixtureV0190:true},
   {id:'demo-0190-story-more',type:'text',value:'<h2>מה התרומה שלכם מאפשרת?</h2><p>בזכות השותפות נוכל לרכוש מוצרי מזון טריים, להכין מנות חמות, להרחיב את מערך המתנדבים ולסייע למשפחות בהתמדה לאורך השנה.</p><p>אנחנו מאמינים שהשינוי הגדול מתחיל במעשים פשוטים: צלחת מלאה, חיוך חם והידיעה שיש מי שחושב עליך.</p><p>כל תרומה, קטנה כגדולה, נותנת לנו כוח להגיע לעוד ילד ולעוד משפחה.</p>',children:[],demoFixtureV0190:true},
   {id:'demo-0190-story-outro',type:'text',value:'<h2>ביחד יוצרים עתיד טוב יותר</h2><p>עזרו לנו להמשיך במפעל החסד הזה. כל שיתוף, תרומה או הצטרפות כשגרירים מחזקים את מעגל הנתינה. תודה שאתם חלק מהסיפור.</p>',children:[],demoFixtureV0190:true}
  ];
  campaignState.current.content.story.heading ||= 'הסיפור שלנו';
  campaignState.current.visible.story=true;
 }
 if(!(Number(campaignState.current.content.stats.goal)>0))campaignState.current.content.stats.goal=150000;
 if(!(Number(campaignState.current.content.stats.raised)>0))campaignState.current.content.stats.raised=68540;
 if(!(Number(campaignState.current.content.stats.donors)>0))campaignState.current.content.stats.donors=324;
 if(!isRace){
   campaignState.current.management.modules.races.items=[];
   campaignState.current.visible.races=false;
 }else{
   campaignState.current.visible.races=true;
   campaignState.current.management.modules.races.enabled=true;
   campaignState.current.management.modules.races.visible=true;
   // Rich but clearly fictional fixture: three real-looking heats and sample participants.
   campaignState.current.management.modules.races.items=[
     {id:'demo-race-2km',title:'מקצה משפחות',desc:'מסלול משפחתי נוח, מתאים להורים ולילדים.',distance:'2 ק״מ',date:'2026-12-18',place:'פארק העיר',price:40,start:'09:00',capacity:200,status:'open',registered:86,minAge:0,demoFixtureV0190:true},
     {id:'demo-race-5km',title:'מקצה עממי',desc:'ריצה קהילתית בקצב חופשי למען הילדים.',distance:'5 ק״מ',date:'2026-12-18',place:'פארק העיר',price:80,start:'08:15',capacity:250,status:'open',registered:174,minAge:12,demoFixtureV0190:true},
     {id:'demo-race-10km',title:'מקצה תחרותי',desc:'מקצה מדוד לרצים מנוסים, עם נקודות מים.',distance:'10 ק״מ',date:'2026-12-18',place:'פארק העיר',price:120,start:'07:30',capacity:180,status:'open',registered:119,minAge:16,demoFixtureV0190:true}
   ];
   const sampleNames=['נועה לוי','איתי כהן','מאיה ישראלי','יואב רז','דנה רוזן','אורי בן דוד','רוני הדר','מיכל ברק','עמית מזרחי','תמר פרידמן','אלון שחר','יעל אברהם','עידו קפלן','שירה נבון','איתן לוין','הדר פלד','גיא אשכנזי','נטע ארז'];
   campaignState.current.management.raceParticipants=sampleNames.map((name,i)=>({name,heat:i%3,age:[9,32,25,41,17,38,24,30,16,29,37,23,42,26,35,28,19,33][i],demo:true,demoFixtureV0190:true}));
   c.hero.title='רצים למען הילדים';
   c.hero.subtitle='מירוץ קהילתי למען עתיד טוב יותר';
   c.title.title='רצים יחד, תורמים יחד';
   c.title.description='מירוץ קהילתי המשלב הרשמה למקצים ותמיכה בילדים';
 }
 campaignState.current.management.demoFixtureSeedV0190=true;
}
render();hamPreviewContextualSetup();sbInitSlides();
const hamCartEngineScript=atob('LyogSEFNT05ZTSB2MC4xLjk0IOKAkyB1bmlmaWVkIGxvY2FsIGRlbW9uc3RyYXRpb24gY2FydCAoZG9uYXRpb25zLCByZXdhcmRzIGFuZCByYWNlIHJlZ2lzdHJhdGlvbnMpLgogICBBIGNsaWVudC1zaWRlIHByb3RvdHlwZSBvbmx5LiBOZXZlciBzdWJtaXRzIGEgY2hhcmdlLCByZXNlcnZhdGlvbiBvciBwYXJ0aWNpcGFudCByZWNvcmQuICovCihmdW5jdGlvbigpewondXNlIHN0cmljdCc7CmNvbnN0IHN0b3JhZ2VJZD0naGFtLWNhcnQtc2VlZCc7CmxldCBzZWVkPW51bGw7CnRyeXtzZWVkPUpTT04ucGFyc2UoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3RvcmFnZUlkKT8udGV4dENvbnRlbnR8fCdudWxsJyk7fWNhdGNoKF8pe3NlZWQ9bnVsbDt9CmNvbnN0IHNvdXJjZT0oKT0+e3RyeXtpZih0eXBlb2Ygc3RhdGUhPT0ndW5kZWZpbmVkJyYmc3RhdGU/LmNvbnRlbnQpcmV0dXJuIHN0YXRlO31jYXRjaChfKXt9cmV0dXJuIHNlZWQ/LmNhbXBhaWdufHx7Y29udGVudDp7ZG9uYXRlOntib3hBbW91bnRzOltdfSxyZXdhcmRzOntpdGVtczpbXX19LG1hbmFnZW1lbnQ6e21vZHVsZXM6e3JhY2VzOntpdGVtczpbXX19fX07fTsKbGV0IGVudHJpZXM9QXJyYXkuaXNBcnJheShzZWVkPy5jYXJ0KT9zZWVkLmNhcnQubWFwKHg9Pih7Li4ueH0pKTpbXTsKbGV0IGFjdGl2ZURpYWxvZz1udWxsLCBtb2RlPSdjYXJ0JywgZmVlZGJhY2s9Jyc7CmNvbnN0IGN1cnJlbmN5PW49Pm5ldyBJbnRsLk51bWJlckZvcm1hdCgnaGUtSUwnLHtzdHlsZTonY3VycmVuY3knLGN1cnJlbmN5OidJTFMnLG1heGltdW1GcmFjdGlvbkRpZ2l0czowfSkuZm9ybWF0KE51bWJlcihuKXx8MCk7CmNvbnN0IGNsZWFuPXM9PlN0cmluZyhzPz8nJykucmVwbGFjZSgvWyY8PiInXS9nLGM9Pih7JyYnOicmYW1wOycsJzwnOicmbHQ7JywnPic6JyZndDsnLCciJzonJnF1b3Q7JywiJyI6JyYjMzk7J31bY10pKTsKY29uc3QgaWQ9KCk9PlN0cmluZyhEYXRlLm5vdygpKSsnLScrTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiw4KTsKY29uc3Qgc3ZnPSc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0zIDRoMmwyLjQgMTEuMmEyIDIgMCAwIDAgMiAxLjZIMTlhMiAyIDAgMCAwIDItMS42TDIyIDhINiIvPjxjaXJjbGUgY3g9IjEwIiBjeT0iMjAiIHI9IjEiLz48Y2lyY2xlIGN4PSIxOSIgY3k9IjIwIiByPSIxIi8+PC9zdmc+JzsKY29uc3QgdG90YWxMaW5lPXg9PigreC5wcmljZXx8MCkqTWF0aC5tYXgoMSwreC5xdHl8fDEpKih4LmtpbmQ9PT0nZG9uYXRpb24nJiZ4LnJlY3VycmluZz9NYXRoLm1heCgxLCt4Lm1vbnRoc3x8MSk6MSk7CmNvbnN0IGdyYW5kVG90YWw9KCk9PmVudHJpZXMucmVkdWNlKChhLHgpPT5hK3RvdGFsTGluZSh4KSwwKTsKY29uc3QgZHVlTm93PSgpPT5lbnRyaWVzLnJlZHVjZSgoYSx4KT0+YSsoK3gucHJpY2V8fDApKk1hdGgubWF4KDEsK3gucXR5fHwxKSwwKTsKY29uc3QgY291bnQ9KCk9PmVudHJpZXMucmVkdWNlKChuLHgpPT5uK01hdGgubWF4KDEsK3gucXR5fHwxKSwwKTsKZnVuY3Rpb24gbm90aWZ5KHRleHQpewogbGV0IG49ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hhbUNhcnRUb2FzdCcpO2lmKCFuKXtuPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO24uaWQ9J2hhbUNhcnRUb2FzdCc7bi5jbGFzc05hbWU9J2hhbS1jYXJ0LXRvYXN0JztuLnNldEF0dHJpYnV0ZSgncm9sZScsJ3N0YXR1cycpO2RvY3VtZW50LmJvZHkuYXBwZW5kKG4pfQogbi50ZXh0Q29udGVudD10ZXh0O24uY2xhc3NMaXN0LmFkZCgnc2hvdycpO2NsZWFyVGltZW91dChuLl90aW1lcik7bi5fdGltZXI9c2V0VGltZW91dCgoKT0+bi5jbGFzc0xpc3QucmVtb3ZlKCdzaG93JyksMjEwMCk7Cn0KZnVuY3Rpb24gbW91bnQoKXsKIGNvbnN0IHByZXZpZXc9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ByZXZpZXcnKTtpZighcHJldmlldylyZXR1cm47CiBjb25zdCBjb250cm9scz1wcmV2aWV3LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXBhcnQ9ImhlYWRlciJdIC5jYW1wYWlnbi1oZWFkZXIgLmhlYWRlci1jb250cm9scycpfHxwcmV2aWV3LnF1ZXJ5U2VsZWN0b3IoJy5jYW1wYWlnbi1oZWFkZXIgLmhlYWRlci1jb250cm9scycpOwogaWYoY29udHJvbHMmJiFjb250cm9scy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1oYW0tY2FydC10cmlnZ2VyXScpKXsKICBjb25zdCBiPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO2IudHlwZT0nYnV0dG9uJztiLmNsYXNzTmFtZT0naGFtLWNhcnQtaGVhZGVyLWJ1dHRvbic7Yi5kYXRhc2V0LmhhbUNhcnRUcmlnZ2VyPScnO2IuaW5uZXJIVE1MPXN2ZysnPHNwYW4gY2xhc3M9ImhhbS1jYXJ0LWNvdW50IiBhcmlhLWxpdmU9InBvbGl0ZSI+MDwvc3Bhbj4nO2NvbnRyb2xzLnByZXBlbmQoYik7CiB9CiByZWZyZXNoKCk7Cn0KZnVuY3Rpb24gcmVmcmVzaCgpewogZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtaGFtLWNhcnQtdHJpZ2dlcl0nKS5mb3JFYWNoKGI9PnsKICBjb25zdCBiYWRnZT1iLnF1ZXJ5U2VsZWN0b3IoJy5oYW0tY2FydC1jb3VudCcpO2lmKGJhZGdlKWJhZGdlLnRleHRDb250ZW50PVN0cmluZyhjb3VudCgpKTsKICBiLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsJ9eh15wg16fXoNeZ15XXqiwgJytjb3VudCgpKycg16TXqNeZ15jXmdedJyk7Yi5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywn16HXnCDXp9eg15nXldeqIMK3ICcrY291bnQoKSsnINek16jXmdeY15nXnScpOwogIGIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWl0ZW1zJyxjb3VudCgpPjApOwogfSk7Cn0KZnVuY3Rpb24gYWRkUmV3YXJkKGluZGV4KXsKIGNvbnN0IHI9c291cmNlKCkuY29udGVudD8ucmV3YXJkcz8uaXRlbXM/LltpbmRleF07aWYoIXIpcmV0dXJuIGZhbHNlOwogY29uc3QgcHJpY2U9TnVtYmVyKHIuYW1vdW50KTtpZighTnVtYmVyLmlzRmluaXRlKHByaWNlKXx8cHJpY2U8MCl7bm90aWZ5KCfXnteX15nXqCDXlNeq16nXldeo15Qg15DXmdeg15Ug16rXp9eZ158nKTtyZXR1cm4gZmFsc2U7fQogY29uc3QgbWF0Y2g9ZW50cmllcy5maW5kKHg9Pngua2luZD09PSdyZXdhcmQnJiZ4LnNvdXJjZUluZGV4PT09aW5kZXgpOwogY29uc3QgY3VycmVudD1tYXRjaD8ucXR5fHwwOwogaWYoci5zdG9ja0VuYWJsZWQmJmN1cnJlbnQ+PU51bWJlcihyLnF1YW50aXR5fHwwKSl7bm90aWZ5KCfXnNeQINeg15XXqteoINee15zXkNeZINec16rXqdeV16jXlCDXlNeW15UnKTtyZXR1cm4gZmFsc2U7fQogaWYobWF0Y2gpbWF0Y2gucXR5Kys7ZWxzZSBlbnRyaWVzLnB1c2goe3VpZDppZCgpLGtpbmQ6J3Jld2FyZCcsc291cmNlSW5kZXg6aW5kZXgsdGl0bGU6U3RyaW5nKHIubmFtZXx8J9eq16nXldeo15QnKSxpbmZvOlN0cmluZyhyLmRlc2NyaXB0aW9ufHwnJykscHJpY2UscXR5OjF9KTsKIHJlZnJlc2goKTtub3RpZnkoJ9eU16rXqdeV16jXlCDXoNeV16HXpNeUINec16HXnCcpO3JldHVybiB0cnVlOwp9CmZ1bmN0aW9uIGFkZERvbmF0aW9uKGJveCl7CiBpZighYm94KXJldHVybiBmYWxzZTsKIGNvbnN0IGNob3Nlbj1ib3gucXVlcnlTZWxlY3RvcignW2RhdGEtZG9uYXRpb24tY2hvaWNlXS5kb25hdGlvbi1zZWxlY3RlZCxbZGF0YS1kb25hdGlvbi1jaG9pY2VdLmlzLWNob3NlbixbZGF0YS1kb25hdGlvbi1vdGhlcl0uZG9uYXRpb24tc2VsZWN0ZWQsW2RhdGEtZG9uYXRpb24tb3RoZXJdLmlzLWNob3NlbicpOwogY29uc3QgZG9uYXRlPXNvdXJjZSgpLmNvbnRlbnQ/LmRvbmF0ZXx8e307CiBsZXQgYW1vdW50PTAscmVjdXJyaW5nPWZhbHNlLG1vbnRocz0xOwogaWYoY2hvc2VuPy5oYXNBdHRyaWJ1dGUoJ2RhdGEtZG9uYXRpb24tb3RoZXInKSl7CiAgY29uc3QgaW5wdXQ9Ym94LnF1ZXJ5U2VsZWN0b3IoJy5kb25hdGlvbi1jdXN0b20tZW50cnkgaW5wdXQnKTthbW91bnQ9TnVtYmVyKFN0cmluZyhpbnB1dD8udmFsdWV8fCcnKS5yZXBsYWNlKC9b4oKqLFxzXS9nLCcnKSk7CiB9ZWxzZXsKICBjb25zdCBpbmRleD1OdW1iZXIoY2hvc2VuPy5kYXRhc2V0LmRvbmF0aW9uQ2hvaWNlPz8wKTtjb25zdCBwcmVzZXQ9ZG9uYXRlLmJveEFtb3VudHM/LltpbmRleF07CiAgaWYoIXByZXNldCl7bm90aWZ5KCfXkdeX16jXlSDXqteX15nXnNeUINeh15vXldedINec16rXqNeV157XlCcpO3JldHVybiBmYWxzZTt9CiAgYW1vdW50PU51bWJlcihwcmVzZXQuYW1vdW50KTtyZWN1cnJpbmc9cHJlc2V0LmtpbmQ9PT0ncmVjdXJyaW5nJzttb250aHM9cmVjdXJyaW5nP01hdGgubWF4KDEsTWF0aC5mbG9vcihOdW1iZXIocHJlc2V0Lm1vbnRocyl8fDEpKToxOwogfQogaWYoIU51bWJlci5pc0Zpbml0ZShhbW91bnQpfHxhbW91bnQ8PTApe25vdGlmeSgn15nXqSDXnNeU15bXmdefINeh15vXldedINeq16jXldee15Qg16rXp9eZ158nKTtib3gucXVlcnlTZWxlY3RvcignLmRvbmF0aW9uLWN1c3RvbS1lbnRyeSBpbnB1dCcpPy5mb2N1cygpO3JldHVybiBmYWxzZTt9CiBlbnRyaWVzLnB1c2goe3VpZDppZCgpLGtpbmQ6J2RvbmF0aW9uJyxwcmljZTphbW91bnQscXR5OjEscmVjdXJyaW5nLG1vbnRocyx0aXRsZTpyZWN1cnJpbmc/J9eq16jXldee15Qg15fXldeT16nXmdeqJzon16rXqNeV157XlCDXl9eT1r7XpNei157XmdeqJyxpbmZvOnJlY3VycmluZz9gJHttb250aHN9INeX15XXk9ep15nXnSDCtyAke2N1cnJlbmN5KGFtb3VudCl9INec15fXldeT16lgOifXnNee16LXnyDXlNen157XpNeZ15nXnyd9KTsKIHJlZnJlc2goKTtub3RpZnkoJ9eU16rXqNeV157XlCDXoNeV16HXpNeUINec16HXnCcpO3JldHVybiB0cnVlOwp9CmZ1bmN0aW9uIGFkZFJhY2UoZGF0YSl7CiBpZighZGF0YXx8IU51bWJlci5pc0Zpbml0ZSgrZGF0YS51bml0UHJpY2UpfHwrZGF0YS51bml0UHJpY2U8MClyZXR1cm4gZmFsc2U7CiBjb25zdCBwYXJ0aWNpcGFudHM9QXJyYXkuaXNBcnJheShkYXRhLnBhcnRpY2lwYW50cyk/ZGF0YS5wYXJ0aWNpcGFudHM6W107CiBjb25zdCBxdHk9cGFydGljaXBhbnRzLmxlbmd0aHx8TWF0aC5tYXgoMSxNYXRoLmZsb29yKE51bWJlcihkYXRhLnF0eSl8fDEpKTsKIGVudHJpZXMucHVzaCh7dWlkOmlkKCksa2luZDoncmFjZScsc291cmNlSW5kZXg6ZGF0YS5yYWNlSW5kZXgsdGl0bGU6U3RyaW5nKGRhdGEudGl0bGV8fCfXlNeo16nXnteUINec157Xmdeo15XXpScpLGluZm86U3RyaW5nKGRhdGEudHlwZXx8J9eU16jXqdee15Qg16jXkteZ15zXlCcpLHByaWNlOk51bWJlcihkYXRhLnVuaXRQcmljZSkscXR5LHBhcnRpY2lwYW50czpwYXJ0aWNpcGFudHMubWFwKHA9Pih7Li4ucH0pKSxjb250YWN0OmRhdGEuY29udGFjdD97Li4uZGF0YS5jb250YWN0fTpudWxsfSk7CiByZWZyZXNoKCk7bm90aWZ5KCfXlNeU16jXqdee15Qg16DXldeh16TXlCDXnNeh15wnKTtyZXR1cm4gdHJ1ZTsKfQpjb25zdCBraW5kcz17ZG9uYXRpb246J9eq16jXldee15QnLHJld2FyZDon16rXqdeV16jXlCcscmFjZTon15TXqNep157XlCDXnNee15nXqNeV16UnfTsKY29uc3Qgcm93PSh4LGkpPT5gPGFydGljbGUgY2xhc3M9ImhhbS1jYXJ0LXJvdyI+PGRpdiBjbGFzcz0iaGFtLWNhcnQtcm93LWtpbmQiPiR7a2luZHNbeC5raW5kXXx8J9ek16jXmdeYJ308L2Rpdj48ZGl2IGNsYXNzPSJoYW0tY2FydC1yb3ctbWFpbiI+PGRpdiBjbGFzcz0iaGFtLWNhcnQtcm93LWhlYWQiPjxzdHJvbmc+JHtjbGVhbih4LnRpdGxlKX08L3N0cm9uZz48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgZGF0YS1oYW0tY2FydC1yZW1vdmU9IiR7aX0iIGFyaWEtbGFiZWw9IteU16HXqCAke2NsZWFuKHgudGl0bGUpfSIgdGl0bGU9IteU16HXqCI+w5c8L2J1dHRvbj48L2Rpdj48c21hbGw+JHtjbGVhbih4LmluZm98fCcnKX0ke3gua2luZD09PSdyYWNlJz8nIMK3ICcreC5xdHkrJyDXntep16rXqtek15nXnSc6Jyd9PC9zbWFsbD48ZGl2IGNsYXNzPSJoYW0tY2FydC1yb3ctYm90dG9tIj4ke3gua2luZD09PSdyZXdhcmQnP2A8ZGl2IGNsYXNzPSJoYW0tY2FydC1xdHkiIGFyaWEtbGFiZWw9Iteb157XldeqIj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgZGF0YS1oYW0tY2FydC1xdHk9IiR7aX0iIGRhdGEtZGVsdGE9Ii0xIiBhcmlhLWxhYmVsPSLXlNek15fXqiDXm9ee15XXqiI+4oiSPC9idXR0b24+PGI+JHt4LnF0eX08L2I+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGRhdGEtaGFtLWNhcnQtcXR5PSIke2l9IiBkYXRhLWRlbHRhPSIxIiBhcmlhLWxhYmVsPSLXlNeS15PXnCDXm9ee15XXqiI+KzwvYnV0dG9uPjwvZGl2PmA6YDxzcGFuIGNsYXNzPSJoYW0tY2FydC11bml0Ij4ke3gua2luZD09PSdkb25hdGlvbicmJngucmVjdXJyaW5nP2NsZWFuKGAke3gubW9udGhzfSDXqtep15zXldee15nXnWApOngua2luZD09PSdyYWNlJz94LnF0eSsnINee16nXqteq16TXmdedJzon16TXqNeZ15gg15DXl9eTJ308L3NwYW4+YH08Yj4ke2N1cnJlbmN5KHRvdGFsTGluZSh4KSl9PC9iPjwvZGl2PjwvZGl2PjwvYXJ0aWNsZT5gOwpjb25zdCBoYXNSZWN1cnJpbmc9KCk9PmVudHJpZXMuc29tZSh4PT54LnJlY3VycmluZyk7CmZ1bmN0aW9uIGRyYXcoKXsKIGlmKCFhY3RpdmVEaWFsb2cpcmV0dXJuOwogY29uc3QgZGlzYWJsZWQ9ZW50cmllcy5sZW5ndGg9PT0wOwogY29uc3QgY2FydEJvZHk9YDxkaXYgY2xhc3M9ImhhbS1jYXJ0LWxpbmVzIj4ke2VudHJpZXMubGVuZ3RoP2VudHJpZXMubWFwKHJvdykuam9pbignJyk6JzxkaXYgY2xhc3M9ImhhbS1jYXJ0LWVtcHR5Ij48c3Bhbj4ke3N2Z308L3NwYW4+PGgzPteU16HXnCDXqdec15vXnSDXqNeZ16c8L2gzPjxwPteR15fXqNeVINeq16jXldee15QsINeq16nXldeo15Qg15DXlSDXlNeo16nXnteUINec157Xmdeo15XXpSDXldeU16TXqNeZ15jXmdedINeZ15XXpNeZ16LXlSDXm9eQ158uPC9wPjwvZGl2Pid9PC9kaXY+PGRpdiBjbGFzcz0iaGFtLWNhcnQtc3VtbWFyeSI+PGRpdj48c3Bhbj7XodeaINeU15TXltee16DXlCR7aGFzUmVjdXJyaW5nKCk/JyAo15vXldec15wg16rXqdec15XXnteZ150g16LXqteZ15PXmdeZ150pJzonJ308L3NwYW4+PHN0cm9uZz4ke2N1cnJlbmN5KGdyYW5kVG90YWwoKSl9PC9zdHJvbmc+PC9kaXY+JHtoYXNSZWN1cnJpbmcoKT9gPHNtYWxsPtec16rXqdec15XXnSDXm9ei16ogKNeU16LXqNeb15QpOiAke2N1cnJlbmN5KGR1ZU5vdygpKX0gwrcg15nXqteo16og15TXqteo15XXnteV16og15TXl9eV15PXqdeZ15XXqiDXqteX15XXmdeRINeR16LXqteZ15MsINeR15vXpNeV16Mg15zXnteg15LXoNeV158g15TXl9eZ15XXkS48L3NtYWxsPmA6Jyd9PC9kaXY+YDsKIGNvbnN0IGNoZWNrb3V0Qm9keT1gPGRpdiBjbGFzcz0iaGFtLWNhcnQtY2hlY2tvdXQiPjxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0iaGFtLWNhcnQtYmFjayIgZGF0YS1oYW0tY2FydC1iYWNrPuKGkiDXl9eW16jXlCDXnNeh15w8L2J1dHRvbj48cD7XpNeo15jXmSDXlNen16nXqCDXnNeU15bXnteg15Q8L3A+PGZvcm0gaWQ9ImhhbUNhcnRDaGVja291dEZvcm0iIGNsYXNzPSJoYW0tY2FydC1mb3JtIj48bGFiZWw+16nXnSDXntec15A8aW5wdXQgYXV0b2NvbXBsZXRlPSJuYW1lIiBuYW1lPSJmdWxsTmFtZSIgcmVxdWlyZWQgbWlubGVuZ3RoPSIyIiBwbGFjZWhvbGRlcj0i16nXnSDXpNeo15jXmSDXldee16nXpNeX15QiPjwvbGFiZWw+PGxhYmVsPteY15zXpNeV1588aW5wdXQgdHlwZT0idGVsIiBhdXRvY29tcGxldGU9InRlbCIgbmFtZT0icGhvbmUiIHJlcXVpcmVkIG1pbmxlbmd0aD0iNyIgcGxhY2Vob2xkZXI9IjA1MC0wMDAwMDAwIj48L2xhYmVsPjxsYWJlbD7Xk9eV15DXtNecINec16fXkdec16og16HXmdeb15XXnTxpbnB1dCB0eXBlPSJlbWFpbCIgYXV0b2NvbXBsZXRlPSJlbWFpbCIgbmFtZT0iZW1haWwiIHJlcXVpcmVkIHBsYWNlaG9sZGVyPSJuYW1lQGV4YW1wbGUuY29tIj48L2xhYmVsPjwvZm9ybT48ZGl2IGNsYXNzPSJoYW0tY2FydC1jaGVja291dC1icmVha2Rvd24iPjxzcGFuPiR7Y291bnQoKX0g16TXqNeZ15jXmdedINeR16HXnDwvc3Bhbj48c3Ryb25nPiR7Y3VycmVuY3koZ3JhbmRUb3RhbCgpKX08L3N0cm9uZz48L2Rpdj48cCBjbGFzcz0iaGFtLWNhcnQtbm90ZSI+15bXldeU15kg15TXk9ee15nXmdeqINeq16nXnNeV150g15HXnNeR15MuINeQ15nXnyDXl9eZ15HXldeoINec16HXnNeZ16fXlCwg15zXkCDXnteq15HXpteiINeX15nXldeRINeV15zXkCDXoNeo16nXnteZ150g157Xqdeq16rXpNeZ150g15HXqdeo16ouPC9wPjwvZGl2PmA7CiBhY3RpdmVEaWFsb2cuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJoYW0tY2FydC1zaGVsbCIgZGlyPSJydGwiPjxoZWFkZXIgY2xhc3M9ImhhbS1jYXJ0LXRvcCI+PGRpdiBjbGFzcz0iaGFtLWNhcnQtaGVhZGluZyI+PHNwYW4gY2xhc3M9ImhhbS1jYXJ0LW1hcmsiPiR7c3ZnfTwvc3Bhbj48ZGl2PjxzbWFsbD5IQU1PTllNIMK3INeh15wg157XqdeV16rXozwvc21hbGw+PGgyPiR7bW9kZT09PSdjYXJ0Jz8n16HXnCDXlNen16DXmdeV16og16nXnNeZJzon16HXmdeb15XXnSDXldee16LXkdeoINec16rXqdec15XXnSd9PC9oMj48L2Rpdj48L2Rpdj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgY2xhc3M9ImhhbS1jYXJ0LWNsb3NlIiBkYXRhLWhhbS1jYXJ0LWNsb3NlIGFyaWEtbGFiZWw9Iteh15LXmdeo16og15TXodecIj7DlzwvYnV0dG9uPjwvaGVhZGVyPjxkaXYgY2xhc3M9ImhhbS1jYXJ0LWJvZHkiPiR7bW9kZT09PSdjYXJ0Jz9jYXJ0Qm9keTpjaGVja291dEJvZHl9PC9kaXY+JHtmZWVkYmFjaz9gPGRpdiBjbGFzcz0iaGFtLWNhcnQtZmVlZGJhY2siIHJvbGU9InN0YXR1cyI+JHtjbGVhbihmZWVkYmFjayl9PC9kaXY+YDonJ308Zm9vdGVyIGNsYXNzPSJoYW0tY2FydC1mb290ZXIiPiR7bW9kZT09PSdjYXJ0Jz9gPGJ1dHRvbiBjbGFzcz0iaGFtLWNhcnQtc2Vjb25kYXJ5IiB0eXBlPSJidXR0b24iIGRhdGEtaGFtLWNhcnQtY2xvc2U+15TXntep15og15HXp9ee16TXmdeZ1588L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJoYW0tY2FydC1wcmltYXJ5IiB0eXBlPSJidXR0b24iIGRhdGEtaGFtLWNhcnQtY2hlY2tvdXQgJHtkaXNhYmxlZD8nZGlzYWJsZWQnOicnfT7Xntei15HXqCDXnNeq16nXnNeV150gPHNwYW4+4oaQPC9zcGFuPjwvYnV0dG9uPmA6YDxidXR0b24gY2xhc3M9ImhhbS1jYXJ0LXByaW1hcnkiIHR5cGU9ImJ1dHRvbiIgZGF0YS1oYW0tY2FydC1maW5pc2g+15TXntep15og15zXodec15nXp9eUIMK3INeU15PXktee15Qg15HXnNeR15MgPHNwYW4+4oaQPC9zcGFuPjwvYnV0dG9uPmB9PC9mb290ZXI+PC9kaXY+YDsKfQpmdW5jdGlvbiBvcGVuKGNoZWNrb3V0PWZhbHNlKXsKIGNvbnN0IG9sZD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGFtVW5pZmllZENhcnREaWFsb2cnKTtpZihvbGQpe3RyeXtvbGQuY2xvc2UoKTt9Y2F0Y2goXyl7fW9sZC5yZW1vdmUoKTt9CiBhY3RpdmVEaWFsb2c9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGlhbG9nJyk7YWN0aXZlRGlhbG9nLmlkPSdoYW1VbmlmaWVkQ2FydERpYWxvZyc7YWN0aXZlRGlhbG9nLmNsYXNzTmFtZT0naGFtLWNhcnQtcGFuZWwnO2FjdGl2ZURpYWxvZy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCfXodecINeU16fXoNeZ15XXqiDXqdecINeU16fXntek15nXmdefJyk7ZG9jdW1lbnQuYm9keS5hcHBlbmQoYWN0aXZlRGlhbG9nKTsKIG1vZGU9Y2hlY2tvdXQmJmVudHJpZXMubGVuZ3RoPydjaGVja291dCc6J2NhcnQnO2ZlZWRiYWNrPScnO2RyYXcoKTsKIGNvbnN0IGRpYWxvZz1hY3RpdmVEaWFsb2c7CiBkaWFsb2cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLGU9PnsKICBpZihlLnRhcmdldD09PWRpYWxvZ3x8ZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtaGFtLWNhcnQtY2xvc2VdJykpe2RpYWxvZy5jbG9zZSgpO3JldHVybjt9CiAgY29uc3QgcmVtPWUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWhhbS1jYXJ0LXJlbW92ZV0nKTtpZihyZW0pe2VudHJpZXMuc3BsaWNlKE51bWJlcihyZW0uZGF0YXNldC5oYW1DYXJ0UmVtb3ZlKSwxKTtyZWZyZXNoKCk7ZHJhdygpO3JldHVybjt9CiAgY29uc3QgcGx1cz1lLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1oYW0tY2FydC1xdHldJyk7aWYocGx1cyl7Y29uc3QgaT1OdW1iZXIocGx1cy5kYXRhc2V0LmhhbUNhcnRRdHkpLGl0ZW09ZW50cmllc1tpXTtpZighaXRlbSlyZXR1cm47Y29uc3QgcT1NYXRoLm1heCgxLChpdGVtLnF0eXx8MSkrTnVtYmVyKHBsdXMuZGF0YXNldC5kZWx0YSkpO2NvbnN0IG9yaWdpbmFsPXNvdXJjZSgpLmNvbnRlbnQ/LnJld2FyZHM/Lml0ZW1zPy5baXRlbS5zb3VyY2VJbmRleF07aWYoaXRlbS5raW5kPT09J3Jld2FyZCcmJm9yaWdpbmFsPy5zdG9ja0VuYWJsZWQmJnE+TnVtYmVyKG9yaWdpbmFsLnF1YW50aXR5fHwwKSl7bm90aWZ5KCfXnNeQINeg15nXqtefINec16LXkdeV16gg15DXqiDXlNee15zXkNeZINeU15bXnteZ158nKTtyZXR1cm47fWl0ZW0ucXR5PXE7cmVmcmVzaCgpO2RyYXcoKTtyZXR1cm47fQogIGlmKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWhhbS1jYXJ0LWNoZWNrb3V0XScpKXttb2RlPSdjaGVja291dCc7ZmVlZGJhY2s9Jyc7ZHJhdygpO3JldHVybjt9CiAgaWYoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtaGFtLWNhcnQtYmFja10nKSl7bW9kZT0nY2FydCc7ZmVlZGJhY2s9Jyc7ZHJhdygpO3JldHVybjt9CiAgaWYoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtaGFtLWNhcnQtZmluaXNoXScpKXsKICAgY29uc3QgZm9ybT1kaWFsb2cucXVlcnlTZWxlY3RvcignI2hhbUNhcnRDaGVja291dEZvcm0nKTtpZighZm9ybT8ucmVwb3J0VmFsaWRpdHkoKSlyZXR1cm47CiAgIGZlZWRiYWNrPSfXlNek16jXmNeZ150g15TXldeW16DXlSDXkdeU16bXnNeX15Qg15zXlNeT15LXnteULiDXkdep15zXkSDXlteUINeQ15nXnyDXodec15nXp9eUINek16LXmdec15QsINec15Ag15HXldem16Ig15fXmdeV15Eg15XXnNeQINeg15XXpteo15Qg15TXltee16DXlC4nOwogICBkcmF3KCk7ZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5oYW0tY2FydC1mZWVkYmFjaycpPy5zY3JvbGxJbnRvVmlldyh7YmxvY2s6J25lYXJlc3QnLGJlaGF2aW9yOidzbW9vdGgnfSk7CiAgfQogfSk7CiBkaWFsb2cuYWRkRXZlbnRMaXN0ZW5lcignY2xvc2UnLCgpPT57aWYoYWN0aXZlRGlhbG9nPT09ZGlhbG9nKWFjdGl2ZURpYWxvZz1udWxsO2RpYWxvZy5yZW1vdmUoKTt9KTsKIGRpYWxvZy5zaG93TW9kYWwoKTtkaWFsb2cucXVlcnlTZWxlY3RvcignLmhhbS1jYXJ0LWNsb3NlJyk/LmZvY3VzKHtwcmV2ZW50U2Nyb2xsOnRydWV9KTsKfQpmdW5jdGlvbiBwdWJsaWNSYWNlKGluZGV4KXsKIGNvbnN0IHI9c291cmNlKCkubWFuYWdlbWVudD8ubW9kdWxlcz8ucmFjZXM/Lml0ZW1zPy5baW5kZXhdO2lmKCFyKXJldHVybjsKIGNvbnN0IG9wdGlvbnM9KHIudXNlUmVnaXN0cmF0aW9uVHlwZXMmJkFycmF5LmlzQXJyYXkoci5yZWdpc3RyYXRpb25UeXBlcyk/ci5yZWdpc3RyYXRpb25UeXBlczpbXSkuZmlsdGVyKHg9PngudGl0bGUpfHxbe2lkOidiYXNlJyx0aXRsZTon15TXqNep157XlCDXqNeS15nXnNeUJyxwcmljZTpOdW1iZXIoci5wcmljZSl8fDB9XTsKIGNvbnN0IGQ9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGlhbG9nJyk7ZC5jbGFzc05hbWU9J2hhbS1jYXJ0LXJhY2UtbW9kYWwnO2QuaW5uZXJIVE1MPWA8Zm9ybSBtZXRob2Q9ImRpYWxvZyIgZGlyPSJydGwiPjxkaXYgY2xhc3M9ImhhbS1jYXJ0LXJhY2UtaGVhZCI+PGgyPteU16jXqdee15Qg15wke2NsZWFuKHIudGl0bGV8fCfXnteZ16jXldelJyl9PC9oMj48YnV0dG9uIHZhbHVlPSJjYW5jZWwiIGFyaWEtbGFiZWw9Iteh15LXmdeo15QiIHR5cGU9InN1Ym1pdCI+w5c8L2J1dHRvbj48L2Rpdj48bGFiZWw+16HXldeSINeU16jXqdee15Q8c2VsZWN0IG5hbWU9InR5cGUiPiR7b3B0aW9ucy5tYXAoKHYsaSk9PmA8b3B0aW9uIHZhbHVlPSIke2l9Ij4ke2NsZWFuKHYudGl0bGUpfSDCtyAke2N1cnJlbmN5KHYucHJpY2UpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+PGxhYmVsPtee16HXpNeoINee16nXqteq16TXmdedPGlucHV0IG5hbWU9InF0eSIgdHlwZT0ibnVtYmVyIiBpbnB1dG1vZGU9Im51bWVyaWMiIG1pbj0iMSIgbWF4PSIke01hdGgubWF4KDEsTnVtYmVyKHIubWF4UGVyT3JkZXIpfHw5OSl9IiB2YWx1ZT0iMSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWw+16nXnSDXkNeZ16kg16fXqdeoPGlucHV0IG5hbWU9ImNvbnRhY3QiIHJlcXVpcmVkIG1pbmxlbmd0aD0iMiIgcGxhY2Vob2xkZXI9Itep150g157XnNeQIj48L2xhYmVsPjxkaXYgY2xhc3M9ImhhbS1jYXJ0LXJhY2UtYWN0aW9ucyI+PGJ1dHRvbiB2YWx1ZT0iY2FuY2VsIiB0eXBlPSJzdWJtaXQiPteR15nXmNeV15w8L2J1dHRvbj48YnV0dG9uIHZhbHVlPSJhZGQiIHR5cGU9InN1Ym1pdCI+15TXldeh16TXlCDXnNeh15w8L2J1dHRvbj48YnV0dG9uIHZhbHVlPSJjaGVja291dCIgdHlwZT0ic3VibWl0Ij7XnNeq16nXnNeV150g16LXm9ep15nXlTwvYnV0dG9uPjwvZGl2PjxzbWFsbD7XlNeT157XmdeUINeR15zXkdeTIMK3INeQ15nXnyDXqNeZ16nXldedINeQ157Xmdeq15kg15zXnteZ16jXldelLjwvc21hbGw+PC9mb3JtPmA7CiBkb2N1bWVudC5ib2R5LmFwcGVuZChkKTtkLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywoKT0+e2NvbnN0IGFjdGlvbj1kLnJldHVyblZhbHVlO2lmKGFjdGlvbj09PSdhZGQnfHxhY3Rpb249PT0nY2hlY2tvdXQnKXtjb25zdCBmPWQucXVlcnlTZWxlY3RvcignZm9ybScpLG9wdD1vcHRpb25zW051bWJlcihmLmVsZW1lbnRzLnR5cGUudmFsdWUpXSxxdHk9TWF0aC5taW4oOTksTWF0aC5tYXgoMSxOdW1iZXIoZi5lbGVtZW50cy5xdHkudmFsdWUpfHwxKSk7Y29uc3QgcGVyc29uPWYuZWxlbWVudHMuY29udGFjdC52YWx1ZS50cmltKCk7aWYocGVyc29uKXthZGRSYWNlKHtyYWNlSW5kZXg6aW5kZXgsdGl0bGU6ci50aXRsZSx0eXBlOm9wdC50aXRsZSx1bml0UHJpY2U6b3B0LnByaWNlLHF0eSxjb250YWN0OntuYW1lOnBlcnNvbn0scGFydGljaXBhbnRzOkFycmF5LmZyb20oe2xlbmd0aDpxdHl9LCgpPT4oe2Z1bGxOYW1lOnBlcnNvbn0pKX0pO2lmKGFjdGlvbj09PSdjaGVja291dCcpb3Blbih0cnVlKTt9fWQucmVtb3ZlKCk7fSk7ZC5zaG93TW9kYWwoKTsKfQpmdW5jdGlvbiByZXNldCgpe2VudHJpZXM9W107cmVmcmVzaCgpO2lmKGFjdGl2ZURpYWxvZylkcmF3KCk7fQpmdW5jdGlvbiBleHBvcnRDYXJ0KCl7cmV0dXJuIGVudHJpZXMubWFwKHg9Pih7Li4ueCxwYXJ0aWNpcGFudHM6eC5wYXJ0aWNpcGFudHM/Lm1hcChwPT4oey4uLnB9KSksY29udGFjdDp4LmNvbnRhY3Q/ey4uLnguY29udGFjdH06bnVsbH0pKTt9CndpbmRvdy5oYW1VbmlmaWVkQ2FydD17bW91bnQscmVmcmVzaCxhZGRSZXdhcmQsYWRkRG9uYXRpb24sYWRkUmFjZSxvcGVuLHJlc2V0LGV4cG9ydENhcnR9Owpkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsZT0+ewogY29uc3QgYj1lLnRhcmdldC5jbG9zZXN0KCdidXR0b24nKTtpZighYilyZXR1cm47CiBpZihiLmhhc0F0dHJpYnV0ZSgnZGF0YS1oYW0tY2FydC10cmlnZ2VyJykpe2UucHJldmVudERlZmF1bHQoKTtlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO29wZW4oZmFsc2UpO3JldHVybjt9CiBpZihiLmhhc0F0dHJpYnV0ZSgnZGF0YS1oYW0tZGV0YWlsLXNlbGVjdCcpKXsKICBjb25zdCBpbmRleD1OdW1iZXIoYi5kYXRhc2V0LmhhbURldGFpbEluZGV4KTtpZihOdW1iZXIuaXNJbnRlZ2VyKGluZGV4KSYmYWRkUmV3YXJkKGluZGV4KSl7CiAgIHRyeXtpZih0eXBlb2YgY2xvc2VIYW1SZXdhcmREZXRhaWxzPT09J2Z1bmN0aW9uJyljbG9zZUhhbVJld2FyZERldGFpbHMoKTt9Y2F0Y2goXyl7fQogIH0KICBlLnByZXZlbnREZWZhdWx0KCk7ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtyZXR1cm47CiB9CiBpZihiLm1hdGNoZXMoJy5yZXdhcmQtdGlsZSBidXR0b25bZGF0YS1kb25hdGVdJykpewogIGNvbnN0IGNhcmQ9Yi5jbG9zZXN0KCdbZGF0YS1yZXdhcmQtaW5kZXhdJyk7aWYoY2FyZClhZGRSZXdhcmQoTnVtYmVyKGNhcmQuZGF0YXNldC5yZXdhcmRJbmRleCkpOwogIGUucHJldmVudERlZmF1bHQoKTtlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO3JldHVybjsKIH0KIGlmKGIuaGFzQXR0cmlidXRlKCdkYXRhLWRvbmF0aW9uLWNvbnRpbnVlJykpewogIGlmKGFkZERvbmF0aW9uKGIuY2xvc2VzdCgnLmRvbmF0aW9uLWJveCcpKSlvcGVuKGZhbHNlKTsKICBlLnByZXZlbnREZWZhdWx0KCk7ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtyZXR1cm47CiB9CiBpZihiLmhhc0F0dHJpYnV0ZSgnZGF0YS1yYWNlLXJlZ2lzdGVyJykpewogIC8vIFRoZSBmdWxsIGVkaXRvciBoYXMgaXRzIG93biBtdWx0aS1zdGVwIHBhcnRpY2lwYW50IHdpemFyZC4gU3RhbmRhbG9uZSBwYWdlcwogIC8vIHVzZSBhIGNvbXBhY3QgcmVnaXN0cmF0aW9uIGNob29zZXIgYW5kIGZlZWQgdGhlIHNhbWUgc2hhcmVkIGNhcnQuCiAgaWYodHlwZW9mIHJhY2VSZWdpc3RyYXRpb25EaWFsb2chPT0nZnVuY3Rpb24nKXtwdWJsaWNSYWNlKE51bWJlcihiLmRhdGFzZXQucmFjZVJlZ2lzdGVyKSk7ZS5wcmV2ZW50RGVmYXVsdCgpO2Uuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7fQogIHJldHVybjsKIH0KIGlmKGIuaGFzQXR0cmlidXRlKCdkYXRhLWhhbS1jYXJ0LXF1aWNrLWNoZWNrb3V0Jykpe2UucHJldmVudERlZmF1bHQoKTtlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO29wZW4odHJ1ZSk7cmV0dXJuO30KfSx0cnVlKTsKLy8gU3RhbmRhbG9uZSBwYWdlJ3MgcmV3YXJkLWNhcmQgZGV0YWlscyBhcmUgbm90IGJhY2tlZCBieSB0aGUgZWRpdG9yIGRpYWxvZy4KaWYoc2VlZClkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsZT0+ewogY29uc3QgY2FyZD1lLnRhcmdldC5jbG9zZXN0KCcucmV3YXJkLXRpbGVbZGF0YS1yZXdhcmQtaW5kZXhdJyk7aWYoIWNhcmR8fGUudGFyZ2V0LmNsb3Nlc3QoJ2J1dHRvbicpKXJldHVybjsKIGNvbnN0IGlkeD1OdW1iZXIoY2FyZC5kYXRhc2V0LnJld2FyZEluZGV4KSxpdGVtPXNvdXJjZSgpLmNvbnRlbnQ/LnJld2FyZHM/Lml0ZW1zPy5baWR4XTtpZighaXRlbSlyZXR1cm47CiBjb25zdCBkPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpYWxvZycpO2QuY2xhc3NOYW1lPSdoYW0tY2FydC1yZXdhcmQtbW9kYWwnO2QuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJoYW0tY2FydC1yZXdhcmQtdmlldyIgZGlyPSJydGwiPjxidXR0b24gdHlwZT0iYnV0dG9uIiBkYXRhLWRpc21pc3MgYXJpYS1sYWJlbD0i16HXkteV16giPsOXPC9idXR0b24+PHNwYW4+16rXqdeV16jXlCDXnNen157XpNeZ15nXnzwvc3Bhbj48aDI+JHtjbGVhbihpdGVtLm5hbWUpfTwvaDI+PHA+JHtjbGVhbihpdGVtLmRlc2NyaXB0aW9ufHwnJyl9PC9wPjxzdHJvbmc+JHtjdXJyZW5jeShpdGVtLmFtb3VudCl9PC9zdHJvbmc+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGRhdGEtcGljaz7XlNeV16HXoyDXnNeh15w8L2J1dHRvbj48L2Rpdj5gO2RvY3VtZW50LmJvZHkuYXBwZW5kKGQpO2QuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLGV2PT57aWYoZXYudGFyZ2V0PT09ZHx8ZXYudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRpc21pc3NdJykpZC5jbG9zZSgpO2lmKGV2LnRhcmdldC5jbG9zZXN0KCdbZGF0YS1waWNrXScpKXthZGRSZXdhcmQoaWR4KTtkLmNsb3NlKCk7fX0pO2QuYWRkRXZlbnRMaXN0ZW5lcignY2xvc2UnLCgpPT5kLnJlbW92ZSgpKTtkLnNob3dNb2RhbCgpOwp9LHRydWUpOwptb3VudCgpOwp9KSgpOwo=');
/* v0.1.81: open the rendered public campaign in a real, independent browser tab.
   Reuse the SAME live preview DOM, CSS, uploaded image object URLs and state.
   No server, separate renderer, or editor toolbar is included in the opened tab. */
(function(){
 function publicInteractiveScript(){
  return String.raw`(function(){
    function filterSharedCollection(root){
      if(!root)return;
      var input=root.querySelector('[data-hcc-search]');var query=(input?.value||'').trim().toLocaleLowerCase('he');
      var track=root.querySelector('.hc-items');if(!track)return;
      var all=Array.from(track.querySelectorAll(':scope > .hc-card'));
      all.forEach(function(card){card.hidden=!!query&&!card.textContent.toLocaleLowerCase('he').includes(query)});
      var sort=root.dataset.hccSort||'recent';
      var arranged=all.slice().sort(function(a,b){if(sort==='name')return a.textContent.localeCompare(b.textContent,'he');if(sort==='oldest')return all.indexOf(b)-all.indexOf(a);return all.indexOf(a)-all.indexOf(b)});
      arranged.forEach(function(card){track.appendChild(card)});
    }
    document.addEventListener('input',function(event){if(event.target.hasAttribute('data-hcc-search'))filterSharedCollection(event.target.closest('.hc-content-collection'))});
    document.addEventListener('click',function(event){
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-public-more')){
       const name=button.dataset.publicMore;
       const list=button.parentElement?.querySelector(name==='donors'?'.hc-items':'.ambassador-collection');
       if(list){
        const selector=name==='donors'?'.hc-card':'.ambassador-card';
        const cards=Array.from(list.querySelectorAll(':scope > '+selector));
        const shown=Math.max(0,Number(button.dataset.publicShown)||0);
        const next=Math.min(cards.length,shown+Math.max(1,Number(button.dataset.publicStep)||3));
        cards.slice(shown,next).forEach(card=>card.style.removeProperty('display'));
        button.dataset.publicShown=String(next);
        if(next>=cards.length)button.remove();
       }
       event.preventDefault();return;
      }
      if(button.hasAttribute('data-hcc-sort-trigger')){
       var dropdown=button.nextElementSibling;var opened=dropdown.hidden;
       document.querySelectorAll('.hc-content-sort-menu').forEach(function(m){m.hidden=true});dropdown.hidden=!opened;
       button.setAttribute('aria-expanded',String(opened));event.preventDefault();return;
      }
      if(button.hasAttribute('data-hcc-sort-option')){
       var root=button.closest('.hc-content-collection');if(root){root.dataset.hccSort=button.dataset.sort;root.querySelectorAll('[data-hcc-sort-option]').forEach(function(opt){opt.setAttribute('aria-selected',String(opt===button))});root.querySelector('.hc-content-sort-menu').hidden=true;filterSharedCollection(root);}
       event.preventDefault();return;
      }
      if(button.hasAttribute('data-hc-view')){
       const root=button.closest('.hc-public-collection');
       if(root){root.dataset.hcMode=button.dataset.hcView;root.querySelectorAll('[data-hc-view]').forEach(b=>{const active=b===button;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active))});/* Exported pages have no editor state: use the DOM mode directly. */if(window.HamonymCollection?.carousel)window.HamonymCollection.carousel(root);const nav=root.querySelector('.hc-carousel-nav');if(nav)nav.hidden=button.dataset.hcView!=='carousel';}
       event.preventDefault();return;
      }
      if(button.hasAttribute('data-hc-prev')||button.hasAttribute('data-hc-next')){
       const root=button.closest('.hc-public-collection'),track=root?.querySelector('.hc-items');if(track){const arr=Array.from(track.querySelectorAll(':scope > .hc-card'));const rect=track.getBoundingClientRect();let i=0,best=1e9;arr.forEach((el,j)=>{const d=Math.abs(el.getBoundingClientRect().right-rect.right);if(d<best){best=d;i=j}});let pageSize=2;const next=Math.max(0,Math.min(arr.length-1,i+(button.hasAttribute('data-hc-next')?pageSize:-pageSize)));arr[next]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});}
       event.preventDefault();return;
      }
      if(button.hasAttribute('data-ham-view')){
       const panel=button.closest('.ham-panorama-tab-panel');
       if(panel){panel.dataset.hamViewMode=button.dataset.hamView;panel.querySelectorAll('[data-ham-view]').forEach(b=>{const active=b===button;b.classList.toggle('ham-view-active',active);b.setAttribute('aria-pressed',String(active));});
        if(typeof window.hamPublicRefreshCarousels==='function')window.hamPublicRefreshCarousels();}
       event.preventDefault();return;
      }
      if(button.hasAttribute('data-ham-mobile-tab')){
       const tab=button.dataset.hamMobileTab,host=button.closest('.ham-mobile-content');
       host?.querySelectorAll('[data-ham-mobile-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));
       host?.querySelectorAll('[data-ham-mobile-panel]').forEach(p=>p.hidden=p.dataset.hamMobilePanel!==tab);
       event.preventDefault();return;
      }
      if(button.hasAttribute('data-ham-mobile-view')){
       const panel=button.closest('[data-ham-mobile-panel]');if(panel){panel.dataset.displayMode=button.dataset.hamMobileView;panel.querySelectorAll('[data-ham-mobile-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
       event.preventDefault();return;
      }
      const target=button.getAttribute('data-nav-target')||button.getAttribute('data-menu-item');
      if(button.hasAttribute('data-ham-jump-rewards')){
        const targetTab=document.querySelector('.ham-panorama-tabs [data-ham-panorama-tab="rewards"],.ham-mobile-tabs [data-ham-mobile-tab="rewards"]');
        if(targetTab){targetTab.click();targetTab.closest('.ham-panorama-tabs,.ham-mobile-content')?.scrollIntoView({behavior:'smooth',block:'start'});}
        event.preventDefault();return;
      }
      if(button.hasAttribute('data-ham-panorama-tab')){
        const wrap=button.closest('.ham-panorama-tabs'),id=button.dataset.hamPanoramaTab;
        const story=document.querySelector('.ham-story-article');
        if(story&&story.classList.contains('ham-story-clamped'))story.classList.remove('ham-story-clamped');
        story?.querySelector('[data-ham-story-toggle]')?.setAttribute('aria-expanded','true');
        wrap?.querySelectorAll('[data-ham-panorama-tab]').forEach(b=>{const yes=b.dataset.hamPanoramaTab===id;b.classList.toggle('nav-current',yes);b.setAttribute('aria-selected',String(yes))});
        wrap?.querySelectorAll('[data-ham-panorama-panel]').forEach(p=>p.hidden=p.dataset.hamPanoramaPanel!==id);
        if(story)story.hidden=id!=='story';
        const campaignTitle=document.querySelector('.ham-desktop-story-column > [data-part="title"]');
        if(campaignTitle)campaignTitle.hidden=id!=='story';
        wrap?.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      if(target){
        const wrap=document.querySelector('.ham-panorama-tabs');
        if(wrap&&['story','rewards','donors','ambassadors','comments','updates','sponsors'].includes(target)){
          const targetTab=wrap.querySelector('[data-ham-panorama-tab="'+target+'"]');
          if(targetTab){hamPanoramaSelectTab(target,wrap.closest('#preview'),true);event.preventDefault();return;}
        }
        const section=document.querySelector('[data-part="'+target+'"]');if(section){section.scrollIntoView({behavior:'smooth',block:'start'});event.preventDefault();}return;}
      if(button.hasAttribute('data-ham-story-toggle')){const story=button.closest('.ham-story-article');if(story){const nowClamped=story.classList.toggle('ham-story-clamped');const selected=nowClamped?'donors':'story';const wrap=document.querySelector('.ham-panorama-tabs');button.textContent=nowClamped?'המשך לקרוא ↓':'הצג פחות ↑';button.setAttribute('aria-expanded',String(!nowClamped));wrap?.querySelectorAll('[data-ham-panorama-tab]').forEach(b=>{const yes=b.dataset.hamPanoramaTab===selected;b.classList.toggle('nav-current',yes);b.setAttribute('aria-selected',String(yes))});wrap?.querySelectorAll('[data-ham-panorama-panel]').forEach(p=>p.hidden=p.dataset.hamPanoramaPanel!==selected);if(nowClamped)story.scrollIntoView({behavior:'smooth',block:'start'});}return;}
      if(button.hasAttribute('data-donation-choice')){const group=button.closest('.donation-box');group?.querySelectorAll('[data-donation-choice],[data-donation-other]').forEach(b=>{const yes=b===button;b.classList.toggle('is-chosen',yes);b.classList.toggle('donation-selected',yes);b.setAttribute('aria-pressed',String(yes))});group?.querySelector('.donation-custom-entry')?.setAttribute('hidden','');return;}
      if(button.hasAttribute('data-donation-other')){const group=button.closest('.donation-box');group?.querySelectorAll('[data-donation-choice],[data-donation-other]').forEach(b=>{const yes=b===button;b.classList.toggle('is-chosen',yes);b.classList.toggle('donation-selected',yes);b.setAttribute('aria-pressed',String(yes))});const entry=group?.querySelector('.donation-custom-entry');if(entry){entry.hidden=false;entry.querySelector('input')?.focus();}return;}
      if(button.hasAttribute('data-donate')||button.hasAttribute('data-donation-continue')){document.querySelector('[data-part="donationBox"]')?.scrollIntoView({behavior:'smooth',block:'center'});if(button.hasAttribute('data-donation-continue'))alert('תצוגה מקדימה בלבד: התשלום יתבצע באתר הקמפיין לאחר פרסום.');return;}
      if(button.hasAttribute('data-share-copy')||button.hasAttribute('data-copy')){navigator.clipboard?.writeText(location.href).then(()=>alert('הקישור הועתק'));return;}
      if(button.hasAttribute('data-share')){const box=button.closest('.campaign-share');const choices=box?.querySelector('.share-options');if(choices)choices.hidden=!choices.hidden;return;}
      const slide=button.getAttribute('data-ham-slide-nav');const dot=button.getAttribute('data-ham-slide-dot');
      if(slide!==null||dot!==null){const hero=button.closest('.hero');const images=[...(hero?.querySelectorAll('.ham-hero-slide')||[])];if(!images.length)return;let index=images.findIndex(i=>i.classList.contains('is-active'));index=dot!==null?Number(dot):(index+(slide==='next'?1:-1)+images.length)%images.length;images.forEach((img,i)=>img.classList.toggle('is-active',i===index));hero.querySelectorAll('[data-ham-slide-dot]').forEach((b,i)=>b.classList.toggle('is-active',i===index));const count=hero.querySelector('.ham-hero-slide-count');if(count)count.textContent=(index+1)+' / '+images.length;return;}
    });
  })();`;
 }
 // Reliable browser-preview fallback when a sandbox or popup blocker denies a new tab.
 function showInlineCampaignPreview(previewClone){
   document.getElementById('hamStandaloneFallback')?.remove();
   const layer=document.createElement('div');layer.id='hamStandaloneFallback';
   layer.style.cssText='position:fixed!important;inset:0!important;z-index:2147483647!important;background:#fdfcf9!important;overflow:auto!important;direction:rtl!important';
   const bar=document.createElement('div');bar.style.cssText='position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #dce6e0;display:flex;align-items:center;justify-content:space-between;padding:10px 20px;gap:16px';
   const label=document.createElement('strong');label.textContent='תצוגת הקמפיין · חלון מלא';
   const close=document.createElement('button');close.type='button';close.textContent='× חזרה לעריכה';close.style.cssText='border:1px solid #dce6e0;background:#fff;padding:9px 14px;border-radius:10px;cursor:pointer;color:#214e43';
   close.addEventListener('click',()=>layer.remove());bar.append(label,close);
   const body=document.createElement('div');body.style.cssText='max-width:1240px;margin:auto;min-height:100vh';
   const view=previewClone.cloneNode(true);view.classList.remove('selected');
   for(const [key,val] of Object.entries({width:'100%',maxWidth:'none',height:'auto',minHeight:'100vh',maxHeight:'none',overflow:'visible',margin:'0 auto',transform:'none',zoom:'1',border:'none',boxShadow:'none',borderRadius:'0'}))view.style.setProperty(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),val,'important');
   body.append(view);layer.append(bar,body);document.body.append(layer);
 }
 function openStandaloneCampaign(downloadOnly=false){
  // Reserve the new tab immediately inside the user's click. Constructing the
  // full campaign HTML takes long enough to expire popup user activation.
  // Never turn "Open in browser" into an unexpected download.
  let newTab=null;
  if(!downloadOnly){
   try{newTab=window.open('','_blank');}
   catch(error){console.warn('Campaign preview popup blocked',error);}
   if(!newTab){console.warn('Popup blocked; using an in-page full-screen campaign preview.');}
   try{
    newTab.document.title='HAMONYM — תצוגת קמפיין';
    newTab.document.body.innerHTML='<p style="font:16px Arial;direction:rtl;padding:40px">טוען תצוגת קמפיין...</p>';
   }catch(_){}
  }
  const source=document.getElementById('preview');if(!source){try{newTab?.close();}catch(_){} alert('לא נמצאה תצוגת קמפיין');return;}
  // The new tab should show a real DESKTOP layout, not a 390px editor phone.
  // If the user explicitly selected Mobile, keep that view as-is for inspection.
  const wasDevice=typeof device!=='undefined'?device:'desktop';
  const shouldUseDesktop=wasDevice==='mobile'&&window.innerWidth>=700;
  let savedScroll=source.scrollTop;
  try{if(shouldUseDesktop){device='desktop';renderPreview();}}
  catch(error){console.error('Could not render desktop snapshot',error);}
  // Public page: snapshot complete permitted lists, then collapse their extras.
  const previousDonorsExtra=collections.donors.extra;
  try{collections.donors.extra=10000;renderPreview();}
  catch(error){console.warn('Could not prepare public lists',error);}
  const clone=document.getElementById('preview').cloneNode(true);
  const publicLists=[
   ['donors','.hc-items','.hc-card',Math.max(1,Number(campaignState.current.content?.donors?.count)||3),'הצגת תורמים נוספים'],
   ['ambassadors','.ambassador-collection','.ambassador-card',Math.max(2,Number(campaignState.current.content?.ambassadors?.count)||4),'הצגת שגרירים נוספים']
  ];
  for(const [name,containerSel,itemSel,limit,label] of publicLists){
   const content=clone.querySelector('[data-part="'+name+'"]');
   const list=content?.querySelector(containerSel);
   if(!list)continue;
   const children=Array.from(list.querySelectorAll(':scope > '+itemSel));
   children.forEach((item,i)=>{item.dataset.publicIndex=String(i);if(i>=limit && !(name==='donors'&&content.querySelector('.hc-public-collection[data-hc-mode="carousel"]')))item.style.setProperty('display','none','important');});
   content.querySelectorAll('[data-load],[data-amb-more]').forEach(button=>button.remove());
   if(children.length>limit && !(name==='donors'&&content.querySelector('.hc-public-collection[data-hc-mode="carousel"]'))){
    const more=document.createElement('button');more.type='button';more.className=name==='donors'?'load-more donors-more':'ambassador-more';
    more.dataset.publicMore=name;more.dataset.publicShown=String(limit);
    more.dataset.publicStep=name==='donors'?'3':'4';more.textContent=label;
    list.after(more);
   }
  }
  collections.donors.extra=previousDonorsExtra;
  try{renderPreview();source.scrollTop=savedScroll;}catch(error){console.warn('Could not restore editor preview',error);}
  clone.querySelectorAll('.selected,.is-inspected').forEach(el=>el.classList.remove('selected','is-inspected'));
  // Editor-only contextual pencil must never appear in the public campaign.
  clone.querySelectorAll('.ham-preview-edit-launcher').forEach(el=>el.remove());
  clone.querySelectorAll('.ham-preview-edit-hover').forEach(el=>el.classList.remove('ham-preview-edit-hover'));
  const embeddedStyles=[...document.querySelectorAll('style')].map(node=>node.outerHTML).join('\n');
  const linkedStyles=[...document.querySelectorAll('link[rel="stylesheet"]')].map(node=>node.outerHTML).join('\n');
  if(shouldUseDesktop){device=wasDevice;try{renderPreview();source.scrollTop=savedScroll;}catch(error){console.warn(error);}}
  const title=String(campaignState.current?.content?.hero?.title||'קמפיין המונים');
  const safeTitle=title.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeBase=String(document.baseURI||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const viewCss=`html{scroll-behavior:smooth} body{margin:0!important;background:#fdfcf9!important;min-height:100vh!important;overflow:auto!important;direction:rtl} #preview.preview{width:min(1240px,100%)!important;max-width:none!important;height:auto!important;min-height:100vh!important;max-height:none!important;overflow:visible!important;margin:0 auto!important;box-shadow:none!important;border:0!important;border-radius:0!important;transition:none!important;transform:none!important;zoom:1!important} #preview.preview.mobile{width:390px!important;max-width:100%!important;min-height:700px!important} #preview .editable:hover{outline:none!important} #preview .selected{outline:none!important} #preview .donation-box .donation-amount.is-chosen,#preview .donation-box .donation-amount.donation-selected{border-color:var(--db-accent,var(--primary,#246f65))!important;background:color-mix(in srgb,var(--db-accent,var(--primary,#246f65)) 15%,white)!important;box-shadow:inset 0 0 0 1px var(--db-accent,var(--primary,#246f65)),0 0 0 2px rgba(36,111,101,.18)!important} [data-part]{scroll-margin-top:85px}`;
  // Include the identical cart engine and a static copy of campaign data in public HTML.
  // Nothing here can initiate a real charge.
  const cartSeed=JSON.stringify({campaign:campaignState.current,cart:window.hamUnifiedCart?.exportCart?.()||[]}).replace(/</g,'\\u003c');
  const cartScripts='<script type="application/json" id="ham-cart-seed">'+cartSeed+'<'+'/script><script>'+hamCartEngineScript+'<'+'/script>';
    const standaloneCarouselScript="\n(function(){\n if(window.__hamV01110CarouselFixApplied)return;\n window.__hamV01110CarouselFixApplied=true;\n const panelSelector='#preview.preview.desktop.layout-panorama .ham-panorama-tab-panel';\n const listSelector='.donors-items,.ambassador-collection,.ham-comment-grid,.ham-update-grid';\n function itemNodes(track){return Array.from(track.children).filter(el=>el.nodeType===1);}\n function visibleCount(track){\n   const items=itemNodes(track); if(!items.length) return 1;\n   const first=items[0].getBoundingClientRect().width || 1;\n   const gap=parseFloat(getComputedStyle(track).gap||12)||12;\n   return Math.max(1, Math.round((track.clientWidth + gap)/(first + gap)));\n }\n function nearestIndex(track){\n   const items=itemNodes(track); if(!items.length) return 0;\n   const right=track.getBoundingClientRect().right; let best=0,dist=Infinity;\n   items.forEach((el,i)=>{const d=Math.abs(el.getBoundingClientRect().right-right); if(d<dist){dist=d; best=i;}});\n   return best;\n }\n function goTo(wrap, target){\n   const track=wrap.querySelector('.ham-inline-carousel-track'); if(!track) return;\n   const items=itemNodes(track); if(!items.length) return;\n   const max=Math.max(0, items.length - visibleCount(track));\n   const index=Math.max(0, Math.min(max, target));\n   const diff=items[index].getBoundingClientRect().right - track.getBoundingClientRect().right;\n   track.scrollBy({left:diff, behavior:'smooth'});\n   wrap.dataset.hamIndex=String(index);\n   requestAnimationFrame(()=>updateWrap(wrap));\n }\n function updateWrap(wrap){\n   const track=wrap.querySelector('.ham-inline-carousel-track'); if(!track) return;\n   const items=itemNodes(track); const visible=visibleCount(track); const max=Math.max(0, items.length-visible);\n   const idx=Math.max(0, Math.min(max, nearestIndex(track)));\n   wrap.dataset.hamIndex=String(idx);\n   wrap.classList.toggle('no-nav', max<=0);\n   const prev=wrap.querySelector('.ham-inline-arrow.prev'); const next=wrap.querySelector('.ham-inline-arrow.next');\n   if(prev) prev.disabled = idx<=0;\n   if(next) next.disabled = idx>=max;\n }\n function ensureWrap(panel){\n   const track=panel.querySelector(listSelector); if(!track) return;\n   let wrap=track.parentElement;\n   if(!wrap.classList.contains('ham-inline-carousel')){\n     wrap=document.createElement('div'); wrap.className='ham-inline-carousel';\n     track.before(wrap); wrap.appendChild(track);\n     const mk=(cls,label,path)=>{const b=document.createElement('button'); b.type='button'; b.className='ham-inline-arrow '+cls; b.setAttribute('aria-label',label); b.innerHTML='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"'+path+'\"/></svg>'; wrap.appendChild(b); return b;};\n     const prev=mk('prev','הקודם','m9 18 6-6-6-6');\n     const next=mk('next','הבא','m15 18-6-6 6-6');\n     prev.addEventListener('click',e=>{e.preventDefault(); e.stopPropagation(); goTo(wrap, (Number(wrap.dataset.hamIndex)||0)-1);});\n     next.addEventListener('click',e=>{e.preventDefault(); e.stopPropagation(); goTo(wrap, (Number(wrap.dataset.hamIndex)||0)+1);});\n     track.addEventListener('scroll',()=>requestAnimationFrame(()=>updateWrap(wrap)), {passive:true});\n   }\n   track.classList.add('ham-inline-carousel-track');\n   updateWrap(wrap);\n }\n function refreshAll(){\n   document.querySelectorAll(panelSelector).forEach(panel=>{\n     if(panel.dataset.hamViewMode==='carousel') ensureWrap(panel);\n   });\n }\n window.hamPublicRefreshCarousels=refreshAll;\n window.addEventListener('resize', refreshAll);\n document.addEventListener('click', function(e){\n   if(e.target.closest(panelSelector+' [data-ham-view]')) setTimeout(refreshAll, 0);\n }, true);\n   if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', refreshAll); else refreshAll();\n})();\n";
const extraPublicCarouselScript="(function(){\nif(window.__ham112Core)return;window.__ham112Core=true;\nconst q=(s,r=document)=>r.querySelector(s);\nconst items=t=>Array.from(t.children).filter(el=>el.nodeType===1&&!el.matches('.ham-mini-arrow'));\nfunction count(t){const ar=items(t);if(!ar.length)return 1;const w=ar[0].getBoundingClientRect().width||t.clientWidth;const gap=parseFloat(getComputedStyle(t).gap)||10;return Math.max(1,Math.min(ar.length,Math.round((t.clientWidth+gap)/(w+gap))||1));}\nfunction maxIndex(t){return Math.max(0,items(t).length-count(t));}\nfunction indexOf(t){const right=t.getBoundingClientRect().right;let best=0,dist=Infinity;items(t).forEach((el,i)=>{if(i>maxIndex(t))return;const d=Math.abs(el.getBoundingClientRect().right-right);if(d<dist){dist=d;best=i;}});return best;}\nfunction refresh(w){const t=q('[data-ham-arrow-track]',w);if(!t)return;const idx=indexOf(t),max=maxIndex(t);w.classList.toggle('ham-no-arrows',max===0);const prev=q('[data-mini-prev]',w),next=q('[data-mini-next]',w);if(prev)prev.disabled=idx<=0;if(next)next.disabled=idx>=max;w.dataset.index=String(idx);}\nfunction go(w,dir){const t=q('[data-ham-arrow-track]',w),ar=items(t);if(!ar.length)return;const i=Math.max(0,Math.min(maxIndex(t),Number(w.dataset.index||0)+dir));w.dataset.index=String(i);const offset=ar[i].getBoundingClientRect().right-t.getBoundingClientRect().right;t.scrollBy({left:offset,behavior:'smooth'});q('[data-mini-prev]',w).disabled=i===0;q('[data-mini-next]',w).disabled=i>=maxIndex(t);}\nfunction attach(track){if(!track||track.closest('.ham-mini-carousel'))return;const w=document.createElement('div');w.className='ham-mini-carousel';track.before(w);w.append(track);track.dataset.hamArrowTrack='1';for(const [attr,arrow,dir] of [['data-mini-prev','›',-1],['data-mini-next','‹',1]]){const b=document.createElement('button');b.type='button';b.className='ham-mini-arrow';b.setAttribute(attr,'');b.setAttribute('aria-label',dir===1?'הבא':'הקודם');b.textContent=arrow;b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();go(w,dir)});w.appendChild(b)}track.addEventListener('scroll',()=>requestAnimationFrame(()=>refresh(w)),{passive:true});refresh(w);}\nfunction install(root=document){\nroot.querySelectorAll('#preview .ham-panorama-tab-panel[data-ham-view-mode=\"carousel\"],#preview .ham-mobile-tab-panel[data-display-mode=\"carousel\"]').forEach(panel=>{const track=q('.donors-items,.ambassador-collection,.ham-comment-grid,.ham-update-grid',panel);if(track)attach(track)});\nroot.querySelectorAll('#preview .ham-carousel-shell').forEach(shell=>{const t=q('.ham-carousel-track',shell);if(t){t.style.setProperty('scrollbar-width','none','important');t.style.setProperty('overflow-x','hidden','important')}});\nroot.querySelectorAll('#preview.preview.mobile .ham-mobile-offers,#preview.preview.mobile [data-part=\"sponsors\"]').forEach(section=>{for(const sel of ['.reward-tiles','.ham-race-grid','.sponsor-grid']){const track=q(sel,section);if(track&&!track.closest('.ham-carousel-stage'))attach(track)}});\n}\nwindow.ham112RefreshCarousels=()=>install(document);\nfunction onViewButton(e){const button=e.target.closest('#preview [data-ham-view],#preview [data-ham-mobile-view]');if(!button)return;const panel=button.closest('.ham-panorama-tab-panel,.ham-mobile-tab-panel');if(!panel)return;const mode=button.dataset.hamView||button.dataset.hamMobileView;if(!mode)return;e.preventDefault();e.stopImmediatePropagation();panel.dataset[panel.classList.contains('ham-mobile-tab-panel')?'displayMode':'hamViewMode']=mode;panel.querySelectorAll('[data-ham-view],[data-ham-mobile-view]').forEach(b=>{const active=(b.dataset.hamView||b.dataset.hamMobileView)===mode;b.classList.toggle('ham-view-active',active);b.setAttribute('aria-pressed',String(active))});if(mode==='carousel')install(panel.ownerDocument);}\ndocument.addEventListener('click',onViewButton,true);\nfunction setup(){install();}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();\nwindow.addEventListener('resize',()=>{document.querySelectorAll('#preview .ham-mini-carousel').forEach(refresh)});\nconst view=document.getElementById('preview');if(view){let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(setup,80)}).observe(view,{childList:true,subtree:true});}\n})();";
  const extraHeaderScript=document.getElementById('ham-v134-header-script')?.textContent||'';
const html='<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safeTitle+' — המונים</title><base href="'+escapeBase+'">'+linkedStyles+embeddedStyles+'<style>'+viewCss+'</style></head><body>'+clone.outerHTML+'<script>'+publicInteractiveScript()+'<'+'/script>'+cartScripts+'<script>'+standaloneCarouselScript+';' + extraPublicCarouselScript+'<'+'/script><script>'+extraHeaderScript+'<'+'/script></body></html>';  // Direct document writing keeps the newly opened tab on its about:blank
  // origin. Navigating a file:// caller to blob: was blocked on some browsers.
  if(downloadOnly){
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='HAMONYM-Campaign-Preview.html';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    return;
  }
  try{
    if(newTab){newTab.document.open();newTab.document.write(html);newTab.document.close();newTab.focus();}
    else showInlineCampaignPreview(clone);
  }catch(error){
    console.error('Could not render campaign preview in tab',error);
    try{newTab.close();}catch(_){}
    showInlineCampaignPreview(clone);
  }

 }
 document.addEventListener('click',event=>{const trigger=event.target.closest('[data-ham-open-public],[data-ham-download-public]');if(!trigger)return;event.preventDefault();event.stopPropagation();openStandaloneCampaign(trigger.hasAttribute('data-ham-download-public'));},true);
})();


// Angular toolbar adapter: preserve engine-owned change/history/persist/render semantics.
window.hamV209LayoutBridge={
 selected:()=>campaignState.current.management?.heroStatsCard?.enabled?'heroCard':'panorama',
 apply:(choice)=>{if(choice!=='panorama'&&choice!=='heroCard')return;change(()=>{campaignState.current.template='panorama';campaignState.current.management ||= {};campaignState.current.management.fullCampaignTemplate='panorama';campaignState.current.management.heroStatsCard ||= {};campaignState.current.management.heroStatsCard.enabled=choice==='heroCard';campaignState.current.management.heroStatsCard.sidebarStyled=false;});toast(choice==='heroCard'?'כרטיס נתוני הגיוס הועבר ל־Hero':'נתוני הגיוס הוחזרו לסיידבר');}
};

}
