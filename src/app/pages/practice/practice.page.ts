import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PracticeService } from '../../core/practice.service';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { TtsService } from '../../core/tts.service';
import { ToastService } from '../../core/toast.service';
import {
  CONVERSATION_SITUATIONS,
  ConversationSituation,
  DeckWithStats,
  Dialogue,
  READING_LEVELS,
  ReadingLevel,
  UsefulPhrase,
  WritingFeedback,
  WritingTask,
} from '../../core/models';

const DECK_KEY = 'recall.practice.deck';

function remember(key: string, value?: string): string {
  try {
    if (value === undefined) return localStorage.getItem(key) ?? '';
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); practice works without it.
  }
  return value ?? '';
}

/** On-demand everyday-conversation practice: writing with feedback and listening. */
@Component({
  selector: 'app-practice',
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './practice.page.html',
  styleUrl: './practice.page.scss',
})
export class PracticePage {
  private readonly practice = inject(PracticeService);
  private readonly decksSvc = inject(DecksService);
  private readonly cardsSvc = inject(CardsService);
  private readonly tts = inject(TtsService);
  private readonly toast = inject(ToastService);

  protected readonly situations = CONVERSATION_SITUATIONS;
  protected readonly levels = READING_LEVELS;
  protected readonly speeds = [0.75, 1];
  protected readonly mode = signal<'writing' | 'listening'>('writing');
  protected readonly situation = signal<ConversationSituation>('small-talk');
  protected readonly level = signal<ReadingLevel>('B1');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  // writing
  protected readonly task = signal<WritingTask | null>(null);
  protected readonly answer = signal('');
  protected readonly feedback = signal<WritingFeedback | null>(null);

  // listening
  protected readonly dialogue = signal<Dialogue | null>(null);
  protected readonly playing = signal(false);
  protected readonly line = signal(-1);
  protected readonly showText = signal(false);
  protected readonly choices = signal<Record<number, number>>({});
  protected readonly speed = signal(1);

  // saving phrases as cards
  protected readonly decks = signal<DeckWithStats[]>([]);
  protected readonly deckId = signal(remember(DECK_KEY));
  protected readonly added = signal<ReadonlySet<string>>(new Set());
  /** Ignores an answer that arrives after the user switched or asked again. */
  private run = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    this.decksSvc
      .listWithStats()
      .then((decks) => {
        this.decks.set(decks);
        if (!decks.some((d) => d.id === this.deckId())) this.deckId.set(decks[0]?.id ?? '');
      })
      .catch(() => undefined);
  }

  protected setMode(mode: 'writing' | 'listening') {
    this.stop();
    this.run++;
    this.busy.set(false);
    this.error.set('');
    this.mode.set(mode);
  }

  private async load<T>(request: () => Promise<T>, apply: (value: T) => void) {
    const run = ++this.run;
    this.stop();
    this.error.set('');
    this.busy.set(true);
    try {
      const value = await request();
      if (run === this.run) apply(value);
    } catch (e: any) {
      if (run === this.run) this.error.set(e?.message ?? 'Something went wrong. Try again.');
    } finally {
      if (run === this.run) this.busy.set(false);
    }
  }

  protected newTask() {
    return this.load(
      () => this.practice.writingTask(this.situation(), this.level()),
      (task) => {
        this.task.set(task);
        this.answer.set('');
        this.feedback.set(null);
      },
    );
  }

  protected check() {
    const task = this.task(),
      answer = this.answer().trim();
    if (!task) return;
    if (!answer) {
      this.error.set('Write your answer first.');
      return;
    }
    return this.load(
      () => this.practice.writingFeedback(this.situation(), this.level(), task, answer),
      (feedback) => this.feedback.set(feedback),
    );
  }

  protected newDialogue() {
    return this.load(
      () => this.practice.dialogue(this.situation(), this.level()),
      (dialogue) => {
        this.dialogue.set(dialogue);
        this.showText.set(false);
        this.choices.set({});
      },
    );
  }

  protected setSpeed(speed: number) {
    this.speed.set(speed);
    this.tts.rate = speed;
  }

  protected async playAll() {
    const dialogue = this.dialogue();
    if (!dialogue) return;
    if (this.playing()) return this.stop();
    this.tts.rate = this.speed();
    this.playing.set(true);
    try {
      await this.tts.readAloud(
        dialogue.lines.map((l) => l.text),
        (i) => this.line.set(i),
      );
    } finally {
      this.playing.set(false);
      this.line.set(-1);
    }
  }

  protected speak(text: string) {
    this.stop();
    this.tts.rate = this.speed();
    void this.tts.speak(text);
  }

  protected stop() {
    this.tts.stop();
    this.tts.rate = 1;
    this.playing.set(false);
    this.line.set(-1);
  }

  protected choose(question: number, option: number) {
    if (question in this.choices()) return;
    this.choices.update((c) => ({ ...c, [question]: option }));
  }

  protected async addPhrase(phrase: UsefulPhrase) {
    const deckId = this.deckId();
    if (!deckId) {
      this.toast.error('Create a deck first to save phrases.');
      return;
    }
    try {
      await this.cardsSvc.create(deckId, phrase.phrase, phrase.meaning);
      remember(DECK_KEY, deckId);
      this.added.update((set) => new Set(set).add(phrase.phrase));
      const deck = this.decks().find((d) => d.id === deckId);
      this.toast.success(`Added “${phrase.phrase}” to ${deck?.name ?? 'your deck'}`);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not add the card.');
    }
  }
}
