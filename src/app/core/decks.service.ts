import { Injectable, inject } from '@angular/core';
import { Deck, DeckColor, DeckWithStats } from './models';
import { ApiService } from './api.service';
@Injectable({ providedIn: 'root' })
export class DecksService {
  private readonly api = inject(ApiService);
  listWithStats(): Promise<DeckWithStats[]> {
    return this.api.request('GET', '/decks');
  }
  get(id: string): Promise<Deck> {
    return this.api.request('GET', '/decks/' + encodeURIComponent(id));
  }
  create(name: string, description: string, color: DeckColor): Promise<Deck> {
    return this.api.request('POST', '/decks', { name, description, color });
  }
  async update(
    id: string,
    patch: Partial<Pick<Deck, 'name' | 'description' | 'color'>>,
  ): Promise<void> {
    await this.api.request('PATCH', '/decks/' + encodeURIComponent(id), patch);
  }
  async remove(id: string): Promise<void> {
    await this.api.request('DELETE', '/decks/' + encodeURIComponent(id));
  }
}
