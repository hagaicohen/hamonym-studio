// src/app/core/layout/app-layout/app-layout.component.ts

import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

import { SidebarComponent }  from '../sidebar/sidebar.component';
import { IdleWarningModalComponent } from '../idle-warning-modal/idle-warning-modal.component';
import { PaidDonationToastComponent } from '../paid-donation-toast/paid-donation-toast.component';
import { IdleTimeoutService } from '../../services/idle-timeout.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    IdleWarningModalComponent,
    PaidDonationToastComponent,
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
