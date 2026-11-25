import {resolveOpeningComposition} from '../builder/styles/campaign-styles';
import type {CampaignBlock,CampaignDraft,ContainerBlockData} from '../services/campaign-studio-state.service';
import {blockOrder,blockPlacement} from './campaign-composition';
export function campaignBodyRoot(draft:CampaignDraft):CampaignBlock|undefined {
 return draft.blocks.find(b=>b.id===draft.layout.bodyRootId&&b.type==='container'&&(b.data as ContainerBlockData).bodyRole==='root');
}
// Explicit opt-in only. Existing blocks, nested structure, typography and business data remain intact.
export function withCampaignBodyRoot(draft:CampaignDraft,id:()=>string):CampaignDraft {
 if(campaignBodyRoot(draft)||draft.layout.pageFormat==='minimal')return draft;
 let blocks=structuredClone(draft.blocks);
 const claimed=new Set(blocks.flatMap(b=>(b.data as Partial<ContainerBlockData>).childBlockIds??[]));
 const top=blocks.filter(b=>!claimed.has(b.id)&&!['above-header','in-hero'].includes(blockPlacement(b,false)));
 const make=(role:ContainerBlockData['bodyRole'],children:CampaignBlock[],direction:'row'|'column'='column'):CampaignBlock=>{
  const b:CampaignBlock={id:id(),type:'container',label:role==='root'?'studio.visual.bodyRoot':role==='columns'?'studio.visual.bodyColumns':role==='rail'?'studio.visual.bodyRail':'studio.visual.bodyMain',order:0,visible:true,spacingTop:0,spacingBottom:0,data:{childBlockIds:children.map(c=>c.id),backgroundColor:'',borderColor:'',backgroundImageUrl:'',padding:0,gap:role==='columns'?24:0,direction,bodyRole:role}};blocks.push(b);return b;
 };
 let hero=top.find(b=>b.type==='hero');
 const isCampaign=(draft.ownerType??'entity')!=='partner';
 if(!hero&&isCampaign&&!blocks.some(b=>b.type==='hero')){hero={id:id(),type:'hero',label:'Hero',order:0,visible:true,spacingTop:0,spacingBottom:0,data:{},sectionStyle:{widthMode:'full-bleed'}};blocks.push(hero);}
 const before=top.filter(b=>['below-header','above-hero'].includes(blockPlacement(b,false))&&b!==hero);
 const after=top.filter(b=>blockPlacement(b,false)==='below-hero'&&b!==hero);
 let content=top.filter(b=>!before.includes(b)&&!after.includes(b)&&b!==hero);
 const sidebar=['sidebar-left','sidebar-right'].includes(draft.layout.layoutMode??'');
 if(sidebar){
  const sidebarTypes=new Set(['stats','donation-widget',...(draft.layout.sidebarSections??[])]);
  const rail=content.filter(b=>sidebarTypes.has(b.type)||(b.data as ContainerBlockData).railZone==='sidebar');
  const main=content.filter(b=>!rail.includes(b)&&!['donors','ambassadors','rewards','updates','sponsors'].includes(b.type));
  const trailing=content.filter(b=>!rail.includes(b)&&!main.includes(b));
  const heroInColumn=draft.layout.heroPlacement==='main-column'&&resolveOpeningComposition(draft.layout.openingComposition,draft.layout.campaignStyleId)==='classic'&&hero;
  if(heroInColumn)main.unshift(hero!);
  const mainGroup=make('main',main),railGroup=make('rail',rail),columns=make('columns',[mainGroup,railGroup],'row');
  content=[columns,...trailing];if(heroInColumn)hero=undefined;
 }
 if(draft.layout.layoutMode==='magazine'&&content.length)content=[make('magazine',content)];
 const sequence=[...before,...(hero?[hero]:[]),...after,...content];
 const root=make('root',sequence);
 for(const device of ['desktop','mobile'] as const){
  const ranked=[...sequence].sort((a,b)=>{
   const rank=(v:CampaignBlock)=>v.type==='hero'?1:before.includes(v)?0:after.includes(v)?2:3;
   return rank(a)-rank(b)||blockOrder(a,device==='mobile')-blockOrder(b,device==='mobile');
  });
  ranked.forEach((b,i)=>{b.responsive={...b.responsive,[device]:{...b.responsive?.[device],order:i,placement:'content'}};});
 }
 sequence.forEach((b,i)=>{b.order=i;delete b.placement;});
 return {...draft,blocks,layout:{...draft.layout,bodyRootId:root.id}};
}

