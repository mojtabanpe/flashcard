import { ExamplesDialog } from '../../core/examples-dialog';
import { matchesCard } from '../../core/card-search';
import { DialogFocus } from '../../core/dialog-focus';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { ToastService } from '../../core/toast.service';
import { Card, DECK_COLORS, Deck, DeckColor } from '../../core/models';
import { isBeyondSalvage } from '../../core/srs';
import { cardParts } from '../../core/format';
import { TtsService } from '../../core/tts.service';
import { AiService } from '../../core/ai.service';
import { MarkdownPipe } from '../../core/markdown.pipe';

@Component({
  selector: 'app-deck-detail',
  imports: [ExamplesDialog, DialogFocus, FormsModule, RouterLink, MarkdownPipe],
  templateUrl: './deck-detail.page.html',
  styleUrl: './deck-detail.page.scss',
})
export class DeckDetailPage {
  /** Bound from the :id route param via withComponentInputBinding(). */
  readonly id = input.required<string>();

  private readonly decksSvc = inject(DecksService);
  private readonly cardsSvc = inject(CardsService);
  private readonly toast = inject(ToastService);
  private readonly tts = inject(TtsService);
  private readonly ai = inject(AiService);
  private readonly router = inject(Router);

  protected readonly colors = DECK_COLORS;
  protected readonly deck = signal<Deck | null>(null);
  protected readonly cards = signal<Card[]>([]);
  protected readonly loading = signal(true);

  protected readonly dueCount = computed(
    () =>
      this.cards().filter((c) => !c.suspended && new Date(c.due_at).getTime() <= Date.now())
        .length,
  );

  protected readonly search = signal('');
  protected readonly selectedUnit = signal('');
  protected readonly visibleCount = signal(30);
  protected readonly units = computed(() => [...new Set(this.cards().map(card => cardParts(card).unit).filter((unit): unit is string => !!unit))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  protected readonly activeCards = computed(() => this.cards().filter(card => !card.suspended && matchesCard(card, this.search(), this.selectedUnit())));
  protected readonly suspendedCards = computed(() => this.cards().filter(card => card.suspended && matchesCard(card, this.search(), this.selectedUnit())));
  protected readonly pausedCount = computed(() => this.cards().filter(card => card.suspended).length);
  protected readonly visibleCards = computed(() => this.activeCards().slice(0, this.visibleCount()));

  protected showMore() { this.visibleCount.update(count => count + 30); }
  protected setSearch(value: string) { this.search.set(value); this.visibleCount.set(30); }
  protected setUnit(value: string) { this.selectedUnit.set(value); this.visibleCount.set(30); }
  protected clearFilters() { this.setSearch(''); this.setUnit(''); }

  protected readonly isBeyondSalvage = isBeyondSalvage;

  /** Split a card's back into its unit subtitle (U1, …) and the body. */
  protected backPartsOf(card: Card) {
    return cardParts(card);
  }

  /** Play pronunciation of a piece of card text. */
  protected speak(text: string) {
    this.tts.speak(text);
  }

  // quick add composer
  protected readonly front = signal('');
  protected readonly back = signal('');
  protected readonly unit = signal('');
  protected readonly examples = signal('');
  protected readonly adding = signal(false);
  protected readonly composerError = signal('');
  protected readonly editError = signal('');
  protected readonly savingCard = signal(false);
  protected readonly generating = signal(false);

  // preview (show) modal
  protected readonly previewCard = signal<Card | null>(null);
  protected readonly previewFlipped = signal(false);
  protected readonly previewExamplesOpen = signal(false);

  // edit-card modal
  protected readonly editCard = signal<Card | null>(null);
  protected readonly editFront = signal('');
  protected readonly editBack = signal('');
  protected readonly editUnit = signal('');
  protected readonly editExamples = signal('');

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
      this.composerError.set('Add a word and its definition before saving.');
      return;
    }
    if (!/^(?:u\d+)?$/i.test(this.unit().trim())) {
      this.composerError.set('Use a short unit label, such as u19.');
      return;
    }
    this.composerError.set('');
    this.adding.set(true);
    try {
      const card = await this.cardsSvc.create(this.id(), front, back, this.unit().trim().toLowerCase(), this.examples().trim());
      this.cards.update((c) => [...c, card]);
      this.front.set('');
      this.back.set('');
      this.unit.set('');
      this.examples.set('');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not add card.');
    } finally {
      this.adding.set(false);
    }
  }

  /** Fill the back (and empty examples) of the quick-add composer with an AI-suggested answer. */
  protected async fillBackWithAi() {
    const front = this.front().trim();
    if (!front) {
      this.toast.error('Write the front of the card first.');
      return;
    }
    if (this.generating()) return;
    this.generating.set(true);
    try {
      const answer = await this.ai.suggestAnswer(front, this.deck()?.name);
      // Ignore a late answer if the front was changed or the card was saved meanwhile.
      if (this.front().trim() !== front) return;
      this.back.set(answer.back);
      if (!this.examples().trim()) this.examples.set(answer.examples);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not generate an answer.');
    } finally {
      this.generating.set(false);
    }
  }

  /** Complete the answer automatically once the front is written and the back is still empty. */
  protected autoFillBack() {
    if (this.front().trim() && !this.back().trim()) this.fillBackWithAi();
  }

  protected openPreview(card: Card) {
    this.previewFlipped.set(false);
    this.previewExamplesOpen.set(false);
    this.previewCard.set(card);
  }

  protected togglePreview() {
    this.previewFlipped.update((flipped) => !flipped);
    this.previewExamplesOpen.set(false);
  }

  protected openEditCard(card: Card) {
    this.editError.set('');
    this.editCard.set(card);
    this.editFront.set(card.front);
    this.editBack.set(cardParts(card).body);
    this.editUnit.set(cardParts(card).unit ?? "");
    this.editExamples.set(card.examples ?? "");
  }

  protected async saveCard() {
    const card = this.editCard();
    if (!card || this.savingCard()) return;
    const front = this.editFront().trim();
    const back = this.editBack().trim();
    if (!front || !back) {
      this.editError.set('Both sides of the card are required.');
      return;
    }
    if (!/^(?:u\d+)?$/i.test(this.editUnit().trim())) {
      this.editError.set('Use a short unit label, such as u19.');
      return;
    }
    this.editError.set('');
    this.savingCard.set(true);
    try {
      const unit = this.editUnit().trim().toLowerCase();
      const examples = this.editExamples().trim();
      await this.cardsSvc.update(card.id, { front, back, unit, examples });
      this.cards.update((list) => list.map((c) => (c.id === card.id ? { ...c, front, back, unit, examples } : c)));
      this.editCard.set(null);
      this.toast.show('Card updated');
    } catch (e: any) {
      this.editError.set(e?.message ?? 'Could not update card. Try again.');
    } finally {
      this.savingCard.set(false);
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

  protected async unsuspendCard(card: Card) {
    try {
      await this.cardsSvc.unsuspend(card.id);
      this.cards.update((list) => list.map((c) => (c.id === card.id ? { ...c, suspended: false, lapses: 0 } : c)));
      this.toast.show('Card restored to rotation');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not restore card.');
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
