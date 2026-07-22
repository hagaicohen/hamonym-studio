// src/app/core/layout/app-layout/app-layout.component.ts

import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

import { TopbarComponent }   from '../topbar/topbar.component';
import { SidebarComponent }  from '../sidebar/sidebar.component';
import { ImpersonationBannerComponent } from '../impersonation-banner/impersonation-banner.component';
import { IdleWarningModalComponent } from '../idle-warning-modal/idle-warning-modal.component';
import { IdleTimeoutService } from '../../services/idle-timeout.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    TopbarComponent,
    SidebarComponent,
    ImpersonationBannerComponent,
    IdleWarningModalComponent,
  ],
  templateUrl: './app-layout.component.html',
  styleUrls: ['./app-layout.component.css'],
})
export class AppLayoutComponent implements OnInit, OnDestroy {
  mobileSidebarOpen = false;

  private idle = inject(IdleTimeoutService);

  ngOnInit(): void {
    this.idle.start();
  }

  ngOnDestroy(): void {
    this.idle.stop();
  }

  toggleSidebar(): void { this.mobileSidebarOpen = !this.mobileSidebarOpen; }
  closeSidebar():   void { this.mobileSidebarOpen = false; }
}
