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
}
