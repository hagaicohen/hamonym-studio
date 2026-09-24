// src/app/core/layout/app-layout/app-layout.component.ts

import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
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
export class AppLayoutComponent implements OnInit, AfterViewInit, OnDestroy {
  mobileSidebarOpen = false;

  private idle = inject(IdleTimeoutService);

  // The impersonation banner + topbar are one fixed unit (see
  // app-layout.component.html/css) -- its real height varies (banner
  // present or not) and is measured here, never hardcoded, so
  // .app-body/.sidebar/the mobile overlay can offset by the exact right
  // amount via the --header-height custom property regardless of whether
  // the banner is showing. A ResizeObserver (not just one measurement on
  // init) because ending impersonation removes the banner and shrinks this
  // element's height while the page is already open.
  @ViewChild('fixedHeader') private fixedHeaderRef!: ElementRef<HTMLDivElement>;
  private headerObserver?: ResizeObserver;

  ngOnInit(): void {
    this.idle.start();
  }

  ngAfterViewInit(): void {
    const el = this.fixedHeaderRef.nativeElement;
    const applyHeight = () => {
      document.documentElement.style.setProperty('--header-height', `${el.offsetHeight}px`);
    };
    applyHeight();
    this.headerObserver = new ResizeObserver(applyHeight);
    this.headerObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.idle.stop();
    this.headerObserver?.disconnect();
  }

  toggleSidebar(): void { this.mobileSidebarOpen = !this.mobileSidebarOpen; }
  closeSidebar():   void { this.mobileSidebarOpen = false; }
}
