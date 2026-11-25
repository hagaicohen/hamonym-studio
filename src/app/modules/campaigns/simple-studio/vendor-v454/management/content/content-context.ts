import { Json, ManagementContext } from '../management-model.service';

/**
 * Renderers of the campaign core used by the content editors: the reward design variables and
 * the card sizes (block-level styling, still in the core). Since v4.44 the public cards themselves
 * are components (public-page/cards); the core's globals that return their markup stay for code
 * outside Angular.
 */
export interface ContentContext extends ManagementContext {
  esc(value: unknown): string;
  rewardStyleVars(cfg: Json): string;
  hamCardSizeFor(kind: string, device: string): { width?: number | string };
  hamCardSizeVars(kind: string, device: string): string;
  hamDonationRelativeTime?(record: Json): string;
}

export interface ContentWindow extends Window {
  hamonymMediaFix?: { patchMedia(root: Element): void; src?(ref: string): string };
}

export const contentWindow = (): ContentWindow => window as ContentWindow;
export const contentContext = (ctx: ManagementContext): ContentContext => ctx as ContentContext;
