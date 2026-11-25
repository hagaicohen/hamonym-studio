/**
 * Typed contracts for the HAMONYM media subsystem.
 * The campaign state itself is still owned by the core engine; only the
 * fields the media layer reads or writes are described here.
 */

export const MEDIA_PREFIX = 'hamonymmedia:';
export const OLD_RACE_PHOTO_MARKER = 'hamracephoto:';
export const DRAFT_STORAGE_KEY = 'hamonym-studio-v01';
export const IMAGE_FALLBACK_KEY_PREFIX = 'hamonym-image-fallback-';
export const RACE_PHOTO_KEY_PREFIX = 'hamonym-race-photo-v1-';
export const TRANSPARENT_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

/** Hard limit for a processed (compressed) image, in bytes. */
export const MAX_PROCESSED_BYTES = 340_000;
/** Target size the compressor tries to reach before giving up on quality. */
export const TARGET_PROCESSED_BYTES = 245_000;

export type MediaKind = 'hero' | 'poster' | 'story' | 'logo' | 'icon' | 'avatar' | 'card';
export type { OutputMime, CompressRequest, CompressResponse } from './image-compress.types';
export type StoredMedia = Blob | string;

export interface ImageDimensions { width: number; height: number; }

/** Storage wrapper published by CampaignDraftStorageService. */
export interface DraftStorage {
  readonly persistent: boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type MediaOwner = Record<string, unknown>;

export interface StoryNode { value?: string; images?: string[]; [key: string]: unknown; }

/** Minimal shape of the campaign state that the media layer touches. */
export interface CampaignMediaState {
  content: {
    hero: MediaOwner & { position?: string; logoAnchor?: string; logoWidth?: number; logoWidthMobile?: number;
      logoResponsive?: boolean; logoShape?: string; logoRadius?: number; logoBorderStyle?: string;
      logoBorderWidth?: number; logoBorderColor?: string; mediaType?: string; showOrgLogo?: boolean; };
    campaignInfo: MediaOwner;
    donate: MediaOwner & { iconMode?: string; boxAmounts?: Array<MediaOwner & { labelIconSize?: number }>; };
    rewards: { items?: MediaOwner[] };
    updates: MediaOwner;
  };
  management?: {
    managerSource?: string;
    modules?: Record<string, { items?: MediaOwner[] } | undefined>;
  };
  [key: string]: unknown;
}

/** Bridge object published by the (still legacy) core engine. */
export interface MediaContext {
  storage: DraftStorage;
  readState(): CampaignMediaState;
  renderPreview(): void;
  renderInspector(): void;
  snapshot(): void;
  toast(message: string): void;
  sbFind(id: string): { n: StoryNode } | null | undefined;
  sbRenderNode(node: StoryNode, device: string, editing: boolean): string;
  sbRender(): void;
  sbSelected(): string | null | undefined;
  donateBoxMarkup(donate: unknown, editing: boolean): string;
  device(): string;
  history(): unknown[] | undefined;
  future(): unknown[] | undefined;
  updateUndo(): void;
}

/** Where an uploaded image is written in the campaign state. */
export interface UploadSlot {
  kind: MediaKind;
  owner?: MediaOwner;
  key?: string;
  story?: boolean;
  gallery?: boolean;
  after?: () => void;
}

export interface DiagnosticEntry {
  at: string;
  stage: string;
  kind: string;
  bytes: number;
  [key: string]: unknown;
}

/** Public API kept on window.hamonymMediaFix for the remaining legacy engines. */
export interface MediaBridge {
  prepare(): Promise<{ migrated: number; storage: string }>;
  portableCopy(): Promise<CampaignMediaState>;
  read(ref: string): Promise<StoredMedia | null>;
  save(data: StoredMedia): Promise<string>;
  src(ref: string): string;
  process(file: Blob, kind: MediaKind): Promise<Blob>;
  patchMedia(root?: ParentNode | Element): void;
  safeMarkup<T>(value: T): T | string;
  cache: Map<string, StoredMedia>;
  diagnostics(): Record<string, unknown>;
  downloadDiagnostics(): void;
  freeLegacyStorage(): Promise<{ freed: number; keys: number }>;
}


export const errorMessage = (e: unknown): string =>
  String((e as { message?: unknown } | null)?.message || e || 'שגיאה לא ידועה');
