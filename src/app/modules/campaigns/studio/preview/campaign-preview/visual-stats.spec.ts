import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService, StatsBlockData } from '../../../services/campaign-studio-state.service';
import { applyStatsPreset } from '../../../utils/stats-visual-layout';
describe('Visual statistics renderer compatibility',()=>{
 let state:CampaignStudioStateService;
 beforeEach(()=>{TestBed.configureTestingModule({imports:[CampaignPreviewComponent,HttpClientTestingModule],providers:[provideRouter([])]});state=TestBed.inject(CampaignStudioStateService);state.patch({title:'Test',targetAmount:1000,currentAmount:250,supportersCount:7,offeringsEnabled:false});});
 function configure(mode:'circle'|'bar'|'hidden'='circle') { let b=state.draft.blocks.find(b=>b.type==='stats');if(!b){const id=state.addBlock('stats');b=state.draft.blocks.find(b=>b.id===id)!;} const data=applyStatsPreset(b.data as StatsBlockData,'balanced');data.visualLayout!.progress=mode;state.updateBlockData(b.id,data);return b.id; }
 function render(){const f=TestBed.createComponent(CampaignPreviewComponent);f.detectChanges();return f;}
 it('does not opt legacy records into a different arrangement',()=>{const f=render();expect(f.nativeElement.querySelector('.sv-stats')).toBeNull();});
 for(const mode of ['circle','bar','hidden'] as const)it('renders '+mode+' using the same percentage and visible catalog',()=>{configure(mode);const f=render(),el=f.nativeElement as HTMLElement;expect(el.querySelector('.sv-stats')).not.toBeNull();expect(el.querySelectorAll('.sv-progress-circle').length).toBe(mode==='circle'?1:0);expect(el.querySelectorAll('.sv-stat progress').length).toBe(mode==='bar'?1:0);expect(el.querySelector('.sv-stats')!.textContent).toContain('25%');expect(el.querySelector('.sv-stats')!.textContent).toContain('7');});
 it('does not expose edit handles or accept keyboard reorder on public pages',()=>{const id=configure();const f=render();const before=state.draft.blocks.find(b=>b.id===id)!.data;expect(f.nativeElement.querySelector('.sv-drag')).toBeNull();expect(f.nativeElement.querySelector('.sv-resize')).toBeNull();expect(f.nativeElement.querySelector('.sv-stat--selected')).toBeNull();f.componentInstance.moveStatByKeyboard(new KeyboardEvent('keydown',{key:'ArrowDown'}),state.draft.blocks.find(b=>b.id===id)!,'raised');expect(state.draft.blocks.find(b=>b.id===id)!.data).toBe(before);});
 it('preserves amounts and custom amount controls when donation presentation changes',()=>{configure();const b=state.draft.blocks.find(b=>b.type==='donation-widget')!;state.updateBlockData(b.id,{...b.data,presentation:{padding:24,gap:12,align:'start',subtitlePosition:'bottom'}} as never);const f=render();expect(f.nativeElement.querySelector('.hm-primary-donate-cta')).not.toBeNull();expect(f.nativeElement.querySelector('.hm-custom-amount')).not.toBeNull();expect(state.draft.currentAmount).toBe(250);expect(state.draft.targetAmount).toBe(1000);});
 it('keeps custom statistics visible alongside a legacy merged summary',()=>{
  const id=configure();const custom=state.draft.blocks.find(b=>b.id===id)!;
  state.patch({layout:{...state.draft.layout,conversionWidgetLayout:'modern'},blocks:[...state.draft.blocks,{...custom,id:'legacy-summary',data:{...custom.data,visualLayout:undefined} as StatsBlockData}]});
  const f=render(),el=f.nativeElement as HTMLElement;
  const visual=el.querySelector('.sv-stats')!;expect(visual).not.toBeNull();expect(visual.parentElement!.querySelector('.hm-stats-merged')).toBeNull();
  expect(el.querySelectorAll('.hm-stats-merged').length).toBe(1);expect(el.querySelector('.hm-donate-progress')).not.toBeNull();
 });
});
