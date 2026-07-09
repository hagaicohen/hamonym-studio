// src/app/core/layout/app-layout/app-layout.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

import { TopbarComponent }   from '../topbar/topbar.component';
import { SidebarComponent }  from '../sidebar/sidebar.component';
import { ImpersonationBannerComponent } from '../impersonation-banner/impersonation-banner.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    TopbarComponent,
    SidebarComponent,
    ImpersonationBannerComponent,
  ],
  templateUrl: './app-layout.component.html',
  styleUrls: ['./app-layout.component.css'],
})
export class AppLayoutComponent {
  mobileSidebarOpen = false;

  toggleSidebar(): void { this.mobileSidebarOpen = !this.mobileSidebarOpen; }
  closeSidebar():   void { this.mobileSidebarOpen = false; }
}
