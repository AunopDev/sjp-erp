import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalComponent } from './modal.component';

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function pointer(type: string, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
}

describe('ModalComponent bottom sheet', () => {
  beforeEach(async () => {
    setViewport(375);
    await TestBed.configureTestingModule({ imports: [ModalComponent] }).compileComponents();
  });

  it('renders a drag handle for the sheet layout', () => {
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.componentRef.setInput('title', 'ทดสอบ');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.modal-grip')).toBeTruthy();
  });

  it('closes when the sheet is dragged past the threshold', () => {
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.componentRef.setInput('title', 'ทดสอบ');
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const grip = (fixture.nativeElement as HTMLElement).querySelector('.modal-grip') as HTMLElement;

    grip.dispatchEvent(pointer('pointerdown', 100));
    grip.dispatchEvent(pointer('pointermove', 240));
    grip.dispatchEvent(pointer('pointerup', 240));

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('springs back when the drag is short', () => {
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.componentRef.setInput('title', 'ทดสอบ');
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const host = fixture.nativeElement as HTMLElement;
    const grip = host.querySelector('.modal-grip') as HTMLElement;
    const dialog = host.querySelector('.modal') as HTMLElement;

    grip.dispatchEvent(pointer('pointerdown', 100));
    grip.dispatchEvent(pointer('pointermove', 140));
    expect(dialog.style.transform).toBe('translateY(40px)');
    grip.dispatchEvent(pointer('pointerup', 140));

    expect(closed).not.toHaveBeenCalled();
    expect(dialog.style.transform).toBe('');
  });

  it('ignores dragging on desktop widths', () => {
    setViewport(1280);
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.componentRef.setInput('title', 'ทดสอบ');
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const grip = (fixture.nativeElement as HTMLElement).querySelector('.modal-grip') as HTMLElement;

    grip.dispatchEvent(pointer('pointerdown', 100));
    grip.dispatchEvent(pointer('pointermove', 300));
    grip.dispatchEvent(pointer('pointerup', 300));

    expect(closed).not.toHaveBeenCalled();
  });
});
