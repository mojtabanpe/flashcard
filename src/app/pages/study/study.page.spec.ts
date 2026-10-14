import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StudyPage } from './study.page';
import { CardsService } from '../../core/cards.service';
import { DecksService } from '../../core/decks.service';
import { ToastService } from '../../core/toast.service';
import { TtsService } from '../../core/tts.service';

const card = { id: 'card', deck_id: 'deck', user_id: 'user', front: 'bond', back: 'A connection between people.',
  unit: 'u19', examples: 'We formed a close bond.', ease_factor: 2.5, interval_days: 0, repetitions: 0, lapses: 0,
  suspended: false, suspensions: 0, due_at: '2026-01-01', last_reviewed_at: null, created_at: '', updated_at: '' };

async function setup(fail = false) {
  const cards = { listDue: vi.fn(() => fail ? Promise.reject(new Error('Connection unavailable.')) : Promise.resolve([card])),
    review: vi.fn(() => Promise.resolve(card)), remove: vi.fn() };
  TestBed.configureTestingModule({ imports: [StudyPage], providers: [provideRouter([]),
    { provide: CardsService, useValue: cards },
    { provide: DecksService, useValue: { get: () => Promise.resolve({ name: 'Words' }) } },
    { provide: ToastService, useValue: { error: vi.fn(), show: vi.fn() } },
    { provide: TtsService, useValue: { speak: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(StudyPage);
  fixture.componentRef.setInput('id', 'deck');
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  await vi.waitFor(() => { fixture.detectChanges(); expect(root.querySelector('.spinner')).toBeNull(); });
  return { fixture, cards, root };
}

describe('focused review', () => {
  it('reveals examples on request and hides them for the next review', async () => {
    const { fixture, root, cards } = await setup();
    expect(root.textContent).not.toContain(card.back);
    root.querySelector<HTMLButtonElement>('[aria-label="Reveal meaning"]')!.click(); fixture.detectChanges();
    expect(root.textContent).toContain(card.back);
    expect(root.querySelector('#examples-dialog')).toBeNull();
    root.querySelector<HTMLButtonElement>('[aria-controls="examples-dialog"]')!.click(); fixture.detectChanges();
    expect(root.querySelector('#examples-dialog')!.textContent).toContain(card.examples);
    const close = root.querySelector<HTMLButtonElement>('[aria-label="Close examples"]')!;
    close.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(cards.review).not.toHaveBeenCalled();
    close.click(); fixture.detectChanges();
    expect(root.querySelector('#examples-dialog')).toBeNull();
    root.querySelector<HTMLButtonElement>('.rate__btn--again')!.click();
    await vi.waitFor(() => { fixture.detectChanges(); expect(root.querySelector('[aria-label="Reveal meaning"]')).not.toBeNull(); });
    expect(cards.review).toHaveBeenCalledWith(card, 'again');
    expect(root.querySelector('[aria-controls="examples-dialog"]')).toBeNull();
    // "Again" keeps the card in the queue and must not claim the session is finished.
    expect(root.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('0');
    fixture.destroy();
  });
  it('does not show a completed session when loading fails', async () => {
    const { fixture, root } = await setup(true);
    expect(root.textContent).toContain('Connection unavailable.');
    expect(root.textContent).toContain('Try again');
    expect(root.textContent).not.toContain('All caught up');
    fixture.destroy();
  });
});
