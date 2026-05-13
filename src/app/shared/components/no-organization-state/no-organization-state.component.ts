import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-no-organization-state',
  standalone: true,
  imports: [],
  templateUrl: './no-organization-state.component.html',
  styleUrls: ['./no-organization-state.component.css'],
})
export class NoOrganizationStateComponent {
  userEmail = '';

  constructor(private router: Router) {
    const user = localStorage.getItem('user');

    if (user) {
      this.userEmail = JSON.parse(user).email || '';
    }
  }

  startRegistration(): void {
    this.router.navigate(['/organization-registration']);
  }
}
