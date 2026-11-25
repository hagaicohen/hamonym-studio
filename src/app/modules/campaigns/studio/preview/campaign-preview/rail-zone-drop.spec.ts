import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService, ContainerBlockData } from '../../../services/campaign-studio-state.service';
import { CAMPAIGN_TEMPLATES, TEMPLATE_PALETTES } from '../../../builder/templates/campaign-templates';

// Sidebar layouts with railZone columns render only the columns' children.
// Reported: the donation box dragged under the Hero, then back under the
// stats bar, disappeared -- the drop landed on the rail's empty space and
// fell back to the page's top level, which renders nowhere in this layout.

describe('Sidebar columns: drops never make a block vanish', () => {
  function setup(templateId = 'sidebar-right-hero-column') {
    TestBed.configureTestingModule({ imports: [CampaignPreviewComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const state = TestBed.inject(CampaignStudioStateService);
    state.startFromTemplate(CAMPAIGN_TEMPLATES.find(t => t.id === templateId)!, TEMPLATE_PALETTES[0]);
    state.patch({ title: 'קמפיין', slug: '', targetAmount: 1000 });
    state.setPageBuilderActive(true);
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    document.body.prepend(fixture.nativeElement);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    const el = fixture.nativeElement as HTMLElement;
    const donation = state.draft.blocks.find(b => b.type === 'donation-widget')!;
    const stats = state.draft.blocks.find(b => b.type === 'stats')!;
    const railId: string = cmp.railZoneContainerId(state.draft, 'sidebar');
    const mainId: string = cmp.railZoneContainerId(state.draft, 'main');
    const rendered = () => !!el.querySelector(`[data-block-id="${donation.id}"]`);
    const childrenOf = (id: string) => (state.draft.blocks.find(b => b.id === id)!.data as ContainerBlockData).childBlockIds;
    return { state, fixture, cmp, el, donation, stats, railId, mainId, rendered, childrenOf };
  }

  it('under the Hero, then back into the rail\'s empty space under the stats bar: lands in the rail', () => {
    const { state, fixture, cmp, el, donation, stats, railId, mainId, rendered, childrenOf } = setup();
    state.moveBlockTo(donation.id, mainId, 1);
    fixture.detectChanges();
    expect(rendered()).toBeTrue();

    const statsEl = el.querySelector(`[data-block-id="${stats.id}"]`) as HTMLElement;
    statsEl.scrollIntoView({ block: 'center' });
    const statsRect = statsEl.getBoundingClientRect();
    const railRect = (el.querySelector('.sidebar-rail') as HTMLElement).getBoundingClientRect();
    const x = statsRect.left + statsRect.width / 2;
    const y = Math.min(statsRect.bottom + 15, railRect.bottom - 2);
    expect(document.elementFromPoint(x, y)!.closest('[data-block-id]')).withContext('empty rail space, no block under the cursor').toBeNull();

    const target = cmp.resolveDropTarget(x, y, state.draft);
    expect(target.parentId).toBe(railId);
    state.moveBlockTo(donation.id, target.parentId, target.index);
    fixture.detectChanges();
    expect(childrenOf(railId)).toContain(donation.id);
    expect(rendered()).toBeTrue();
    fixture.destroy();
  });

  it('a drop with nothing under the cursor goes into the main column, not the page top level', () => {
    const { state, fixture, cmp, donation, mainId, rendered, childrenOf } = setup();
    cmp.draggingExistingId = donation.id;
    spyOn(document, 'elementFromPoint').and.returnValue(null);
    cmp.onPreviewDragOver(new DragEvent('dragover', { cancelable: true, clientX: 1, clientY: 1 }));
    expect(cmp.dropTarget.parentId).toBe(mainId);
    state.moveBlockTo(donation.id, cmp.dropTarget.parentId, cmp.dropTarget.index);
    cmp.draggingExistingId = null;
    fixture.detectChanges();
    expect(childrenOf(mainId)).toContain(donation.id);
    expect(rendered()).toBeTrue();
    fixture.destroy();
  });

  it('a block already left at the top level is shown again: the donation box in the rail, other blocks in the main column', () => {
    const { state, fixture, el, donation, rendered } = setup();
    const story = state.draft.blocks.find(b => b.type === 'rich-text')!;
    state.moveBlockTo(donation.id, null, 99);
    state.moveBlockTo(story.id, null, 99);
    fixture.detectChanges();
    expect(rendered()).toBeTrue();
    expect(el.querySelector(`.sidebar-rail [data-block-id="${donation.id}"]`)).not.toBeNull();
    expect(el.querySelector(`.sidebar-main [data-block-id="${story.id}"]`)).not.toBeNull();
    expect(el.querySelectorAll(`[data-block-id="${donation.id}"]`).length).withContext('rendered once').toBe(1);
    fixture.destroy();
  });

  it('full-width sections at the top level keep rendering below the columns only', () => {
    const { state, fixture, el } = setup();
    const rewards = state.draft.blocks.find(b => b.type === 'rewards')!;
    expect(el.querySelectorAll(`[data-block-id="${rewards.id}"]`).length).toBe(1);
    expect(el.querySelector(`.page-layout-sidebar [data-block-id="${rewards.id}"]`)).toBeNull();
    fixture.destroy();
  });
});
