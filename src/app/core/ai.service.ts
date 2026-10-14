import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Card-answer generation via the local OpenAI-compatible /v1/chat/completions
 * endpoint (same gateway as TtsService).
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  /** Suggest a concise flashcard answer for `front`, optionally in the context of a deck. */
  async suggestAnswer(front: string, deck?: { name: string; description: string }): Promise<string> {
    const context = deck
      ? `The card belongs to the deck "${deck.name}"${deck.description ? ` (${deck.description})` : ''}.`
      : '';
    const res = await fetch(environment.aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${environment.aiKey}`,
      },
      body: JSON.stringify({
        model: environment.aiModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You write the back side of spaced-repetition flashcards. Reply with only the answer: ' +
              'concise, accurate, a single idea, at most a few short lines. Markdown is allowed. ' +
              'No preamble, no restating the question. ' +
              context,
          },
          { role: 'user', content: front },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const data = await res.json();
    const answer: string | undefined = data?.choices?.[0]?.message?.content;
    if (!answer?.trim()) throw new Error('AI returned an empty answer.');
    return answer.trim();
  }
}
