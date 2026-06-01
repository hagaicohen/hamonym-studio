// rich-text-editor.component.ts

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  forwardRef,
  inject,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

import { Editor } from '@tiptap/core';

import StarterKit from '@tiptap/starter-kit';

import Placeholder from '@tiptap/extension-placeholder';

import Link from '@tiptap/extension-link';

import Underline from '@tiptap/extension-underline';

import TextAlign from '@tiptap/extension-text-align';

@Component({
  selector: 'app-rich-text-editor',

  standalone: true,

  imports: [CommonModule, FormsModule],

  templateUrl: './rich-text-editor.component.html',

  styleUrls: ['./rich-text-editor.component.css'],

  providers: [
    {
      provide: NG_VALUE_ACCESSOR,

      useExisting: forwardRef(() => RichTextEditorComponent),

      multi: true,
    },
  ],
})
export class RichTextEditorComponent
  implements AfterViewInit, OnDestroy, ControlValueAccessor
{
  @Input()
  placeholder = 'ספר את הסיפור שלך... למה הקמפיין הזה חשוב?';

  @Input()
  minHeight = 140;

  @ViewChild('editor')
  editorElement!: ElementRef<HTMLDivElement>;

  editor: Editor | null = null;

  disabled = false;

  private value = '';

  private onChange = (_: string) => {};

  private onTouched = () => {};

  private cdr = inject(ChangeDetectorRef);

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.editor = new Editor({
        element: this.editorElement.nativeElement,

        extensions: [
          StarterKit.configure({
            heading: {
              levels: [1, 2, 3],
            },
          }),

          Underline,

          Link.configure({
            openOnClick: false,

            autolink: true,

            linkOnPaste: true,
          }),

          TextAlign.configure({
            types: ['heading', 'paragraph'],
          }),

          Placeholder.configure({
            placeholder: this.placeholder,
          }),
        ],

        content: this.value,

        editable: !this.disabled,

        editorProps: {
          attributes: {
            class: 'hamonym-editor-content',

            dir: 'rtl',
          },
        },

        onUpdate: ({ editor }) => {
          const html = editor.getHTML();

          this.value = html;

          this.onChange(html);
        },

        onBlur: () => {
          this.onTouched();
        },
      });

      this.cdr.detectChanges();
    });
  }

  writeValue(value: string): void {
    this.value = value || '';

    if (this.editor) {
      this.editor.commands.setContent(this.value);
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;

    if (this.editor) {
      this.editor.setEditable(!isDisabled);
    }
  }

  toggleBold(): void {
    this.editor?.chain().focus().toggleBold().run();
  }

  toggleItalic(): void {
    this.editor?.chain().focus().toggleItalic().run();
  }

  toggleUnderline(): void {
    this.editor?.chain().focus().toggleUnderline().run();
  }

  toggleStrike(): void {
    this.editor?.chain().focus().toggleStrike().run();
  }

  toggleBulletList(): void {
    this.editor?.chain().focus().toggleBulletList().run();
  }

  toggleOrderedList(): void {
    this.editor?.chain().focus().toggleOrderedList().run();
  }

  toggleBlockquote(): void {
    this.editor?.chain().focus().toggleBlockquote().run();
  }

  setTextAlign(alignment: 'right' | 'center' | 'left'): void {
    this.editor?.chain().focus().setTextAlign(alignment).run();
  }

  setParagraph(): void {
    this.editor?.chain().focus().setParagraph().run();
  }

  setHeading(level: 1 | 2 | 3): void {
    this.editor
      ?.chain()
      .focus()
      .toggleHeading({
        level,
      })
      .run();
  }

  addLink(): void {
    if (!this.editor) {
      return;
    }

    const previousUrl = this.editor.getAttributes('link')['href'];

    const url = window.prompt('הכנס קישור', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      this.editor.chain().focus().unsetLink().run();

      return;
    }

    this.editor
      .chain()
      .focus()
      .setLink({
        href: url,
      })
      .run();
  }

  removeLink(): void {
    this.editor?.chain().focus().unsetLink().run();
  }

  clearFormatting(): void {
    this.editor?.chain().focus().unsetAllMarks().clearNodes().run();
  }

  isActive(name: string, options?: any): boolean {
    if (!this.editor) {
      return false;
    }

    return this.editor.isActive(name, options);
  }

  getCurrentBlockType(): string {
    if (!this.editor) {
      return 'paragraph';
    }

    if (
      this.editor.isActive('heading', {
        level: 1,
      })
    ) {
      return 'h1';
    }

    if (
      this.editor.isActive('heading', {
        level: 2,
      })
    ) {
      return 'h2';
    }

    if (
      this.editor.isActive('heading', {
        level: 3,
      })
    ) {
      return 'h3';
    }

    return 'paragraph';
  }

  onBlockTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    switch (value) {
      case 'h1':
        this.setHeading(1);
        break;

      case 'h2':
        this.setHeading(2);
        break;

      case 'h3':
        this.setHeading(3);
        break;

      default:
        this.setParagraph();
    }
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }
}
