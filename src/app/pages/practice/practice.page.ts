import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TextsPage } from '../texts/texts.page';
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
  imports: [FormsModule, NgTemplateOutlet, TextsPage],
  templateUrl: './practice.page.html',
  styleUrl: './practice.page.scss',
})
export class PracticePage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly practice = inject(PracticeService);
  private readonly decksSvc = inject(DecksService);
  private readonly cardsSvc = inject(CardsService);
  private readonly tts = inject(TtsService);
  private readonly toast = inject(ToastService);

  protected readonly situations = CONVERSATION_SITUATIONS;
  protected readonly levels = READING_LEVELS;
  protected readonly speeds = [0.75, 1];
  protected readonly mode = signal<'writing' | 'listening' | 'speaking' | 'reading'>('writing');
  protected readonly situation = signal<ConversationSituation>('small-talk');
  protected readonly level = signal<ReadingLevel>('B1');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly recording = signal(false);
  protected readonly transcribing = signal(false);
  protected readonly recordingUrl = signal('');
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setTimeout>;
  private recordingRun = 0;

  protected async record() {
    if (this.recording()) { this.recorder?.stop(); return; }
    this.stop();
    this.error.set('');
    const run = ++this.recordingRun;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Recording is unavailable. Use an up-to-date browser with HTTPS, or type your answer.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== this.recordingRun) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      let bytes = 0;
      recorder.ondataavailable = e => { chunks.push(e.data); bytes += e.data.size; if (bytes > 1400 * 1024 && recorder.state !== 'inactive') recorder.stop(); };
      recorder.onstop = () => {
        clearTimeout(this.timer);
        stream.getTracks().forEach(t => t.stop());
        this.recording.set(false);
        if (run !== this.recordingRun) return;
        const audio = new Blob(chunks, { type: recorder.mimeType });
        if (!audio.size || audio.size > 1500 * 1024) { this.error.set('Keep the recording shorter and try again.'); return; }
        this.clearRecordingUrl();
        this.recordingUrl.set(URL.createObjectURL(audio));
        this.transcribing.set(true);
        this.practice.transcribe(audio).then(result => {
          if (run === this.recordingRun) { this.answer.set(result.text); this.feedback.set(null); }
        }).catch(e => { if (run === this.recordingRun) this.error.set(e?.message ?? 'Could not transcribe your answer.'); })
          .finally(() => { if (run === this.recordingRun) this.transcribing.set(false); });
      };
      recorder.onerror = () => { this.error.set('Recording failed. Please try again.'); this.cancelRecording(); };
      recorder.start(1000);
      this.recording.set(true);
      this.timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 60000);
    } catch (e: any) {
      this.error.set(e?.name === 'NotAllowedError' ? 'Allow microphone access to record, or type your answer.' : e?.message ?? 'Could not access the microphone.');
      this.cancelRecording();
    }
  }

  private clearRecordingUrl() {
    if (this.recordingUrl()) URL.revokeObjectURL(this.recordingUrl());
    this.recordingUrl.set('');
  }

  private cancelRecording() {
    this.recordingRun++;
    clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.recording.set(false);
    this.transcribing.set(false);
    this.clearRecordingUrl();
  }

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
  private taskSituation: ConversationSituation = 'small-talk';
  private taskLevel: ReadingLevel = 'B1';

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const mode = params.get('mode');
      if (mode === 'reading' || mode === 'writing' || mode === 'speaking' || mode === 'listening') {
        if (mode !== this.mode()) { this.stop(); this.cancelRecording(); this.run++; this.busy.set(false); }
        this.mode.set(mode);
      }
    });
    inject(DestroyRef).onDestroy(() => { this.run++; this.stop(); this.cancelRecording(); });
    this.decksSvc
      .listWithStats()
      .then((decks) => {
        this.decks.set(decks);
        if (!decks.some((d) => d.id === this.deckId())) this.deckId.set(decks[0]?.id ?? '');
      })
      .catch(() => undefined);
  }

  protected setMode(mode: 'writing' | 'listening' | 'speaking' | 'reading') {
    this.stop();
    this.run++;
    this.busy.set(false);
    this.error.set('');
    this.cancelRecording();
    this.task.set(null);
    this.feedback.set(null);
    this.answer.set('');
    this.mode.set(mode);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { mode }, queryParamsHandling: 'merge' });
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
    this.cancelRecording();
    const situation = this.situation(), level = this.level();
    return this.load(
      () => this.practice.writingTask(situation, level),
      (task) => {
        this.taskSituation = situation;
        this.taskLevel = level;
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
      () => this.practice.writingFeedback(this.taskSituation, this.taskLevel, task, answer),
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
