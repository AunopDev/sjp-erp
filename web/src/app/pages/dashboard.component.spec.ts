import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardComponent } from './dashboard.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../shared/toast.service';

describe('DashboardComponent refresh cadence', () => {
  let get: ReturnType<typeof vi.fn>;
  let component: DashboardComponent;

  const mount = (): DashboardComponent => {
    component = TestBed.runInInjectionContext(() => new DashboardComponent());
    component.ngOnInit();
    return component;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    get = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: { get } },
        { provide: AuthService, useValue: { user: signal(null), can: () => true } },
        { provide: ToastService, useValue: { error: vi.fn(), show: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    component?.ngOnDestroy();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.useRealTimers();
  });

  it('loads once immediately and again after a minute', () => {
    const dashboard = mount();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/dashboard');

    vi.advanceTimersByTime(60_000);
    expect(get).toHaveBeenCalledTimes(2);
    expect(dashboard.lastLoaded()).toBeInstanceOf(Date);
  });

  it('skips the background tick while the tab is hidden', () => {
    mount();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    vi.advanceTimersByTime(60_000);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('stops refreshing after destroy', () => {
    const dashboard = mount();
    dashboard.ngOnDestroy();

    vi.advanceTimersByTime(180_000);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
