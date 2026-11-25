// Campaign defaults and start-up migrations of the campaign core, moved unchanged out of
// campaign-core-engine.ts (v4.42): pure functions of the campaign state.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;
/** The campaign document (the stored draft format, unchanged). Still loosely typed: the renderer owns its shape. */
export type Campaign = Json;

/** Default Hero image of the original studio. */
export const CAMPAIGN_IMG = 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=1400&q=85';
const img = CAMPAIGN_IMG;

/** Sections of a campaign page: [id, label, icon]. Shared (same array) with the core renderer. */
export const CAMPAIGN_SECTIONS: Array<[string, string, string]> = [['header','תפריט עליון','☰'],['hero','תמונת פתיחה','▧'],['campaignInfo','פרטי הקמפיין','♙'],['title','כותרת הקמפיין','T'],['stats','נתוני התרומה','◴'],['donationBox','תיבת התרומה','▦'],['donate','כפתור תרומה','♥'],['rewards','תשורות','◇'],['share','שיתוף הקמפיין','↗'],['nav','תפריט ניווט אמצעי','☷'],['story','סיפור הקמפיין','▤'],['donors','תורמים אחרונים','♙'],['updates','עדכונים','◷'],['comments','תגובות','▤'],['footer','פוטר','▥']];
{ const sections = CAMPAIGN_SECTIONS; sections.splice(sections.findIndex(x=>x[0]==='donors'),0,['ambassadors','שגרירים','♧']);sections.splice(sections.findIndex(x=>x[0]==='footer'),0,['sponsors','חסויות','♧']);/* Race is configured by campaign type, not a generic campaign section. */ }

