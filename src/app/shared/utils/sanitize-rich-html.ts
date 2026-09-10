import DOMPurify from 'dompurify';

// Single sanitization boundary for association-authored rich-text HTML
// (campaign story/content blocks, updates) before it is trusted via
// Angular's sanitizer.bypassSecurityTrustHtml() and rendered on public
// pages. Angular's own default (non-bypassed) HTML sanitizer strips the
// `style` attribute entirely, which would silently break the color/
// font-size/text-align formatting the rich-text editor (Tiptap) already
// produces on every existing published campaign -- hence a real
// sanitizer library instead of relying on the default. 2026-09-10,
// Launch Closure.
//
// Allowlist matches exactly what rich-text-editor.component.ts's Tiptap
// extensions (StarterKit, Underline, TextAlign, TextStyle/color/fontSize,
// Highlight, Link) can actually produce -- nothing broader.
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'u', 's', 'mark',
  'ul', 'ol', 'li',
  'blockquote', 'a',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'class'];

export function sanitizeRichHtml(html: string): string {
  // DOMPurify's own default ALLOWED_URI_REGEXP already blocks javascript:/
  // data: hrefs while allowing http(s)/mailto/tel/relative URLs -- no need
  // to override it.
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR });
}
