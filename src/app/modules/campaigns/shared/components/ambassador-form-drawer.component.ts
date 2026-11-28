import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-ambassador-form-drawer',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './ambassador-form-drawer.component.html',
  styleUrl: './ambassador-form-drawer.component.css',
})
export class AmbassadorFormDrawerComponent implements AfterViewInit {
  @Input({ required: true }) title!: string;
  @Input() accent?: string;
  @Input() busy = false;
  @Output() dismissed = new EventEmitter<void>();
  @ViewChild('drawer', { static: true }) private drawer!: ElementRef<HTMLDialogElement>;

  ngAfterViewInit(): void {
    this.drawer.nativeElement.showModal();
  }

  dismiss(event?: Event): void {
    event?.preventDefault();
    if (!this.busy) this.dismissed.emit();
  }

  backdrop(event: MouseEvent): void {
    if (event.target !== this.drawer.nativeElement) return;
    const rect = this.drawer.nativeElement.getBoundingClientRect();
    if (event.clientX > rect.right || event.clientX < rect.left) this.dismiss();
  }
}