/** The original studio's full default campaign (design defaults and sample content). */
export function originalCampaignDefaults(): Json {
 return ({version:1,template:'nature',theme:{primary:'#246f65',secondary:'#e7b46e',surface:'#f8f5ef',ink:'#203a36',font:'Heebo'},content:{header:{logo:'המונים',logoImage:'',action:'הצטרף כשגריר',mode:'both',desktopNavStyle:'links',menuItems:'הסיפור,תורמים,עדכונים',bg:'#ffffff',textColor:'#203a36',fontSize:20},hero:{title:'ביחד יוצרים עתיד טוב יותר',subtitle:'כל תרומה היא צעד נוסף בדרך לשינוי אמיתי',tag:'',image:img,mediaType:'image',video:'',height:340,position:'center',orgLogo:'',showOrgLogo:true,showText:true,showTextMobile:true,titleFontSize:34,subtitleFontSize:14,titleColor:'#ffffff',subtitleColor:'#ffffff',titleWeight:900,subtitleWeight:500,titleEffect:'none',subtitleEffect:'none',titleLetterSpacing:-1,subtitleLetterSpacing:0,subtitleWrap:'nowrap',logoAnchor:'top-right',textAnchor:'bottom-center',logoWidth:110,logoWidthMobile:80,logoResponsive:true,logoShape:'square',logoBorderStyle:'none',logoBorderWidth:2,logoBorderColor:'#ffffff',logoRadius:12,textAlign:'center',textColor:'#ffffff'},campaignInfo:{layout:'story',desktopAlign:'right',manager:'ישראל ישראלי',role:'מנהל הקמפיין',photo:'',location:'ירושלים',category:'קהילה וחברה',subcategory:'',categoryIcon:'',showManager:true,showLocation:true,showCategory:true,showCountdown:true,endAt:new Date(Date.now()+12*86400000).toLocaleString('sv-SE').slice(0,16)},nav:{items:'הסיפור,תורמים,עדכונים,תשורות,תגובות',mobileStyle:'dropdown',placement:{story:'page',donors:'menu',updates:'menu',rewards:'page',comments:'menu'},bg:'#ffffff',color:'#53635e',activeColor:'#246f65',borderColor:'#e3e9e5',radius:10,fontSize:12,sticky:false},title:{title:'בונים עתיד. ביחד.',showSubtitleMobile:false,subtitle:'קמפיין קהילתי שמחבר אנשים למטרה גדולה',description:'בואו לקחת חלק ביוזמה קהילתית שמחברת אנשים ויוצרת הזדמנויות חדשות. יחד נוכל לבנות עתיד טוב יותר.',textAlign:'right',titleColor:'#203a36',subtitleColor:'#5f726d',descriptionColor:'#4f605b',titleFontSize:26,subtitleFontSize:15,descriptionFontSize:14,titleWeight:900,subtitleWeight:700,descriptionWeight:400,titleEffect:'none',subtitleEffect:'none',descriptionEffect:'none',titleLetterSpacing:0,subtitleLetterSpacing:0,descriptionLetterSpacing:0},stats:{raised:284750,goal:400000,donors:1284,days:18,showRaised:true,showGoal:true,showProgress:true,showDonors:true,showDays:true},donate:{text:'אני רוצה לתרום עכשיו',emoji:'❤️',iconMode:'emoji',customIcon:'',emojiSize:22,emojiGap:7,emojiPosition:'before',emojiBackground:'#ffffff',emojiShowBackground:false,emojiPadding:0,emojiRadius:50,bg:'#246f65',textColor:'#ffffff',borderColor:'#246f65',borderWidth:0,fontSize:17,style:'solid',sticky:true,rounded:12,boxEnabled:true,boxAllowOther:true,boxOtherStyle:'card',boxLayout:'grid',boxDistribution:'full',boxShape:'rounded',boxCardBg:'#f9fbfa',boxCardBorder:'#d5e2dc',boxCardBorderWidth:2,boxCardRadius:14,boxCardHeight:78,boxCardFontSize:19,boxColumns:2,boxGap:9,boxBg:'#ffffff',boxText:'#203a36',boxAccent:'#246f65',boxHeading:'בחרו סכום לתרומה',boxDesktop:'sidebar',boxMobile:'below',boxAmounts:[{id:'a1',amount:100,kind:'once',months:1,label:''},{id:'a2',amount:180,kind:'once',months:1,label:''},{id:'a3',amount:360,kind:'once',months:1,label:''},{id:'a4',amount:100,kind:'recurring',months:10,label:'שותפים לדרך'}]},share:{text:'שיתוף הקמפיין',mode:'icons',url:'https://example.org/campaign/demo',message:'בואו להיות חלק מהקמפיין שלנו',showWhatsApp:true,showFacebook:true,showTelegram:true,showCopy:true,showNative:true,bg:'#ffffff',color:'#246f65',iconColorMode:'brand',border:'#d7e0dc',radius:12,iconSize:21},story:{heading:'',blocks:[]},donors:{heading:'אנשים טובים בדרך',subtitle:'תודה לכל השותפים לדרך',showSubtitle:false,headingAlign:'right',layout:'list',showAmounts:true,showDedications:true,showAvatars:true,donorPhotoSize:64,donorPhotoShape:'circle',donorPhotoPosition:'top',showTime:true,showSearch:true,showSort:true,searchDedications:true,defaultSort:'recent',count:3,bg:'#ffffff',cardBg:'#f8faf9',headingColor:'#203a36',textColor:'#344e49',accentColor:'#246f65',borderColor:'#e0e8e4',radius:14,gap:10,titleSize:22,columnsMobile:1,columnsDesktop:2,cardTextAlign:'right',cardIconMode:'none',cardIconSymbol:'♥',cardIconSize:20,showAmountBadges:false,badgeThreshold1:360,badgeSymbol1:'★',badgeThreshold2:1000,badgeSymbol2:'◆'},updates:{heading:'עדכונים מהשטח',title:'המסע שלנו מתחיל',text:'תודה לכל מי שכבר הצטרף. יחד נמשיך קדימה!'},rewards:{heading:'תשורות לתורמים',intro:'בחרו תשורה שמתאימה לכם',showIntro:false,items:[{name:'תודה מכל הלב',amount:100,description:'תעודת הוקרה דיגיטלית'},{name:'שותפים לדרך',amount:360,description:'מזכרת מיוחדת מהפרויקט'},{name:'מעגל התומכים',amount:1000,description:'הוקרה אישית לתומכים'}]},comments:{heading:'תגובות',intro:'מילים טובות מהקהילה',allowNew:true},footer:{title:'ביחד משנים מציאות',subtitle:'תודה שאתם חלק מהסיפור שלנו',showTopBar:false,showBottomBar:true,barIcons:true,showBrand:true,showLogo:true,brandText:'',footerRightTitle:'',footerRightSubtitle:'',footerRightBody:'',showSocial:true,facebook:'',instagram:'',linkedin:'',showNavigation:true,showNewsletter:true,newsletterText:'הירשמו לקבלת עדכונים על התקדמות הקמפיין.',showContact:true,email:'',phone:'',hours:'',bg:'#05070e',textColor:'#ffffff',accent:'#8138ed',barBg:'#ffffff',barColor:'#7432e6',barLabelColor:'#7c8490',barIconColor:'#7432e6'}},visible:Object.fromEntries(CAMPAIGN_SECTIONS.map(s=>[s[0],true])),deviceVisibility:Object.fromEntries(CAMPAIGN_SECTIONS.map(s=>[s[0],'both']))});
}

