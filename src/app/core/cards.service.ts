import { Injectable, inject } from '@angular/core';
import { Card, Rating } from './models';
import { ApiService } from './api.service';
@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly api = inject(ApiService);
  listByDeck(deckId: string): Promise<Card[]> {
    return this.api.request('GET', '/cards?deck_id=' + encodeURIComponent(deckId));
  }
  listDue(deckId: string): Promise<Card[]> {
    return this.api.request('GET', '/cards?deck_id=' + encodeURIComponent(deckId) + '&due=true');
  }
  create(deckId: string, front: string, back: string, unit = '', examples = ''): Promise<Card> {
    return this.api.request('POST', '/cards', { deck_id: deckId, front, back, unit, examples });
  }
  async update(id: string, patch: Partial<Pick<Card, 'front' | 'back' | 'unit' | 'examples'>>): Promise<void> {
    await this.api.request('PATCH', '/cards/' + encodeURIComponent(id), patch);
  }
  async remove(id: string): Promise<void> {
    await this.api.request('DELETE', '/cards/' + encodeURIComponent(id));
  }
  async unsuspend(id: string): Promise<void> {
    await this.api.request('POST', '/cards/' + encodeURIComponent(id) + '/unsuspend', {});
  }
  review(card: Card, rating: Rating): Promise<Card> {
    return this.api.request('POST', '/cards/' + encodeURIComponent(card.id) + '/review', {
      rating,
    });
  }
}
