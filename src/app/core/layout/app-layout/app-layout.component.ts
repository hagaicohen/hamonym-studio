// src/app/core/layout/app-layout/app-layout.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';

import { TopbarComponent } from '../topbar/topbar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AppLoaderComponent } from '../../ui/app-loader/app-loader.component';
import { AppLoaderService } from '../../services/app-loader.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    TopbarComponent,
    SidebarComponent,
    AppLoaderComponent,
  ],
  templateUrl: './app-layout.component.html',
  styleUrls: ['./app-layout.component.css'],
})
export class AppLayoutComponent implements OnInit, OnDestroy {
  mobileSidebarOpen = false;
  private routerSub?: Subscription;

  constructor(private router: Router, private loader: AppLoaderService) {}

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loader.show('טוען...');
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        const url = event instanceof NavigationEnd ? event.url : (event as any).url ?? '';
        // /dashboard ו-/campaigns מסתירים בעצמם אחרי שה-API חוזר
        if (!url.startsWith('/dashboard') && !url.startsWith('/campaigns')) {
          this.loader.hide();
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleSidebar(): void {
    this.mobileSidebarOpen = !this.mobileSidebarOpen;
  }

  closeSidebar(): void {
    this.mobileSidebarOpen = false;
  }
}
