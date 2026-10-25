import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DialogFocus } from '../../core/dialog-focus';
import { TextsService } from '../../core/texts.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AiService } from '../../core/ai.service';
import {
  READING_LEVELS,
  READING_TOPICS,
  ReadingLevel,
  ReadingText,
  ReadingTopic,
} from '../../core/models';

@Component({
  selector: 'app-texts',
  imports: [DialogFocus, FormsModule, RouterLink],
  templateUrl: './texts.page.html',
  styleUrl: './texts.page.scss',
})
export class TextsPage {
  private readonly textsSvc = inject(TextsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly ai = inject(AiService);

  protected readonly texts = signal<ReadingText[]>([]);
  protected readonly loading = signal(true);
  protected readonly modalOpen = signal(false);
  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly topics = READING_TOPICS;
  protected readonly levels = READING_LEVELS;
  protected readonly topic = signal<ReadingTopic>('technology');
  protected readonly level = signal<ReadingLevel>('B2');
  protected readonly generating = signal(false);
  /** Ignores a generation that finishes after the dialog was closed or reopened. */
  private generation = 0;

  constructor() {
    this.load();
  }

  private async load() {
    try {
      this.texts.set(await this.textsSvc.list());
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not load your texts.');
    } finally {
      this.loading.set(false);
    }
  }

  protected wordCount(text: ReadingText) {
    return text.body.split(/\s+/).filter(Boolean).length;
  }

  protected openNew() {
    this.title.set('');
    this.body.set('');
    this.formError.set('');
    this.generating.set(false);
    this.generation++;
    this.modalOpen.set(true);
  }

  protected closeModal() {
    this.generation++;
    this.generating.set(false);
    this.modalOpen.set(false);
  }

  protected async generate() {
    const run = ++this.generation;
    this.formError.set('');
    this.generating.set(true);
    try {
      const text = await this.ai.generateText(this.topic(), this.level());
      if (run !== this.generation) return;
      this.title.set(text.title);
      this.body.set(text.body);
    } catch (e: any) {
      if (run === this.generation)
        this.formError.set(e?.message ?? 'Could not write a text. Try again.');
    } finally {
      if (run === this.generation) this.generating.set(false);
    }
  }

  protected async save() {
    const body = this.body().trim();
    const title = this.title().trim() || body.split(/\s+/).slice(0, 6).join(' ');
    if (!body) {
      this.formError.set('Paste or write the text you want to read.');
      return;
    }
    if (body.length > 50000) {
      this.formError.set('Keep the text under 50,000 characters.');
      return;
    }
    this.formError.set('');
    this.saving.set(true);
    try {
      const text = await this.textsSvc.create(title.slice(0, 200), body);
      this.closeModal();
      this.router.navigate(['/read', text.id]);
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Could not save the text. Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(text: ReadingText) {
    if (!(await this.confirm.ask('Delete text?', `"${text.title}" will be deleted. Cards you made from it stay in their decks.`))) return;
    try {
      await this.textsSvc.remove(text.id);
      this.texts.update((list) => list.filter((t) => t.id !== text.id));
      this.toast.show('Text deleted');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Could not delete the text.');
    }
  }
}