/**
 * A new campaign: the original design defaults with NO demo business/content data
 * (Angular migration v0.3.3). Samples come only from an explicit demo action.
 */
export function blankCampaign(): Json {
 const d: Json=originalCampaignDefaults();const c=d['content'];
 c.hero.title='';c.hero.subtitle='';c.hero.tag='';c.hero.image='';c.hero.video='';c.hero.videoPoster='';c.hero.slides=[];c.hero.orgLogo='';c.hero.showOrgLogo=false;
 c.title.title='';c.title.subtitle='';c.title.description='';
 c.campaignInfo.manager='';c.campaignInfo.role='';c.campaignInfo.photo='';c.campaignInfo.location='';c.campaignInfo.category='';c.campaignInfo.subcategory='';c.campaignInfo.endAt='';
 c.story.heading='';c.story.blocks=[];
 c.stats.raised=0;c.stats.goal=0;c.stats.donors=0;c.stats.days=0;
 c.donate.boxAmounts=[];
 c.rewards.items=[];
 c.updates.title='';c.updates.text='';
 c.share.url='';c.share.message='';
 c.footer.title='';c.footer.subtitle='';
 return d;
}

/** Complete default settings of the content components (old `hamonymEnsureComponentDefaults`). */
export function ensureComponentDefaults(state: Json): void {
state.content.rewards={showIntro:false,layout:'carousel',mobileViewMode:'standard',mobileTextMode:'full',carouselNavStyle:'near',enlargeOnCardClick:true,showImages:true,showDescriptions:true,showAvailability:true,cardBg:'#ffffff',accentColor:'#246f65',columnsDesktop:2,columnsMobile:1,rewardTitleColor:'#24483c',rewardTitleSize:15,rewardTitleWeight:800,rewardTextColor:'#64776e',rewardTextSize:12,rewardTextWeight:400,rewardPriceColor:'#246f65',rewardPriceSize:20,rewardPriceWeight:900,rewardButtonBg:'#246f65',rewardButtonColor:'#ffffff',rewardButtonSize:12,rewardButtonWeight:800,rewardStockColor:'#577e70',rewardBorderColor:'#dce8e2',rewardRadius:14,rewardImageHeight:130,...state.content.rewards};
state.content.ambassadors={heading:'השגרירים שלנו',subtitle:'הכירו את האנשים שלוקחים חלק',showIntro:false,layout:'cards',cardPhotoPlacement:'above',showPhotos:true,showAmounts:true,showProgress:true,showTargets:true,showLinks:true,showSearch:true,showSort:true,defaultSort:'recent',count:4,cardBg:'#fafcfb',bg:'#ffffff',accentColor:'#246f65',gap:10,radius:13,...(state.content.ambassadors||{})};
state.content.sponsors={heading:'השותפים שלנו',subtitle:'',showIntro:false,layout:'carousel',showNames:true,showLinks:true,showSearch:false,columnsDesktop:3,columnsMobile:2,logoHeight:72,cardBg:'#ffffff',bg:'#ffffff',borderColor:'#e2ebe6',textColor:'#29493e',gap:10,radius:12,...(state.content.sponsors||{})};
state.content.races={heading:'מסלולי ההרשמה',subtitle:'בחרו מסלול והצטרפו',showIntro:false,layout:'cards',showPhoto:true,showDate:true,showSpots:true,showDescription:true,showPrice:true,columnsDesktop:3,columnsMobile:1,cardBg:'#ffffff',bg:'#ffffff',accentColor:'#247a6b',headingColor:'#203a36',nameColor:'#23493f',textColor:'#657b71',priceColor:'#247a6b',buttonBg:'#247a6b',buttonColor:'#ffffff',borderColor:'#dce8e3',radius:15,gap:12,imageHeight:120,titleSize:17,titleWeight:800,priceSize:22,priceWeight:900,descriptionSize:12,descriptionWeight:400,buttonSize:12,buttonRadius:10,...(state.content.races||{})};
state.visible.races=state.visible.races!==false;
state.content.updates={heading:'עדכונים מהשטח',title:'',text:'',image:'',date:'',status:'published',pinned:false,showIntro:false,intro:'',layout:'feed',showImages:true,showDates:true,showExcerpts:true,showPinned:true,columnsDesktop:2,cardBg:'#ffffff',bg:'#ffffff',borderColor:'#e0e8e4',accentColor:'#247a6b',headingColor:'#203a36',titleColor:'#24463b',textColor:'#62746d',dateColor:'#80958b',radius:13,gap:12,imageHeight:135,titleSize:16,titleWeight:800,textSize:13,textWeight:400,moreText:'קראו עוד',...state.content.updates};
state.content.comments={heading:'תגובות',intro:'מילים טובות מהקהילה',showIntro:false,allowNew:true,layout:'cards',showAvatars:true,showDates:true,showLikes:false,columnsDesktop:2,columnsMobile:1,bg:'#ffffff',cardBg:'#f9fbfa',borderColor:'#dfe9e3',textColor:'#344b43',nameColor:'#23493f',accentColor:'#247a6b',radius:14,gap:12,nameSize:13,nameWeight:800,textSize:13,textWeight:400,buttonBg:'#247a6b',buttonColor:'#ffffff',...state.content.comments};
Object.assign(state.content.sponsors,{showDescriptions:state.content.sponsors.showDescriptions??false,showLevels:state.content.sponsors.showLevels??true,logoFit:state.content.sponsors.logoFit||'contain',logoBg:state.content.sponsors.logoBg||'#ffffff',logoRadius:state.content.sponsors.logoRadius??8,logoPadding:state.content.sponsors.logoPadding??12,nameSize:state.content.sponsors.nameSize??13,nameWeight:state.content.sponsors.nameWeight??700,descriptionColor:state.content.sponsors.descriptionColor||'#74837e',descriptionSize:state.content.sponsors.descriptionSize??11,linkColor:state.content.sponsors.linkColor||'#227968',headingColor:state.content.sponsors.headingColor||'#203a36'});

}

