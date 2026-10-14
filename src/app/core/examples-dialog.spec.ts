import { TestBed } from '@angular/core/testing';
import { ExamplesDialog } from './examples-dialog';

describe('example overlay', () => {
  it('shows the word and examples and closes with Escape', () => {
    const fixture = TestBed.createComponent(ExamplesDialog);
    fixture.componentRef.setInput('word', 'bond');
    fixture.componentRef.setInput('unit', 'u19');
    fixture.componentRef.setInput('examples', 'We formed a close bond.');
    const dismiss = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismiss);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="dialog"]')!.textContent).toContain('We formed a close bond.');
    expect(root.textContent).toContain('u19');
    root.querySelector<HTMLButtonElement>('[aria-label="Close examples"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismiss).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
