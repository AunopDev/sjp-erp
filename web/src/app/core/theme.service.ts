import { Injectable, computed, effect, signal } from '@angular/core';
import type { Density, ResolvedTheme, ThemePref } from './storage';
import {
  readDensity,
  readThemePref,
  systemPrefersDark,
  writeDensity,
  writeThemePref,
} from './storage';

/**
 * Single source of truth for the user's appearance choices.
 *
 * `theme-init.js` paints the first frame from the same keys, so the shell and the
 * account page only have to keep the document in sync while the app is running.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  /** OS preference; only tracked so `system` can repaint without a reload. */
  private readonly systemDark = signal(systemPrefersDark());

  readonly pref = signal<ThemePref>(readThemePref());
  readonly theme = computed<ResolvedTheme>(() =>
    this.pref() === 'system' ? (this.systemDark() ? 'dark' : 'light') : (this.pref() as ResolvedTheme),
  );
  readonly density = signal<Density>(readDensity());

  constructor() {
    this.media?.addEventListener('change', this.onSystemChange);
    effect(() => this.paint(this.theme()));
    effect(() => {
      const density = this.density();
      document.documentElement.dataset['density'] = density;
      writeDensity(density);
    });
  }

  setPref(pref: ThemePref): void {
    writeThemePref(pref);
    this.pref.set(pref);
  }

  /** One-tap light/dark switch; leaves `system` behind on purpose. */
  toggle(): void {
    this.setPref(this.theme() === 'dark' ? 'light' : 'dark');
  }

  toggleDensity(): void {
    this.density.update((density) => (density === 'compact' ? 'comfy' : 'compact'));
  }

  private readonly onSystemChange = (event: MediaQueryListEvent): void => {
    this.systemDark.set(event.matches);
  };

  private paint(theme: ResolvedTheme): void {
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    this.setMeta('theme-color', theme === 'dark' ? '#0d1117' : '#f6f7f9');
    this.setMeta('color-scheme', theme === 'dark' ? 'dark' : 'only light');
  }

  private setMeta(name: string, content: string): void {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }
}
