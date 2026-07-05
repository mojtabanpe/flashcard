import { Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { ToastService } from '../../core/toast.service';
import { Card, Deck, Rating } from '../../core/models';
import { previewInterval } from '../../core/srs';
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

  protected readonly deck = signal<Deck | null>(null);
  protected readonly queue = signal<Card[]>([]);
  protected readonly loading = signal(true);
  protected readonly flipped = signal(false);
  protected readonly mode = signal<'due' | 'practice'>('due');
  protected readonly busy = signal(false);

  protected readonly reviewed = signal(0);
  protected readonly startCount = signal(0);

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

      let queue = due;
      if (queue.length === 0) {
        // Nothing due — offer a free practice round over the whole deck.
        queue = await this.cardsSvc.listByDeck(this.id());
        this.mode.set('practice');
      }
      this.queue.set(queue);
      this.startCount.set(queue.length);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not start studying.');
    } finally {
      this.loading.set(false);
    }
  }

  protected reveal() {
    this.flipped.set(true);
  }

  protected previewFor(rating: Rating): string {
    const card = this.current();
    return card ? previewInterval(card, rating) : '';
  }

  protected async rate(rating: Rating) {
    const card = this.current();
    if (!card || this.busy()) return;
    this.busy.set(true);

    try {
      const updated = await this.cardsSvc.review(card, rating);
      this.reviewed.update((n) => n + 1);

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

  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent) {
    if (this.done() || this.loading()) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (!this.flipped()) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.reveal();
      }
      return;
    }
    const match = this.ratings.find((r) => r.key === e.key);
    if (match) {
      e.preventDefault();
      this.rate(match.rating);
    }
  }
}