/** Upgrades a stored draft to the current settings (run once when the core starts). */
export function migrateCampaignState(state: Json): void {
const defaults=blankCampaign;
for(const id of ['rewards','comments']){state.content[id]={...defaults().content[id],...(state.content[id]||{})};if(state.visible[id]===undefined)state.visible[id]=true;}
// v0.1.28: promote the untouched old mobile reward navigation default to the page,
// so rewards appear just after the donation form. Respect customized mobile orders
// and navigation placements instead of silently overwriting an intentional choice.
if(!state.sectionOrder?.mobile?.length){
 const pos=state.content.nav?.placement;
 if(pos?.story==='page'&&pos.donors==='menu'&&pos.updates==='menu'&&pos.rewards==='menu'&&pos.comments==='menu')pos.rewards='page';
}
ensureComponentDefaults(state);
if(!Array.isArray(state.management?.modules?.sponsors?.items)||!state.management.modules.sponsors.items.length){if(!state.content.sponsors.everEnabled)state.visible.sponsors=false;}
// Typography v0.1.27: migrate legacy global alignment without changing existing drafts.
for(const [scope, fallback] of [['hero','center'],['title','right']]){
 const o=state.content[scope];
 if(!o)continue;
 const alignment=['left','right','center'].includes(o.textAlign)?o.textAlign:fallback;
 for(const field of (scope==='hero'?['titleAlign','subtitleAlign']:['titleAlign','subtitleAlign','descriptionAlign'])){
  if(!['left','right','center'].includes(o[field]))o[field]=alignment;
 }
}
for(const scope of ['donors','ambassadors','rewards','updates']){
 const o=state.content[scope];if(!o)continue;
 if(!['left','right','center'].includes(o.headingAlign))o.headingAlign='right';
 if(!['left','right','center'].includes(o.subtitleAlign))o.subtitleAlign=o.headingAlign;
 if(!o.headingColor)o.headingColor=scope==='donors'?'#203a36':'#203a36';
 if(!Number.isFinite(Number(o.headingWeight)))o.headingWeight=800;
 if(!o.headingEffect)o.headingEffect='none';
 if(!Number.isFinite(Number(o.headingLetterSpacing)))o.headingLetterSpacing=0;
 if(!Number.isFinite(Number(o.headingSize)))o.headingSize=scope==='donors'?Number(o.titleSize)||24:24;
 if(!o.subtitleColor)o.subtitleColor='#657a70';
 if(!Number.isFinite(Number(o.subtitleSize)))o.subtitleSize=13;
 if(!Number.isFinite(Number(o.subtitleWeight)))o.subtitleWeight=400;
 if(!o.subtitleEffect)o.subtitleEffect='none';
 if(!Number.isFinite(Number(o.subtitleLetterSpacing)))o.subtitleLetterSpacing=0;
}
if(state.visible.ambassadors===undefined)state.visible.ambassadors=true;
state.deviceVisibility.ambassadors=state.deviceVisibility.ambassadors||'both';
}

