import { Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { ToastService } from '../../core/toast.service';
import { Card, Deck, Rating } from '../../core/models';
import { previewInterval } from '../../core/srs';
import { splitUnit } from '../../core/format';
import { TtsService } from '../../core/tts.service';
import { MarkdownPipe } from '../../core/markdown.pipe';

interface RatingButton {
  rating: Rating;
  label: string;
  key: string;
}

@Component({
  selector: 'app-study',
  imports: [RouterLink, MarkdownPipe],
  templateUrl: './study.page.html',
  styleUrl: './study.page.scss',
})
export class StudyPage {
  readonly id = input.required<string>();

  private readonly decksSvc = inject(DecksService);
  private readonly cardsSvc = inject(CardsService);
  private readonly toast = inject(ToastService);
  private readonly tts = inject(TtsService);

  protected readonly deck = signal<Deck | null>(null);
  protected readonly queue = signal<Card[]>([]);
  protected readonly loading = signal(true);
  protected readonly flipped = signal(false);
  protected readonly busy = signal(false);

  protected readonly reviewed = signal(0);
  protected readonly startCount = signal(0);
  protected readonly confirmDelete = signal(false);

  protected readonly current = computed(() => this.queue()[0] ?? null);
  protected readonly done = computed(() => !this.loading() && this.queue().length === 0);
  protected readonly progress = computed(() => {
    const total = this.startCount();
    if (!total) return 0;
    return Math.min(100, Math.round((this.reviewed() / total) * 100));
  });

  protected readonly ratings: RatingButton[] = [
    { rating: 'again', label: 'Again', key: '1' },
    { rating: 'hard', label: 'Hard', key: '2' },
    { rating: 'good', label: 'Good', key: '3' },
    { rating: 'easy', label: 'Easy', key: '4' },
  ];

  constructor() {
    queueMicrotask(() => this.load());
  }

  private async load() {
    this.loading.set(true);
    try {
      const [deck, due] = await Promise.all([
        this.decksSvc.get(this.id()),
        this.cardsSvc.listDue(this.id()),
      ]);
      this.deck.set(deck);
      this.queue.set(due);
      this.startCount.set(due.length);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not start studying.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Flip the card — reveal the answer from the front, or hide it again from the back. */
  protected toggle() {
    this.flipped.update((f) => !f);
  }

  protected previewFor(rating: Rating): string {
    const card = this.current();
    return card ? previewInterval(card, rating) : '';
  }

  /** The back of a card, split into its unit subtitle (U1, …) and the body. */
  protected backParts(back: string) {
    return splitUnit(back);
  }

  protected async rate(rating: Rating) {
    const card = this.current();
    if (!card || this.busy()) return;
    this.busy.set(true);

    try {
      const updated = await this.cardsSvc.review(card, rating);
      this.reviewed.update((n) => n + 1);

      // A leech that just crossed the threshold is suspended — it leaves the
      // queue instead of cycling back for another beating.
      if (updated.suspended) {
        this.toast.show('Leech suspended — this card is parked for now');
        this.queue.update((q) => q.slice(1));
        this.flipped.set(false);
        return;
      }

      this.queue.update((q) => {
        const rest = q.slice(1);
        // A failed card comes back later in this same session.
        return rating === 'again' ? [...rest, updated] : rest;
      });
      this.flipped.set(false);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not save your review.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Play pronunciation of the current card's visible side. */
  protected speak() {
    const card = this.current();
    if (!card) return;
    const text = this.flipped()
      ? splitUnit(card.back).body
      : card.front;
    this.tts.speak(text);
  }

  /** Delete the card currently on screen and move on to the next one. */
  protected async deleteCurrent() {
    const card = this.current();
    if (!card || this.busy()) return;

    this.busy.set(true);
    try {
      await this.cardsSvc.remove(card.id);
      this.queue.update((q) => q.filter((c) => c.id !== card.id));
      this.reviewed.update((n) => n + 1);
      this.flipped.set(false);
      this.confirmDelete.set(false);
      this.toast.show('Card deleted');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not delete card.');
    } finally {
      this.busy.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent) {
    if (this.done() || this.loading()) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.toggle();
      return;
    }
    if (!this.flipped()) return;
    const match = this.ratings.find((r) => r.key === e.key);
    if (match) {
      e.preventDefault();
      this.rate(match.rating);
    }
  }
}
