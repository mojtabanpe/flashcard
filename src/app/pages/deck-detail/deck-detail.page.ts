import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { ToastService } from '../../core/toast.service';
import { Card, DECK_COLORS, Deck, DeckColor } from '../../core/models';
import { MarkdownPipe } from '../../core/markdown.pipe';

@Component({
  selector: 'app-deck-detail',
  imports: [FormsModule, RouterLink, MarkdownPipe],
  templateUrl: './deck-detail.page.html',
  styleUrl: './deck-detail.page.scss',
})
export class DeckDetailPage {
  /** Bound from the :id route param via withComponentInputBinding(). */
  readonly id = input.required<string>();

  private readonly decksSvc = inject(DecksService);
  private readonly cardsSvc = inject(CardsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly colors = DECK_COLORS;
  protected readonly deck = signal<Deck | null>(null);
  protected readonly cards = signal<Card[]>([]);
  protected readonly loading = signal(true);

  protected readonly dueCount = computed(
    () => this.cards().filter((c) => new Date(c.due_at).getTime() <= Date.now()).length,
  );

  // quick add composer
  protected readonly front = signal('');
  protected readonly back = signal('');
  protected readonly adding = signal(false);

  // preview (show) modal
  protected readonly previewCard = signal<Card | null>(null);
  protected readonly previewFlipped = signal(false);

  // edit-card modal
  protected readonly editCard = signal<Card | null>(null);
  protected readonly editFront = signal('');
  protected readonly editBack = signal('');

  // edit-deck modal
  protected readonly deckModal = signal(false);
  protected readonly dName = signal('');
  protected readonly dDesc = signal('');
  protected readonly dColor = signal<DeckColor>('amber');
  protected readonly savingDeck = signal(false);

  constructor() {
    // input() is set before construction completes with component input binding,
    // but read it lazily to be safe.
    queueMicrotask(() => this.load());
  }

  private async load() {
    this.loading.set(true);
    try {
      const [deck, cards] = await Promise.all([
        this.decksSvc.get(this.id()),
        this.cardsSvc.listByDeck(this.id()),
      ]);
      this.deck.set(deck);
      this.cards.set(cards);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not load deck.');
      this.router.navigateByUrl('/');
    } finally {
      this.loading.set(false);
    }
  }

  protected async addCard() {
    const front = this.front().trim();
    const back = this.back().trim();
    if (!front || !back) {
      this.toast.error('Both sides of the card are required.');
      return;
    }
    this.adding.set(true);
    try {
      const card = await this.cardsSvc.create(this.id(), front, back);
      this.cards.update((c) => [...c, card]);
      this.front.set('');
      this.back.set('');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not add card.');
    } finally {
      this.adding.set(false);
    }
  }

  protected openPreview(card: Card) {
    this.previewFlipped.set(false);
    this.previewCard.set(card);
  }

  protected openEditCard(card: Card) {
    this.editCard.set(card);
    this.editFront.set(card.front);
    this.editBack.set(card.back);
  }

  protected async saveCard() {
    const card = this.editCard();
    if (!card) return;
    const front = this.editFront().trim();
    const back = this.editBack().trim();
    if (!front || !back) {
      this.toast.error('Both sides of the card are required.');
      return;
    }
    try {
      await this.cardsSvc.update(card.id, { front, back });
      this.cards.update((list) => list.map((c) => (c.id === card.id ? { ...c, front, back } : c)));
      this.editCard.set(null);
      this.toast.show('Card updated');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not update card.');
    }
  }

  protected async deleteCard(card: Card) {
    if (!confirm('Delete this card? This cannot be undone.')) return;
    try {
      await this.cardsSvc.remove(card.id);
      this.cards.update((list) => list.filter((c) => c.id !== card.id));
      this.toast.show('Card deleted');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not delete card.');
    }
  }

  protected openEditDeck() {
    const d = this.deck();
    if (!d) return;
    this.dName.set(d.name);
    this.dDesc.set(d.description);
    this.dColor.set(d.color);
    this.deckModal.set(true);
  }

  protected async saveDeck() {
    const d = this.deck();
    if (!d) return;
    const name = this.dName().trim();
    if (!name) {
      this.toast.error('Give your deck a name.');
      return;
    }
    this.savingDeck.set(true);
    try {
      const patch = { name, description: this.dDesc().trim(), color: this.dColor() };
      await this.decksSvc.update(d.id, patch);
      this.deck.set({ ...d, ...patch });
      this.deckModal.set(false);
      this.toast.show('Deck updated');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not update deck.');
    } finally {
      this.savingDeck.set(false);
    }
  }

  protected async deleteDeck() {
    const d = this.deck();
    if (!d) return;
    if (!confirm(`Delete "${d.name}" and all its cards? This cannot be undone.`)) return;
    try {
      await this.decksSvc.remove(d.id);
      this.toast.show('Deck deleted');
      this.router.navigateByUrl('/');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not delete deck.');
    }
  }
}
