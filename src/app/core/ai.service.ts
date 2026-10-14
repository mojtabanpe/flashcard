import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface CardAnswer {
  back: string;
  examples: string;
}

/**
 * Card-answer generation. The server calls the 9Router chat gateway so the
 * provider key never reaches the browser.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly api = inject(ApiService);

  /** Suggest a definition and examples for `front`, optionally in the context of a deck. */
  suggestAnswer(front: string, deck?: string): Promise<CardAnswer> {
    return this.api.request('POST', '/ai/card-answer', { front, ...(deck ? { deck } : {}) });
  }
}
