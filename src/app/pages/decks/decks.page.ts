import { DialogFocus } from '../../core/dialog-focus';
import { HostListener, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecksService } from '../../core/decks.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { DECK_COLORS, DeckColor, DeckWithStats } from '../../core/models';

@Component({
  selector: 'app-decks',
  imports: [DialogFocus, FormsModule, RouterLink],
  templateUrl: './decks.page.html',
  styleUrl: './decks.page.scss',
})
export class DecksPage {
  private readonly decksSvc = inject(DecksService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly colors = DECK_COLORS;
  protected readonly decks = signal<DeckWithStats[]>([]);
  protected readonly loading = signal(true);

  protected readonly totalDue = computed(() => this.decks().reduce((n, d) => n + d.due, 0));
  protected readonly totalCards = computed(() => this.decks().reduce((n, d) => n + d.total, 0));

  protected readonly search = signal('');
  protected readonly filteredDecks = computed(() => this.decks().filter(deck =>
    (deck.name + ' ' + deck.description).toLowerCase().includes(this.search().trim().toLowerCase())));
  protected readonly recommended = computed(() => [...this.decks()].filter(deck => deck.due > 0)
    .sort((a, b) => a.due - b.due)[0] ?? null);

  @HostListener('window:keydown.escape')
  protected dismissMenu() { this.menuOpen.set(null); }

  // per-card options menu (holds the open deck's id, or null)
  protected readonly menuOpen = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  // create-deck modal
  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly color = signal<DeckColor>('amber');

  constructor() {
    this.load();
  }

  protected async load() {
    this.loading.set(true);
    try {
      this.decks.set(await this.decksSvc.listWithStats());
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not load decks.');
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleMenu(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.menuOpen.set(this.menuOpen() === id ? null : id);
  }

  protected async deleteDeck(deck: DeckWithStats, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.menuOpen.set(null);
    const count = deck.total;
    const detail = count > 0 ? ` and its ${count} card${count === 1 ? '' : 's'}` : '';
    if (!(await this.confirm.ask('Delete deck?', `"${deck.name}"${detail} will be deleted. This cannot be undone.`))) return;

    this.deletingId.set(deck.id);
    try {
      await this.decksSvc.remove(deck.id);
      // Drop it from the list immediately for a snappy feel.
      this.decks.update((list) => list.filter((d) => d.id !== deck.id));
      this.toast.show('Deck deleted');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not delete deck.');
    } finally {
      this.deletingId.set(null);
    }
  }

  protected openNew() {
    this.name.set('');
    this.description.set('');
    this.color.set('amber');
    this.modalOpen.set(true);
  }

  protected async create() {
    const name = this.name().trim();
    if (!name) {
      this.toast.error('Give your deck a name.');
      return;
    }
    this.saving.set(true);
    try {
      await this.decksSvc.create(name, this.description().trim(), this.color());
      this.modalOpen.set(false);
      this.toast.show('Deck created');
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not create deck.');
    } finally {
      this.saving.set(false);
    }
  }
}
