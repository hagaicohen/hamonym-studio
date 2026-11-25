import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';
export interface Toast { id: number; variant: ToastVariant; title: string; description: string; closing?: boolean; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly messages = signal<Toast[]>([]);
  private nextId = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(variant: ToastVariant, title: string, description = ''): number {
    const existing = this.messages().find(t => t.variant === variant && t.title === title && t.description === description);
    if (existing) return existing.id;
    const id = ++this.nextId;
    if (this.messages().length === 2) this.remove(this.messages()[0].id);
    this.messages.update(items => [...items, { id, variant, title, description }]);
    if (variant !== 'error') this.timers.set(id, setTimeout(() => this.dismiss(id), variant === 'warning' ? 6000 : 4000));
    return id;
  }

  dismiss(id: number): void {
    if (!this.messages().some(t => t.id === id && !t.closing)) return;
    clearTimeout(this.timers.get(id));
    this.messages.update(items => items.map(t => t.id === id ? { ...t, closing: true } : t));
    this.timers.set(id, setTimeout(() => this.remove(id), 450));
  }

  private remove(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.messages.update(items => items.filter(t => t.id !== id));
  }
}
