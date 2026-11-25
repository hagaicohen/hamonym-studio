/** The campaign's catalogs and document-level rules used by the editor (v4.61, moved unchanged from the core engine). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CAMPAIGN_CATEGORY_CATALOG, CATEGORY_SOLID_ICONS } from './category-catalog';
import { blankCampaign } from './campaign-defaults';

/** The default Hero photo (the wizard's fallback). */
export const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=1400&q=85';
/** The campaign templates (`template`), as the draft loader knows them. */
export const CAMPAIGN_TEMPLATES: Record<string, { name: string; desc: string; layout: string }> = {heroOverlay:{name:'Hero עם כרטיס נתונים',desc:'כרטיס הגיוס מופיע מעל תמונת ה־Hero',layout:'heroOverlay'},donation:{name:'דף תרומה פשוט',desc:'דף נקי עם הדגשה של היעד ואפשרויות התרומה',layout:'donation'},classic:{name:'בלוק אחרי בלוק',desc:'תמונה, פרטי הקמפיין, תרומות וסיפור — אחד אחרי השני',layout:'classic'},panorama:{name:'Hero רחב',desc:'תמונת פתיחה פנורמית, סיפור רחב ותיבת תרומה בצד',layout:'panorama'},slider:{name:'סליידר תמונות',desc:'גלריית תמונות בפתיחת הקמפיין, עם ניווט קדימה ואחורה',layout:'slider'},split:{name:'תמונה לצד פרטים',desc:'תמונה מימין, סיפור קצר ונתוני הגיוס משמאל',layout:'split'},editorial:{name:'סיפור במרכז',desc:'עיצוב קריא שמדגיש את תוכן הקמפיין והתמונות שלו',layout:'editorial'}};

export const categoryByLabel = (label: string): any => CAMPAIGN_CATEGORY_CATALOG.find((c: any) => c.label === label) || CAMPAIGN_CATEGORY_CATALOG.find((c: any) => c.id === label);
export function categoryIconName(c: any): string { return c.categoryIcon || categoryByLabel(c.category)?.icon || 'tag'; }
// Solid SVG glyphs: Font Awesome Free Icons, CC BY 4.0, Fonticons, Inc. (fontawesome.com/license/free).
export function solidCategoryIcon(name: string, px = 17): string {const icon=(CATEGORY_SOLID_ICONS as any)[name]||(CATEGORY_SOLID_ICONS as any)['ellipsis'];if(!icon)return '';const paths=Array.isArray(icon.p)?icon.p:[icon.p];return `<svg class="solid-category-icon" width="${px}" height="${px}" viewBox="${icon.v}" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill:currentColor">${paths.map((d: string)=>`<path d="${d}"/>`).join('')}</svg>`;}

/** One source of truth for Wizard / Studio category choices, including subtopics. */
export function chooseCampaignCategory(doc: any, id: string, subtopic = ''): any {
  const selected: any = CAMPAIGN_CATEGORY_CATALOG.find((c: any) => c.id === id);
  if (!selected) return null;
  const ci = doc.content.campaignInfo;
  ci.category = selected.label;
  ci.subcategory = selected.sub.includes(subtopic) ? subtopic : '';
  ci.categoryIcon = '';
  ci.showCategory = selected.id !== 'other';
  doc.management ||= {};
  if (doc.management.entryWizard) doc.management.entryWizard.categoryId = selected.id;
  doc.management.readinessEvidence ||= {};
  doc.management.readinessEvidence['meta.category'] = 'user';
  if (ci.showCategory) doc.visible.campaignInfo = true;
  return selected;
}

/** The footer settings missing from a document, filled from the defaults before each render. */
export function footerDefaults(doc: any): void {
  const f = doc.content.footer ||= {};
  for (const [key, value] of Object.entries((blankCampaign() as any).content.footer)) if (f[key] === undefined) f[key] = value;
}

/**
 * The one-time panorama presets applied at render (only unchanged factory values), and the category strip.
 * Returns how many presets ran: each was saved right away (`persist`) by the core.
 */
export function applyRenderMigrations(doc: any): number {
  let persisted = 0;
 if(doc.template==='panorama'){
   doc.management ||= {};
   if(!doc.management.panoramaStudioPreset82){
     const h=doc.content.hero, hd=doc.content.header;
     if(h.height===340)h.height=255;
     if(h.textAnchor==='bottom-center')h.textAnchor='top-right';
     if(h.logoAnchor==='top-right')h.logoAnchor='bottom-right';
     if(h.textAlign==='center')h.textAlign='right';
     if(!h.titleAlign)h.titleAlign='right';
     if(!h.subtitleAlign)h.subtitleAlign='right';
     if(h.logoWidth===110)h.logoWidth=105;
     const info=doc.content.campaignInfo;
     if(info.category && info.category!=='אחר')info.showCategory=true;
     hd.height ??= 60;
     hd.brandWidth ??= 140;
     hd.navGap ??= 12;
     hd.navFontSize ??= 13;
     hd.desktopMenuAlign ??= 'nearLogo';
     doc.management.panoramaStudioPreset82=true;
     persisted++;
   }
 }
 if(doc.template==='panorama'){
   doc.management ||= {};
   const h=doc.content.hero;
   if(!doc.management.panoramaReferencePreset83){
     // Factory Panorama initial layout only: centered vertically on right; logo below.
     if(h.textAnchor==='top-right' && h.logoAnchor==='bottom-right')h.textAnchor='middle-right';
     if(h.logoAnchor==='bottom-right' && h.logoBelowText===undefined)h.logoBelowText=true;
     h.mobileTextAnchor ??= 'middle-center';
     const menu=doc.content.header;
     if(menu.menuItems==='הסיפור,תורמים,עדכונים')menu.menuItems='הסיפור,תורמים,שגרירים,עדכונים';
     doc.management.panoramaReferencePreset83=true;persisted++;
   }
   // One-time migration of older drafts whose reference preset left text at TOP-right.
   // Future manual Studio position changes remain fully editable.
   if(!doc.management.panoramaHeroAnchorPreset85){
     const hero=doc.content.hero;
     if(hero.textAnchor==='top-right')hero.textAnchor='middle-right';
     if(hero.textAnchor==='middle-right'&&hero.textAlign==='center')hero.textAlign='right';
     if(hero.textAnchor==='middle-right'&&hero.titleAlign==='center')hero.titleAlign='right';
     if(hero.textAnchor==='middle-right'&&hero.subtitleAlign==='center')hero.subtitleAlign='right';
     doc.management.panoramaHeroAnchorPreset85=true;
     persisted++;
   }
   // The selected subtopic wins in the small public strip (e.g. התיישבות).
   const ci=doc.content.campaignInfo;
   const selectedId=doc.management.entryWizard?.categoryId;
   const selectedItem=CAMPAIGN_CATEGORY_CATALOG.find((x: any)=>x.id===selectedId);
   if(selectedItem && (!ci.category||ci.category==='קהילה וחברה'&&selectedItem.label!=='קהילה וחברה'))ci.category=selectedItem.label;
   if((ci.subcategory||ci.category)&&ci.category!=='אחר'&&ci.showCategory!==true)ci.showCategory=true;
 }
  return persisted;
}
