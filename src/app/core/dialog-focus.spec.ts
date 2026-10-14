import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogFocus } from './dialog-focus';

@Component({ imports: [DialogFocus], template: `
  <button id="opener" (click)="open.set(true)">Open</button>
  @if (open()) {
    <div appDialogFocus aria-label="Test modal" (dialogDismiss)="open.set(false)">
      <input id="first" aria-label="Name" />
      <button id="last" (click)="open.set(false)">Close</button>
    </div>
  }` })
class Host { readonly open = signal(false); }

describe('modal keyboard navigation', () => {
  it('focuses the form, traps Tab, closes with Escape and restores the opener', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const opener = root.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus(); opener.click(); fixture.detectChanges();
    const first = root.querySelector<HTMLInputElement>('#first')!;
    const last = root.querySelector<HTMLButtonElement>('#last')!;
    expect(document.activeElement).toBe(first);
    expect(opener.inert).toBe(true);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('[appDialogFocus]')).toBeNull();
    expect(opener.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
    fixture.destroy();
  });
});

@Component({ imports: [DialogFocus], template: `
  <button id="background">Background</button>
  @if (outer()) { <div appDialogFocus aria-label="Outer"><button>Outer action</button></div> }
  @if (inner()) { <div appDialogFocus aria-label="Inner"><button>Inner action</button></div> }
` })
class StackedHost { readonly outer = signal(true); readonly inner = signal(false); }

it('restores background interaction when stacked dialogs are destroyed out of order', () => {
  const fixture = TestBed.createComponent(StackedHost);
  fixture.detectChanges();
  fixture.componentInstance.inner.set(true); fixture.detectChanges();
  const background = fixture.nativeElement.querySelector('#background') as HTMLButtonElement;
  expect(background.inert).toBe(true);
  expect(document.body.style.overflow).toBe('hidden');
  fixture.componentInstance.outer.set(false); fixture.detectChanges();
  expect(background.inert).toBe(true);
  fixture.componentInstance.inner.set(false); fixture.detectChanges();
  expect(background.inert).toBe(false);
  expect(document.body.style.overflow).not.toBe('hidden');
  fixture.destroy();
});
