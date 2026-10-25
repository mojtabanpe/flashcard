import { Injectable, inject } from '@angular/core';
import { ReadingText } from './models';
import { ApiService } from './api.service';
@Injectable({ providedIn: 'root' })
export class TextsService {
  private readonly api = inject(ApiService);
  list(): Promise<ReadingText[]> {
    return this.api.request('GET', '/texts');
  }
  get(id: string): Promise<ReadingText> {
    return this.api.request('GET', '/texts/' + encodeURIComponent(id));
  }
  create(title: string, body: string, ai = false): Promise<ReadingText> {
    return this.api.request('POST', '/texts', { title, body, ...(ai ? { ai } : {}) });
  }
  review(id: string, rating: number, note: string): Promise<ReadingText> {
    return this.api.request('PATCH', '/texts/' + encodeURIComponent(id) + '/review', { rating, note });
  }
  async remove(id: string): Promise<void> {
    await this.api.request('DELETE', '/texts/' + encodeURIComponent(id));
  }
}
