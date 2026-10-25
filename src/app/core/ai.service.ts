import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { ReadingLevel, ReadingTopic } from './models';

export interface CardAnswer {
  /** Dictionary form of the word, e.g. "took" → "take". */
  front: string;
  back: string;
  examples: string;
}

export interface GeneratedText {
  title: string;
  body: string;
  /** Title of the rated text whose notes shaped this one. */
  feedback_from?: string;
}

/**
 * Card-answer and reading-text generation. The server calls the 9Router chat gateway so the
 * provider key never reaches the browser.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly api = inject(ApiService);

  /** Suggest a definition and examples for `front`, optionally in the context of a deck. */
  suggestAnswer(front: string, deck?: string, context?: string): Promise<CardAnswer> {
    return this.api.request('POST', '/ai/card-answer', {
      front,
      ...(deck ? { deck } : {}),
      ...(context ? { context: context.slice(0, 1000) } : {}),
    });
  }

  /** Write a reading text of about 1,000 words (~15 minutes) on `topic`. */
  generateText(topic: ReadingTopic, level: ReadingLevel): Promise<GeneratedText> {
    return this.api.request('POST', '/ai/reading-text', { topic, level });
  }
}
