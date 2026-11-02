import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-donor-registration-invite', standalone: true, imports: [RouterLink],
  template: `@if (!authenticated && !dismissed) {
    <section dir="rtl">
      <h3>כל התרומות והקבלות שלך במקום אחד</h3>
      <p>הצטרף להמונים ותוכל לצפות בכל התרומות שלך, להוריד קבלות רשמיות ולנהל תרומות חודשיות.</p>
      <div><a routerLink="/register" [queryParams]="{ email: email, name: name, returnUrl: '/my-donations?verifyEmail=1' }">הרשמה להמונים</a>
      <button type="button" (click)="dismissed = true">אולי אחר כך</button></div>
    </section>
  }`,
  styles: [`section {margin-top:20px;padding:16px;background:#f5f3ff;border-radius:12px;text-align:center;}
    h3 {font-size:18px;margin:0 0 8px;} p {font-size:14px;line-height:1.6;margin:0 0 12px;}
    div {display:flex;gap:12px;justify-content:center;flex-wrap:wrap;align-items:center;}
    a {background:#583cd6;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;}
    button {background:transparent;border:0;color:#64748b;padding:10px;}`],
})
export class DonorRegistrationInviteComponent {
  @Input() email = '';
  @Input() name = '';
  dismissed = false;
  get authenticated(): boolean { return !!localStorage.getItem('token'); }
}
