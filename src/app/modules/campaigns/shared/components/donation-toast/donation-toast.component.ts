import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DonationToastItem } from '../../../services/donation.service';

@Component({
  selector: 'app-donation-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './donation-toast.component.html',
  styleUrls: ['./donation-toast.component.css'],
})
export class DonationToastComponent implements OnDestroy {
  current: DonationToastItem | null = null;
  visible = false;

  private queue: DonationToastItem[] = [];
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;

  add(item: DonationToastItem): void {
    this.queue.push(item);
    if (!this.current) this.showNext();
  }

  private showNext(): void {
    if (this.queue.length === 0) { this.current = null; return; }
    this.current = this.queue.shift()!;
    this.visible = true;
    this.hideTimer = setTimeout(() => {
      this.visible = false;
      this.nextTimer = setTimeout(() => this.showNext(), 420);
    }, 4500);
  }

  timeAgo(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'עכשיו';
    if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
    return `לפני ${Math.floor(diff / 3600)} שעות`;
  }

  isLarge(amount: number): boolean { return amount >= 1000; }

  ngOnDestroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.nextTimer) clearTimeout(this.nextTimer);
  }
}
