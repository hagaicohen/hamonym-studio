import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DonationToastItem } from '../../../services/donation.service';

interface ActiveToast {
  id: number;
  item: DonationToastItem;
  visible: boolean;
}

@Component({
  selector: 'app-donation-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './donation-toast.component.html',
  styleUrls: ['./donation-toast.component.css'],
})
export class DonationToastComponent implements OnDestroy {
  active: ActiveToast[] = [];

  private nextId  = 0;
  private timers  = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly MAX = 3;

  add(item: DonationToastItem): void {
    if (this.active.length >= this.MAX) {
      this.dismiss(this.active[0].id);
    }

    const id = this.nextId++;
    this.active.push({ id, item, visible: false });

    setTimeout(() => {
      const t = this.active.find(t => t.id === id);
      if (t) t.visible = true;
    }, 10);

    this.timers.set(id, setTimeout(() => this.dismiss(id), 4500));
  }

  dismiss(id: number): void {
    const t = this.active.find(t => t.id === id);
    if (!t) return;
    t.visible = false;
    setTimeout(() => { this.active = this.active.filter(t => t.id !== id); }, 400);
    const timer = this.timers.get(id);
    if (timer) { clearTimeout(timer); this.timers.delete(id); }
  }

  timeAgo(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'עכשיו';
    if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
    return `לפני ${Math.floor(diff / 3600)} שעות`;
  }

  isLarge(amount: number): boolean { return amount >= 1000; }

  ngOnDestroy(): void {
    this.timers.forEach(t => clearTimeout(t));
  }
}
