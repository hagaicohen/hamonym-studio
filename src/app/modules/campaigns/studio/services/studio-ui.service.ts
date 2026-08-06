import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map } from 'rxjs';

export type DeviceMode = 'desktop' | 'mobile';

export interface StudioUiState {
  device:     DeviceMode;
  fullscreen: boolean;
}

@Injectable({ providedIn: 'root' })
export class StudioUiService {
  private deviceSubject    = new BehaviorSubject<DeviceMode>('desktop');
  private fullscreenSubject = new BehaviorSubject<boolean>(false);

  device$     = this.deviceSubject.asObservable();
  fullscreen$ = this.fullscreenSubject.asObservable();

  state$ = combineLatest([this.device$, this.fullscreen$]).pipe(
    map(([device, fullscreen]) => ({ device, fullscreen } as StudioUiState))
  );

  get device(): DeviceMode { return this.deviceSubject.value; }
  get isFullscreen(): boolean { return this.fullscreenSubject.value; }

  setDevice(mode: DeviceMode): void { this.deviceSubject.next(mode); }
  setFullscreen(v: boolean): void  { this.fullscreenSubject.next(v); }

  // ── Draggable editor/preview split — shared by every Builder host page
  // (Partner Builder, Campaign-Partner Builder) that offers this layout.
  // Previously duplicated verbatim in each host page's own component; moved
  // here since device/fullscreen above were already shared the same way.
  // Editor sits on the right (RTL: first DOM child), so its width is
  // measured from the divider to the window's right edge, i.e.
  // window.innerWidth - clientX.
  editorWidth = 480;
  private resizing = false;

  startResize(event: MouseEvent): void {
    this.resizing = true;
    event.preventDefault();
  }

  onResizeMove(event: MouseEvent): void {
    if (!this.resizing) return;
    this.editorWidth = Math.min(900, Math.max(320, window.innerWidth - event.clientX));
  }

  stopResize(): void {
    this.resizing = false;
  }
}
