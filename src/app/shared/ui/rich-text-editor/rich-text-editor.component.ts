import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
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

import Highlight from '@tiptap/extension-highlight';

import TaskList from '@tiptap/extension-task-list';

import TaskItem from '@tiptap/extension-task-item';

import HorizontalRule from '@tiptap/extension-horizontal-rule';

import Image from '@tiptap/extension-image';

import Youtube from '@tiptap/extension-youtube';

import { TextStyle } from '@tiptap/extension-text-style';

import { Color } from '@tiptap/extension-color';

import tippy from 'tippy.js';

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
  placeholder = 'כתוב כאן את תוכן הקמפיין שלך...';

  @Input()
  minHeight = 360;

  @ViewChild('editor')
  editorElement!: ElementRef<HTMLDivElement>;

  editor!: Editor;

  disabled = false;

  private value = '';

  private onChange = (_: string) => {};

  private onTouched = () => {};

  ngAfterViewInit(): void {
    this.editor = new Editor({
      element: this.editorElement.nativeElement,

      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),

        Underline,

        Highlight.configure({
          multicolor: true,
        }),

        TextStyle,

        Color,

        HorizontalRule,

        Image.configure({
          inline: false,

          allowBase64: true,
        }),

        Youtube.configure({
          controls: true,

          nocookie: true,
        }),

        TaskList,

        TaskItem.configure({
          nested: true,
        }),

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

    setTimeout(() => {
      const buttons = document.querySelectorAll('[data-tooltip]');

      buttons.forEach((button: any) => {
        tippy(button, {
          content: button.dataset.tooltip,

          placement: 'top',

          animation: 'shift-away',

          theme: 'hamonym',
        });
      });
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

  getSelectedText(): boolean {
    if (!this.editor) {
      return false;
    }

    return !this.editor.state.selection.empty;
  }

  toggleBold(): void {
    this.editor.chain().focus().toggleBold().run();
  }

  toggleItalic(): void {
    this.editor.chain().focus().toggleItalic().run();
  }

  toggleUnderline(): void {
    this.editor.chain().focus().toggleUnderline().run();
  }

  toggleStrike(): void {
    this.editor.chain().focus().toggleStrike().run();
  }

  toggleHighlight(): void {
    this.editor.chain().focus().toggleHighlight().run();
  }

  toggleBulletList(): void {
    this.editor.chain().focus().toggleBulletList().run();
  }

  toggleOrderedList(): void {
    this.editor.chain().focus().toggleOrderedList().run();
  }

  toggleTaskList(): void {
    this.editor.chain().focus().toggleTaskList().run();
  }

  toggleBlockquote(): void {
    this.editor.chain().focus().toggleBlockquote().run();
  }

  toggleCodeBlock(): void {
    this.editor.chain().focus().toggleCodeBlock().run();
  }

  insertHorizontalRule(): void {
    this.editor.chain().focus().setHorizontalRule().run();
  }

  setParagraph(): void {
    this.editor.chain().focus().setParagraph().run();
  }

  setHeading(level: 1 | 2 | 3): void {
    this.editor.chain().focus().toggleHeading({ level }).run();
  }

  setTextAlign(alignment: 'right' | 'center' | 'left'): void {
    this.editor.chain().focus().setTextAlign(alignment).run();
  }

  setTextColor(color: string): void {
    this.editor.chain().focus().setColor(color).run();
  }

  addLink(): void {
    const previousUrl = this.editor.getAttributes('link')['href'];

    const url = window.prompt('הכנס קישור', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      this.editor.chain().focus().unsetLink().run();

      return;
    }

    this.editor.chain().focus().setLink({ href: url }).run();
  }

  addImage(): void {
    const url = prompt('Image URL');

    if (!url) {
      return;
    }

    this.editor
      .chain()
      .focus()
      .setImage({
        src: url,
      })
      .run();
  }

  addYoutubeVideo(): void {
    const url = prompt('Youtube URL');

    if (!url) {
      return;
    }

    this.editor
      .chain()
      .focus()
      .setYoutubeVideo({
        src: url,

        width: 640,

        height: 360,
      })
      .run();
  }

  clearFormatting(): void {
    this.editor.chain().focus().unsetAllMarks().clearNodes().run();
  }

  isActive(name: string, options?: any): boolean {
    return this.editor?.isActive(name, options) || false;
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }
}
