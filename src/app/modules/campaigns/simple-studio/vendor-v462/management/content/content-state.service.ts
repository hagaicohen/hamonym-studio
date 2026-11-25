import { Injectable, signal } from '@angular/core';

export type CollectionView = 'grid' | 'list' | 'carousel';

/**
 * View options of the manager lists that survive a redraw (old engine closure variables
 * `huCollectionView/Sort/Query` and `huIncomingView/Query/Sort`). The pages themselves are
 * rebuilt on every redraw, like the old markup.
 */
@Injectable({ providedIn: 'root' })
export class ContentStateService {
  readonly collectionView = signal<CollectionView>('grid');
  readonly collectionSort = signal('original');
  readonly collectionQuery = signal('');
  readonly incomingView = signal<CollectionView>('grid');
  readonly incomingSort = signal('newest');
  readonly incomingQuery = signal('');
  /**
   * Edit dialog to show again after the next redraw (a switch or select inside the dialog redraws
   * the page). v4.42 fix: the dialog used to close, so e.g. turning on "הגבלת כמות" hid the
   * quantity field that it reveals.
   */
  reopen: { type: string; index: number } | null = null;
}
