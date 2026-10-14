import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

/** Keep keyboard navigation inside a modal and return focus when it closes. */
@Directive({
  selector: '[appDialogFocus]',
  host: { role: 'dialog', 'aria-modal': 'true', '(keydown)': 'onKey($event)' },
})
export class DialogFocus implements AfterViewInit, OnDestroy {
  readonly dialogDismiss = output<void>();
  private readonly element: HTMLElement = inject(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly previous = this.document.activeElement as HTMLElement | null;
  private static readonly locks = new Map<HTMLElement, { count: number; original: boolean }>();
  private readonly backgrounds = new Set<HTMLElement>();
  private static readonly scrollLocks = new Map<Document, { count: number; overflow: string }>();

  private controls(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    )).filter(control => !control.closest('[hidden], [inert], [aria-hidden="true"]'))
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }

  ngAfterViewInit() {
    const scroll = DialogFocus.scrollLocks.get(this.document);
    if (scroll) scroll.count += 1;
    else DialogFocus.scrollLocks.set(this.document, { count: 1, overflow: this.document.body.style.overflow });
    this.document.body.style.overflow = 'hidden';
    let current: HTMLElement | null = this.element;
    while (current?.parentElement) {
      for (const sibling of Array.from(current.parentElement.children)) {
        if (sibling !== current && sibling instanceof HTMLElement) {
          this.backgrounds.add(sibling);
          const lock = DialogFocus.locks.get(sibling);
          if (lock) lock.count += 1;
          else DialogFocus.locks.set(sibling, { count: 1, original: Boolean(sibling.inert) });
          sibling.inert = true;
        }
      }
      current = current.parentElement;
      if (current === this.document.body) break;
    }
    // Forms start in their first input; previews start on the flip control.
    const first = this.element.querySelector<HTMLElement>('input, textarea, .preview__flip');
    (first ?? this.controls()[0] ?? this.element).focus();
  }

  protected onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dialogDismiss.emit();
    } else if (event.key === 'Tab') {
      const controls = this.controls();
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      const active = this.document.activeElement;
      if (event.shiftKey && (active === first || !this.element.contains(active))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (active === last || !this.element.contains(active))) {
        event.preventDefault(); first.focus();
      }
    }
  }

  ngOnDestroy() {
    const scroll = DialogFocus.scrollLocks.get(this.document);
    if (scroll && --scroll.count === 0) {
      this.document.body.style.overflow = scroll.overflow;
      DialogFocus.scrollLocks.delete(this.document);
    }
    for (const element of this.backgrounds) {
      const lock = DialogFocus.locks.get(element);
      if (lock && --lock.count === 0) {
        element.inert = lock.original;
        DialogFocus.locks.delete(element);
      }
    }
    if (this.previous?.isConnected) this.previous.focus();
  }
}
