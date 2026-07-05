import { Injectable, inject } from '@angular/core';
import { Card, Rating } from './models';
import { schedule } from './srs';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private get db() {
    return this.supabase.client;
  }

  async listByDeck(deckId: string): Promise<Card[]> {
    const { data, error } = await this.db
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Card[];
  }

  /** Cards in a deck that are due for review now, oldest-due first. */
  async listDue(deckId: string): Promise<Card[]> {
    const { data, error } = await this.db
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Card[];
  }

  async create(deckId: string, front: string, back: string): Promise<Card> {
    const user = this.auth.user();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await this.db
      .from('cards')
      .insert({ deck_id: deckId, user_id: user.id, front, back })
      .select()
      .single();
    if (error) throw error;
    return data as Card;
  }

  async update(id: string, patch: Partial<Pick<Card, 'front' | 'back'>>): Promise<void> {
    const { error } = await this.db.from('cards').update(patch).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('cards').delete().eq('id', id);
    if (error) throw error;
  }

  /** Apply a review rating: compute the next SM-2 schedule and persist it. */
  async review(card: Card, rating: Rating): Promise<Card> {
    const next = schedule(card, rating);
    const { data, error } = await this.db
      .from('cards')
      .update(next)
      .eq('id', card.id)
      .select()
      .single();
    if (error) throw error;
    return data as Card;
  }
}
