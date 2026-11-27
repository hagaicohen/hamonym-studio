import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher/language-switcher.component';
import { AccountMenuComponent } from '../../../shared/components/account-menu/account-menu.component';
import { TranslocoPipe } from '@jsverse/transloco';
@Component({selector:'app-topbar',standalone:true,
 imports:[CommonModule,NotificationBellComponent,LanguageSwitcherComponent,AccountMenuComponent,TranslocoPipe],
 templateUrl:'./topbar.component.html',styleUrl:'./topbar.component.css'})
export class TopbarComponent {
 private readonly auth = inject(AuthService);
 @Input() publicPage = false;
 @Output() menuClick = new EventEmitter<void>();
 get authenticated(): boolean { return !!this.auth.currentUser() && !!this.auth.getToken(); }
}
