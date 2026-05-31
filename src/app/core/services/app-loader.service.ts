import {
  Injectable,
  signal
} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AppLoaderService {

  isVisible =
    signal(false);

  text =
    signal('');

  show(
    text = 'טוען...'
  ): void {

    this.text.set(
      text
    );

    this.isVisible.set(
      true
    );
  }

  hide(): void {

    this.isVisible.set(
      false
    );
  }
}