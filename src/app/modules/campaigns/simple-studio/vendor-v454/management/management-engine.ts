// @ts-nocheck
// What remains of the original management engine: the glue between the management screen (all
// pages, the calendar and the field handlers are Angular since v4.42) and the campaign core —
// the host-context bridge, the core inspector extras and its listeners, the simple page's studio
// settings markup, the work-mode controller (setMode) and the #huToolbar markup.

// HAMONYM Unified Studio v0.1.21 — single campaign content screen + refined donation controls; full v13.3 editor retained.
import { calendarTriggerMarkup } from './calendar/calendar.service';

export function initializeLegacyManagement(context: any, model: any, view: any, edit: any, mountShell: () => void, mountCalendar: () => void, startInput: () => void): void {
'use strict';
 const q=(s,root=document)=>root.querySelector(s), qa=(s,root=document)=>[...root.querySelectorAll(s)];
 const safe=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
 const {campaignSlug,campaignUrl}=model.lib;
 const nget=p=>model.nget(p), get=p=>model.get(p);
 const confirmField=(p,s)=>model.confirmField(p,s), ensureManagement=()=>model.ensureManagement();
  // Host contract: data handled by the model, then the visible screens are redrawn.
  function setHostContext(ctx={}){model.applyHostContext(ctx);if(q('#huPage')){context.persist();context.renderPreview();context.renderInspector();drawManager();}}
  window.HAMONYM_STUDIO_BRIDGE={setContext:setHostContext};
  if(window.HAMONYM_CONTEXT)setHostContext(window.HAMONYM_CONTEXT);
  model.installPreviewGuidance(()=>updateMeters());
  // v4.54: the management screen's extras at the top of the inspector (the Hero's name, the nonprofit's site) are
  // rendered by InspectorComponent from this data (before: prepended to #fields after each render).
  window.hamInspectorExtras=()=>{
    const out=[];
    if(context.selected()==='hero')out.push({k:'heroName',checked:!!get('content.showHeroName')});
    if(context.selected()==='footer' && nget('organizerType')==='nonprofit')out.push({k:'nonprofit',linked:!!model.linkedOrganizerWebsite,site:String(nget('organizerWebsite')||''),visible:nget('showNonprofitFooterLink')!==false});
    return out;
  };
   const studioPersist=context.persist;
  context.persist=function(...args){context.readState().content.share.url=campaignUrl(campaignSlug(context.readState().content.share.url));const x=studioPersist(...args);updateMeters();return x};
 const studioRender=context.render;
 context.render=function(...args){ensureManagement();const result=studioRender(...args);if(q('#projectTitle'))q('#projectTitle').textContent=get('meta.name')||'קמפיין חדש';if(view.mode()==='management')drawManager();updateMeters();return result};
 const updateMeters=()=>view.updateMeters();
 // Hebrew calendar (CalendarService + CalendarPortalComponent, #huCalendarPortal); the wizard reuses it
 // and the money helpers through this bridge.
 mountCalendar();
 window.hamonymWizardShared={calendarField:(date)=>calendarTriggerMarkup(date,'funding.end'),formatAmount:context.huFormatAmount,readAmount:context.huReadAmount};
 function sw(title,hint,path){return `<label class="hu-switch"><span><strong>${title}</strong><small>${hint}</small></span><input role="switch" data-hu-path="${safe(path)}" type="checkbox" ${get(path)?'checked':''}></label>`}
 function huSimpleDonationOptions(){
   if(context.readState().management?.campaignKind!=='simple')return '';
   const v=context.hamSimpleVisualSettings();
   const opt=(value,label,current)=>`<option value="${value}" ${current===value?'selected':''}>${label}</option>`;
   const check=(key,label)=>`<label class="hsf-editor-check"><input type="checkbox" data-hsf-setting="${key}" ${v[key]?'checked':''}>${label}</label>`;
   const field=(key,label,min,max,step=1)=>`<label class="hsf-editor-field">${label}<input type="number" min="${min}" max="${max}" step="${step}" data-hsf-setting="${key}" value="${Number(v[key])}" /></label>`;
   const hue=(key,label)=>`<label class="hsf-editor-field">${label}<input type="color" data-hsf-setting="${key}" value="${/^#[0-9a-fA-F]{6}$/.test(v[key])?v[key]:'#ffffff'}"></label>`;
   const anchorNames=[['top-right','ימין למעלה'],['top-center','מרכז למעלה'],['top-left','שמאל למעלה'],['middle-right','ימין באמצע'],['middle-center','מרכז'],['middle-left','שמאל באמצע'],['bottom-right','ימין למטה'],['bottom-center','מרכז למטה'],['bottom-left','שמאל למטה']];
   const anchorGrid=(key,label)=>`<div class="hsf-editor-field"><span>${label}</span><div class="hsf-anchor-picker" role="group" aria-label="${label}">${anchorNames.map(([a,n])=>`<button type="button" data-hsf-anchor="${key}" data-hsf-value="${a}" class="${v[key]===a?'active':''}" aria-label="${n}" title="${n}" aria-pressed="${v[key]===a}"><span></span></button>`).join('')}</div></div>`;
   const hero=v.showHeroImage===true||(v.showHeroImage==null&&v.identityMode==='hero');
   return `<section class="hu-simple-identity-settings"><h3>מראה דף התרומה הפשוט</h3><p>ניתן לבחור אזור פתיחה ולהגדיר מיקום ועיצוב בנפרד ללוגו, לכותרת ולכותרת המשנה. שינויים אלה חלים על דף התרומה הפשוט בלבד.</p>
     <label class="hsf-editor-field">סמל אזור הפתיחה<select data-hsf-setting="identityMode">${opt('avatar','אווטאר / לב',v.identityMode==='hero'?'avatar':v.identityMode)}${opt('logo','לוגו הארגון',v.identityMode)}</select></label>${check('showHeroImage','הצגת תמונת Hero כרקע (בלי קשר ללוגו / לב)')}
     ${v.identityMode!=='logo'?`<label class="hsf-editor-field">סמל האווטאר<select data-hsf-setting="avatarSymbol">${opt('heart','לב',v.avatarSymbol)}${opt('star','כוכב',v.avatarSymbol)}${opt('hand','יד תומכת',v.avatarSymbol)}</select></label>${hue('avatarColor','צבע הסמל')}`:''}
     ${hero?check('showHeroLogo','הצגת הלוגו או הלב על התמונה'):''}
     ${anchorGrid(hero?'heroLogoAnchor':'logoAnchor',hero?'מיקום הלוגו על התמונה':'מיקום הלוגו / האווטאר')}
     ${field('avatarSize','גודל הלוגו / האווטאר (px)',28,90)}
     ${anchorGrid(hero?'heroTitleAnchor':'titleAnchor','מיקום הכותרת')}
     ${field('titleFontSize','גודל כותרת (px)',12,40)}${field('titleWeight','עובי כותרת',400,900,100)}${hue(hero?'heroTitleColor':'titleColor','צבע הכותרת')}
     ${anchorGrid(hero?'heroSubtitleAnchor':'subtitleAnchor','מיקום כותרת המשנה')}
     ${field('subtitleFontSize','גודל כותרת משנה (px)',10,28)}${field('subtitleWeight','עובי כותרת משנה',400,900,100)}${hue(hero?'heroSubtitleColor':'subtitleColor','צבע כותרת המשנה')}
     ${hero?field('heroHeight','גובה Hero (px)',140,310):''}
     <h3>צבעי דף התרומה</h3>
     ${hue('pageColor','רקע הדף')}${hue('cardColor','רקע הכרטיס')}${hue('amountSelectedColor','רקע סכום שנבחר')}${hue('continueButtonColor','צבע כפתור ההמשך')}
     ${check('showSteps','הצגת שלבי התרומה')}
     <p>הכותרת היא שם הקמפיין. שורת המשנה מציגה קודם כותרת משנה, ואם אין כותרת משנה — את התיאור הקצר. אין חובה לקטגוריה או לתיאור קצר נוסף. בחירת חד־פעמית/חודשית ושורת קארדקום מוצגות תמיד.</p>
     <div class="hu-row"><button type="button" class="hu-action" data-hu-edit="hero">עריכת תמונת Hero והלוגו</button></div>
   </section>`;
 }
 window.hamSimpleStudioDesignMarkup=huSimpleDonationOptions;
 // Old drawManager: every page is an Angular component (ManagementViewService.draw renders it).
 function drawManager(){if(view.draw()===null)return;updateMeters()}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-hu-open-design-exposure]');if(btn){e.preventDefault();e.stopImmediatePropagation();setMode('design');context.select('stats');}} ,true);
  function setMode(next){view.mode.set(next);if(next==='design'){context.renderSections();context.renderInspector();}const ws=q('.workspace');ws.classList.toggle('hu-management-mode',next==='management');qa('[data-hu-mode]').forEach(b=>b.classList.toggle('active',b.dataset.huMode===(next==='management'&&view.page()==='publish'?'publish':next)));if(next==='management')drawManager();if(next==='publish'){view.mode.set('management');ws.classList.add('hu-management-mode');view.page.set('publish');drawManager();qa('[data-hu-mode]').forEach(b=>b.classList.toggle('active',b.dataset.huMode==='publish'));}q('.stage-toolbar .crumb').firstChild.textContent=next==='design'?'עורך חזותי ': 'תצוגה חיה ';if(q('#projectTitle'))q('#projectTitle').textContent=get('meta.name')||'קמפיין חדש';updateMeters()}
 // Atomically open a component from the preview pencil or right-hand tree.
 // A single controller owns both mode and selection, even immediately after
 // loading the demo and before the toolbar has ever been touched.
 // The management engine is the single source of truth for work mode.
 // A component-edit request always initializes Design, even after a demo load.
 function openComponentForDesign(id){
   if(!id)return false;
   // setMode updates both the internal `mode` and the actual workspace class.
   // This cannot be replaced by a CSS-only change or synthetic toolbar click.
   setMode('design');
   // The core selects exactly once after the design workspace has settled.
   // Selecting here also causes a render that can detach the inspector from its
   // pending large-editor overlay on the very first click.
   return !q('.workspace')?.classList.contains('hu-management-mode');
 }
 window.addEventListener('hamonym:open-component-editor',event=>{
   if(!(event instanceof CustomEvent)||!event.detail)return;
   const id=String(event.detail.id||'');
   if(!id)return;
   try{
     event.detail.handled=openComponentForDesign(id);
   }catch(error){
     event.detail.handled=false;
     event.detail.error=String(error);
     console.error('[HAMONYM] Contextual component initialization failed',id,error);
   }
 });
 // The preview pencil/tree large-editor action must work even before the user
 // ever opens Design from the toolbar. This is the same controller as the tab.
 window.addEventListener('hamonym:request-design-mode',event=>{
   // The editor may be in management mode even when the controller's local
   // variable already says design (e.g. after loading a demonstration).
   // Keep them in sync before acknowledging an external contextual request.
   const workspace=q('.workspace');
   if(view.mode()!=='design'||workspace?.classList.contains('hu-management-mode'))setMode('design');
   if(event instanceof CustomEvent && event.detail){
     event.detail.handled=!workspace?.classList.contains('hu-management-mode');
   }
 });
 // goPage, the readiness drawer and the navigation commands: ManagementViewService / ManagementCommandsService.
 function goEdit(component){view.closeDrawer();setMode('design');context.select(component)}
 function openStory(){goEdit('story');const btn=q('#openStoryBuilder');if(btn)btn.click();else context.toast('עורך הסיפור זמין דרך רכיב הסיפור ב־Simple Studio')}
 // Install unified controls, keep existing .workspace children and original Studio script as-is.
 q('.top').insertAdjacentHTML('afterend',`<div class="hu-toolbar" id="huToolbar"><div class="hu-tabs" role="tablist" aria-label="מצבי עבודה"><button type="button" data-hu-mode="management" class="hu-tab active">▣ ניהול ותוכן</button><button type="button" data-hu-mode="design" class="hu-tab">✦ עיצוב · Simple Studio</button><button type="button" data-hu-mode="publish" class="hu-tab">✓ בדיקה ופרסום</button></div><div class="hu-status-actions"><button type="button" class="hu-meter-trigger" id="huReadiness" data-hu-drawer><div><strong>השלמת נתוני הקמפיין</strong><small id="huMeterText">נתונים הושלמו</small><div class="hu-meter-track"><span class="hu-meter-fill" data-hu-meter></span></div></div><span class="hu-meter-percent" data-hu-percent>0%</span></button><button type="button" class="hu-publish" data-hu-drawer>בדיקת פרסום <span aria-hidden="true">✓</span></button></div></div>`);
 mountShell(); // ManagementShellComponent (#huManager: menu + #huPage) and ReadinessDrawerComponent (#huOverlay)
 view.registerHost({redraw:drawManager,setMode,goEdit,openStory});
 startInput(); // ManagementInputService: data-hu-path/item/seg, amounts, installments, items, simple page, campaign kind
 document.addEventListener('input',ev=>{const el=ev.target;if(!el.matches('[data-sponsor-search]'))return;context.setSponsorSearchTerm(el.value);const box=document.querySelector('#preview [data-part="sponsors"] [data-sponsor-results]');if(!box)return;const fresh=document.createElement('div');fresh.innerHTML=context.sponsorMarkup(context.readState().content.sponsors);const updated=fresh.querySelector('[data-sponsor-results]');if(updated){box.innerHTML=updated.innerHTML;context.setupCampaignCarousels();}});
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-hsf-anchor]');if(!el)return;
    context.snapshot();context.readState().management.simpleDonation||={};
    context.readState().management.simpleDonation[el.dataset.hsfAnchor]=el.dataset.hsfValue;
    context.persist();context.renderPreview();drawManager();if(typeof context.renderInspector==='function')context.renderInspector();
  });
 document.addEventListener('change',e=>{
    const el=e.target;
    if(el.matches('[data-hsf-setting]')){
      context.snapshot();context.readState().management.simpleDonation||={};
      context.readState().management.simpleDonation[el.dataset.hsfSetting]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
      context.persist();context.renderPreview();drawManager();if(typeof context.renderInspector==='function')context.renderInspector();return;
    }
  });
 // A manager edited in the original design inspector becomes a custom manager too.
 // Otherwise an Angular context refresh could restore the login user's name over that edit.
 const originalInspectorEvidence={
    'title.description':'content.shortText',
   'campaignInfo.category':'meta.category','campaignInfo.manager':'meta.manager',
   'campaignInfo.endAt':'funding.end','stats.goal':'funding.target',
    'hero.title':'meta.name','hero.image':'content.heroUrl',
   'share.url':'meta.slug','donate.boxAllowOther':'donations.option'
 };
 function captureOriginalEditor(e){
   const el=e.target,path=el.dataset.scope+'.'+el.dataset.field;
   if(el.dataset.field){
     const target=originalInspectorEvidence[path];if(target)confirmField(target);
   }
   if(el.dataset.dbKey==='amount'||el.dataset.dbSetting==='boxAllowOther')confirmField('donations.option');
   if(el.matches('[data-db-add],[data-db-remove],[data-db-kind]'))confirmField('donations.option');
   if(el.matches('[data-category-pick]'))confirmField('meta.category');
   if(el.id==='heroImageUpload')confirmField('content.heroUrl');
 }
 q('#fields').addEventListener('input',captureOriginalEditor,true);
 q('#fields').addEventListener('change',captureOriginalEditor,true);
 q('#fields').addEventListener('click',captureOriginalEditor,true);
 q('#fields').addEventListener('input',e=>{
   const el=e.target;
   if(el.matches('[data-scope="campaignInfo"][data-field="manager"]')){
     if(context.readState().management.managerSource!=='custom'&&model.linkedSessionManager&&el.value!==model.linkedSessionManager.name)context.readState().content.campaignInfo.photo='';
     context.readState().management.managerSource='custom';
   }
 },true);
 // Clicking a rendered block in management mode brings back the original inspector with the chosen block.
 q('#preview').addEventListener('click',e=>{if(view.mode()==='design')return;if(e.target.closest('[data-part]')&&!e.target.closest('button,a,input,textarea,[contenteditable="true"]'))setMode('design')},true);
 // Keep title/readiness live when original editor, undo/redo, import and Story Builder mutate the shared context.readState().
 qa('#undoBtn,#redoBtn,#importBtn,#resetBtn,#saveBtn').forEach(b=>b.addEventListener('click',()=>{queueMicrotask(()=>{ensureManagement();updateMeters();if(view.mode()==='management')drawManager()})}));
 window.hamAngularWizardConfirmField = (path, source) => confirmField(path, source);
 setMode('management');
 context.persist();
 context.renderPreview();
}
