import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  id: number;
  msg: string;
  type: 'ok' | 'err';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<ToastItem[]>([]);
  private seq = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(msg: string, type: 'ok' | 'err' = 'ok'): void {
    const id = ++this.seq;
    this.items.update((items) => [...items, { id, msg, type }]);
    this.schedule(id, type === 'err' ? 8000 : 4500);
  }

  error(msg: string): void {
    this.show(msg, 'err');
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  pause(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  resume(id: number): void {
    if (this.timers.has(id)) return;
    this.schedule(id, 2500);
  }

  private schedule(id: number, delay: number): void {
    const existing = this.timers.get(id);
    if (existing) clearTimeout(existing);
    this.timers.set(id, setTimeout(() => this.dismiss(id), delay));
  }
}
