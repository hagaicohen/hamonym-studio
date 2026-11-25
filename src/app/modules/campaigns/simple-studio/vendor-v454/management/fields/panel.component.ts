import { ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, inject } from '@angular/core';

/** `.hu-panel` section with its title and optional subtitle (old engine `panel()`). */
@Component({
  selector: 'section[ham-panel]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-panel' },
  template: `<h3>{{ title }}</h3>@if (sub) {<p>{{ sub }}</p>}<ng-content />`
})
export class PanelComponent {
  @Input({ required: true }) title = '';
  @Input() sub = '';
}

/**
 * Collapsible group of a grouped page (old engine `huSection`). The initial state is applied
 * once; afterwards the user's open/closed choice is kept across redraws (v4.41 fix: the old
 * full rewrite collapsed the section the user was editing on every toggle).
 */
@Component({
  selector: 'details[ham-section]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-simple-section', '[attr.data-hu-simple-section]': 'sectionId' },
  template: `<summary><strong>{{ title }}</strong><span aria-hidden="true">⌄</span></summary><div class="hu-simple-section-body"><ng-content /></div>`
})
export class SectionComponent implements OnInit {
  private readonly el = inject<ElementRef<HTMLDetailsElement>>(ElementRef);
  @Input({ required: true }) title = '';
  @Input({ required: true }) sectionId = '';
  @Input() initiallyOpen = false;
  ngOnInit(): void { if (this.initiallyOpen) this.el.nativeElement.open = true; }
}