/** Read/write access to the draft storage, as needed by the one-time flags below. */
export interface CampaignFlagStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }

/**
 * Start-up normalization of a stored draft (moved unchanged out of the core's
 * `let state=…` line, v4.43). Runs before `migrateCampaignState`.
 * `templates` is the core's template table: an unknown template falls back to 'classic'.
 */
export function normalizeStoredCampaign(state: Json, templates: Record<string, unknown>, storage: CampaignFlagStorage): void {
const defaults=blankCampaign;
state.deviceVisibility={...defaults().deviceVisibility,...(state.deviceVisibility||{})};state.content.header={...defaults().content.header,...(state.content.header||{})};state.content.hero={...defaults().content.hero,...(state.content.hero||{})};if(!storage.getItem('hamonym-hero-text-restored-v44')){state.content.hero.showTextMobile=true;storage.setItem('hamonym-hero-text-restored-v44','1');}state.content.share={...defaults().content.share,...(state.content.share||{})};state.content.nav={...defaults().content.nav,...(state.content.nav||{})};state.content.nav.placement={...defaults().content.nav.placement,...(state.content.nav.placement||{})};state.content.campaignInfo={...defaults().content.campaignInfo,...(state.content.campaignInfo||{})};state.visible.campaignInfo=state.visible.campaignInfo!==false;state.theme.font=state.theme.font||'Heebo';if(!templates[state.template])state.template='classic';if(state.management?.campaignKind!=='simple'&&['heroOverlay','split'].includes(state.template)){state.template='panorama';if(state.management?.fullCampaignTemplate==='heroOverlay'||state.management?.fullCampaignTemplate==='split')state.management.fullCampaignTemplate='panorama';}state.management ||= {};state.management.heroStatsCard ||= {};state.management.heroStatsCard.shape='square';
}
