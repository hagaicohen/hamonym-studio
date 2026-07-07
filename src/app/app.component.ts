import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { Subscription } from 'rxjs';
import { AppLoaderComponent } from './core/ui/app-loader/app-loader.component';
import { AppLoaderService } from './core/services/app-loader.service';

// Routes that hide the loader themselves after async data loading
const SELF_HIDING_PREFIXES = ['/campaigns', '/dashboard'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppLoaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly loader = inject(AppLoaderService);
  private readonly router = inject(Router);
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loader.show('טוען...');
      } else if (event instanceof NavigationEnd) {
        const url = event.url;
        const selfHiding = SELF_HIDING_PREFIXES.some(p => url.startsWith(p));
        if (!selfHiding) {
          this.loader.hide();
        }
      } else if (event instanceof NavigationCancel) {
        // hide() (not forceHide) so a follow-up redirect's show() can cancel it
        this.loader.hide();
      } else if (event instanceof NavigationError) {
        this.loader.forceHide();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
