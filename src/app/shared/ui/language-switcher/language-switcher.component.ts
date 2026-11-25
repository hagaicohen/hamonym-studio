import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Input, ViewChild, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiLang, UiLanguageService } from '../../../core/i18n/ui-language.service';

// name: always in English, in the tooltip and the menu (2026-11-09 header design);
// nameKey: the language's own name, for the accessible label.
interface LanguageOption { lang: UiLang; name: string; nameKey: string }

let nextId = 0;

// Interface-language selector (bilingual roadmap §2.5, D-27): a small round button
// beside the notification bell showing the active language's flag (an English
// tooltip names it), opening a compact menu of flags and English names.
// - WAI-ARIA menu button: Enter/Space/ArrowDown open on the current language,
//   arrows move, Enter/Space select, Escape closes and returns focus, Tab/outside click close.
// - Hidden entirely when English is switched off (I18N_FLAGS.englishEnabled).
// - On a page that is not translated yet the choice is kept and the menu says
//   that this page stays in Hebrew for now.
@Component({
  selector: 'hm-language-switcher',
  standalone: true,
  imports: [NgTemplateOutlet, TranslocoPipe],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.hm-ls--floating]': 'floating' },
})
export class LanguageSwitcherComponent implements AfterViewChecked {
  // Pages without a header: fixed to the top inline-start corner.
  @Input() floating = false;

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;

  protected readonly language = inject(UiLanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly menuId = `hm-ls-menu-${++nextId}`;
  protected open = false;

  protected readonly options: LanguageOption[] = [
    { lang: 'he', name: 'Hebrew', nameKey: 'common.language.he' },
    { lang: 'en', name: 'English', nameKey: 'common.language.en' },
  ];

  // The US flag: 7 red stripes of 13, and 5 × 6 stars in the canton.
  protected readonly usStripes = [0, 2, 4, 6, 8, 10, 12].map((i) => +(i * 20 / 13).toFixed(2));
  protected readonly usStars = Array.from({ length: 30 }, (_, i) => [1.2 + (i % 6) * 2.02, 1.15 + Math.floor(i / 6) * 2.1]);

  // The menu opens towards the wider side of the window, so it never leaves it.
  protected menuFromRight = false;

  protected get current(): LanguageOption {
    return this.options.find((o) => o.lang === this.language.preferred()) ?? this.options[0];
  }

  protected toggle(): void {
    if (this.open) this.close(false);
    else this.openMenu();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openMenu();
    }
  }

  protected onItemKeydown(event: KeyboardEvent, index: number): void {
    const items = this.items();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      this.close(false);
    }
  }

  protected select(lang: UiLang): void {
    void this.language.setLanguage(lang);
    this.close(true);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open) this.close(true);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  private openMenu(): void {
    const box = this.trigger?.nativeElement.getBoundingClientRect();
    this.menuFromRight = !!box && box.left + box.width / 2 > window.innerWidth / 2;
    this.open = true;
    this.cdr.markForCheck();
    this.focusOnRender = true;
  }

  // Focus the current language once the menu is rendered. A timer raced the
  // render when the menu was opened from the keyboard (ArrowDown).
  private focusOnRender = false;
  ngAfterViewChecked(): void {
    if (!this.focusOnRender) return;
    const items = this.items();
    if (!items.length) return;
    this.focusOnRender = false;
    items[Math.max(0, this.options.findIndex((o) => o.lang === this.current.lang))]?.focus();
  }

  private close(returnFocus: boolean): void {
    this.open = false;
    this.cdr.markForCheck();
    if (returnFocus) this.trigger?.nativeElement.focus();
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  }
}
