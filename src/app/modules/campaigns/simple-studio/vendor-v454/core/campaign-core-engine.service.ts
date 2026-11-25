import { Injectable } from '@angular/core';
import { initializeCampaignCore } from './campaign-core-engine';
import { CampaignStateService } from './campaign-state.service';
import { CampaignCardsService } from '../public-page/campaign-cards.service';
import { CollectionBlocksService } from '../public-page/collections/collection-blocks.service';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { StorySlidesService } from '../public-page/parts/story-slides.service';
import { InspectorService } from '../inspector/inspector.service';
import { StoryBuilderService } from '../story-builder/story-builder.service';
import { StoryBuilderComponent } from '../story-builder/story-builder.component';
import { InspectorComponent, InspectorHeadComponent, InspectorTabsComponent } from '../inspector/inspector.component';
/** Owns startup of the original campaign rendering engine through Angular DI. */
@Injectable({providedIn: 'root'})
export class CampaignCoreEngineService {
  private started = false;
  constructor(
    private readonly campaignState: CampaignStateService,
    private readonly cards: CampaignCardsService,
    private readonly collections: CollectionBlocksService,
    private readonly parts: PublicPartsService,
    // v4.51: the slideshows (`window.hamStorySlides`), before the core's first render.
    private readonly slides: StorySlidesService,
    private readonly inspector: InspectorService,
    private readonly builder: StoryBuilderService
  ) {}
  start(): void {
    if (this.started) return;
    // The engine reads and writes the campaign only through CampaignStateService (v4.43).
    // v4.54: the Inspector's nodes are Angular's (InspectorComponent on #fields), created before the core attaches its listeners.
    this.inspector.mount([
      [InspectorHeadComponent, document.querySelector<HTMLElement>('.inspector > .inspector-top')],
      [InspectorTabsComponent, document.querySelector<HTMLElement>('.inspector > .tabs')],
      [InspectorComponent, document.getElementById('fields')]
    ]);
    this.builder.mount(StoryBuilderComponent, document.getElementById('storyBuilder'));
    this.campaignState.onAvailability = (canUndo, canRedo) => this.builder.availability(canUndo, canRedo);
    initializeCampaignCore(this.campaignState, this.cards, this.collections, this.parts, this.inspector, this.builder);
    this.started = true;
  }
}
