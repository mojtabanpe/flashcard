import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DialogFocus } from '../../core/dialog-focus';
import { TextsService } from '../../core/texts.service';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { AiService } from '../../core/ai.service';
import { TtsService } from '../../core/tts.service';
import { ToastService } from '../../core/toast.service';
import { DeckWithStats, ReadingText } from '../../core/models';
import { ReadingDoc, ReadingToken, parseReading } from '../../core/reading';

const DECK_KEY = 'recall.reader.deck';
const UNIT_KEY = 'recall.reader.unit';

function remember(key: string, value?: string): string {
  try {
    if (value === undefined) return localStorage.getItem(key) ?? '';
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the reader works without it.
  }
  return value ?? '';
}

@Component({
  selector: 'app-reader',
  imports: [DialogFocus, FormsModule, RouterLink],
  templateUrl: './reader.page.html',
  styleUrl: './reader.page.scss',
})
export class ReaderPage {
  /** Bound from the :id route param via withComponentInputBinding(). */
  readonly id = input.required<string>();

  private readonly textsSvc = inject(TextsService);
  private readonly decksSvc = inject(DecksService);
  private readonly cardsSvc = inject(CardsService);
  private readonly ai = inject(AiService);
  private readonly tts = inject(TtsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly text = signal<ReadingText | null>(null);
  protected readonly doc = signal<ReadingDoc>({ paragraphs: [], sentences: [], chunks: [] });
  protected readonly decks = signal<DeckWithStats[]>([]);
  protected readonly loading = signal(true);

  // read aloud
  protected readonly reading = signal(false);
  protected readonly chunk = signal(-1);
  protected readonly readingSentences = computed(() => new Set(this.doc().chunks[this.chunk()] ?? []));

  // highlighted words (token ids) and words already saved as cards (lowercase)
  protected readonly marked = signal<ReadonlySet<number>>(new Set());
  protected readonly saved = signal<ReadonlySet<string>>(new Set());

  // lookup sheet
  protected readonly lookup = signal<ReadingToken | null>(null);
  protected readonly looking = signal(false);
  protected readonly lookupError = signal('');
  protected readonly front = signal('');
  protected readonly back = signal('');
  protected readonly examples = signal('');
  protected readonly deckId = signal('');
  protected readonly unit = signal('');
  protected readonly adding = signal(false);
  protected readonly formError = signal('');
  private readonly deckFronts = new Map<string, Set<string>>();
  protected readonly duplicate = signal(false);
  private lookupSeq = 0;
  private lastTap = { id: -1, at: 0 };

  constructor() {
    queueMicrotask(() => this.load());
    inject(DestroyRef).onDestroy(() => this.tts.stop());
  }

  private async load() {
    try {
      const [text, decks] = await Promise.all([this.textsSvc.get(this.id()), this.decksSvc.listWithStats()]);
      this.text.set(text);
      this.doc.set(parseReading(text.body));
      this.decks.set(decks);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not load the text.');
      this.router.navigateByUrl('/read');
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleReading() {
    if (this.reading()) {
      this.tts.stop();
      return;
    }
    const { chunks, sentences } = this.doc();
    this.reading.set(true);
    try {
      await this.tts.readAloud(chunks.map((c) => c.map((i) => sentences[i]).join(' ')), (i) => this.chunk.set(i));
    } finally {
      this.reading.set(false);
      this.chunk.set(-1);
    }
  }

  private tokenAt(event: Event): ReadingToken | null {
    const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-t]');
    if (!el) return null;
    const id = Number(el.dataset['t']);
    for (const paragraph of this.doc().paragraphs) {
      const token = paragraph.find((t) => t.id === id);
      if (token) return token;
    }
    return null;
  }

  protected onDoubleClick(event: MouseEvent) {
    const token = this.tokenAt(event);
    if (!token?.word) return;
    window.getSelection()?.removeAllRanges();
    this.open(token);
  }

  /** Touch browsers do not reliably fire dblclick, so detect a double tap on the same word. */
  protected onPointerUp(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    const token = this.tokenAt(event);
    if (!token?.word) return;
    const now = Date.now();
    if (this.lastTap.id === token.id && now - this.lastTap.at < 400) {
      this.lastTap = { id: -1, at: 0 };
      event.preventDefault();
      this.open(token);
    } else {
      this.lastTap = { id: token.id, at: now };
    }
  }

  private async open(token: ReadingToken) {
    if (this.lookup()) return;
    this.marked.update((set) => new Set(set).add(token.id));
    this.lookup.set(token);
    this.front.set(token.text);
    this.back.set('');
    this.examples.set('');
    this.lookupError.set('');
    this.formError.set('');
    const decks = this.decks();
    const last = remember(DECK_KEY);
    this.deckId.set(decks.some((d) => d.id === last) ? last : (decks[0]?.id ?? ''));
    this.unit.set(remember(UNIT_KEY));
    void this.loadDeckFronts();
    await this.define(token);
  }

  protected async define(token = this.lookup()) {
    if (!token) return;
    const seq = ++this.lookupSeq;
    this.looking.set(true);
    this.lookupError.set('');
    try {
      const deck = this.decks().find((d) => d.id === this.deckId())?.name;
      const answer = await this.ai.suggestAnswer(token.text, deck, this.doc().sentences[token.sentence]);
      if (seq !== this.lookupSeq || this.lookup() !== token) return;
      this.front.set(answer.front);
      this.back.set(answer.back);
      this.examples.set(answer.examples);
      this.checkDuplicate();
    } catch (e: any) {
      if (seq === this.lookupSeq) this.lookupError.set(e?.message ?? 'Could not find the meaning. Try again.');
    } finally {
      if (seq === this.lookupSeq) this.looking.set(false);
    }
  }

  protected close() {
    this.lookupSeq++;
    this.looking.set(false);
    this.lookup.set(null);
  }

  protected speak(text: string) {
    this.tts.speak(text);
  }

  protected setDeck(id: string) {
    this.deckId.set(id);
    void this.loadDeckFronts();
  }

  private async loadDeckFronts() {
    const id = this.deckId();
    if (!id || this.deckFronts.has(id)) return this.checkDuplicate();
    try {
      const cards = await this.cardsSvc.listByDeck(id);
      this.deckFronts.set(id, new Set(cards.map((c) => c.front.trim().toLowerCase())));
    } catch {
      // The duplicate hint is optional; adding still works.
    }
    this.checkDuplicate();
  }

  protected checkDuplicate() {
    this.duplicate.set(!!this.deckFronts.get(this.deckId())?.has(this.front().trim().toLowerCase()));
  }

  protected async addCard() {
    const token = this.lookup();
    const front = this.front().trim(), back = this.back().trim(), unit = this.unit().trim().toLowerCase();
    if (!token || this.adding()) return;
    if (!this.deckId()) {
      this.formError.set('Choose a deck for this card.');
      return;
    }
    if (!front || !back) {
      this.formError.set('Add the word and its definition before saving.');
      return;
    }
    if (!/^(?:u\d+)?$/.test(unit)) {
      this.formError.set('Use a short unit label, such as u19.');
      return;
    }
    this.formError.set('');
    this.adding.set(true);
    try {
      await this.cardsSvc.create(this.deckId(), front, back, unit, this.examples().trim());
      remember(DECK_KEY, this.deckId());
      remember(UNIT_KEY, unit);
      this.deckFronts.get(this.deckId())?.add(front.toLowerCase());
      this.saved.update((set) => new Set(set).add(token.text.toLowerCase()));
      const deck = this.decks().find((d) => d.id === this.deckId());
      const label = front.length > 40 ? front.slice(0, 40).trimEnd() + '…' : front;
      this.toast.success(`Added “${label}” to ${deck?.name ?? 'your deck'}`);
      this.close();
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Could not add the card. Try again.');
    } finally {
      this.adding.set(false);
    }
  }
}
