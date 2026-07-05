import { Injectable, inject } from '@angular/core';
import { Deck, DeckColor, DeckWithStats } from './models';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class DecksService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private get db() {
    return this.supabase.client;
  }

  /** All decks for the current user, each with total + due-now card counts. */
  async listWithStats(): Promise<DeckWithStats[]> {
    const { data: decks, error } = await this.db
      .from('decks')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const { data: cards, error: cardErr } = await this.db
      .from('cards')
      .select('deck_id, due_at');
    if (cardErr) throw cardErr;

    const now = Date.now();
    const counts = new Map<string, { total: number; due: number }>();
    for (const c of cards ?? []) {
      const entry = counts.get(c.deck_id) ?? { total: 0, due: 0 };
      entry.total += 1;
      if (new Date(c.due_at).getTime() <= now) entry.due += 1;
      counts.set(c.deck_id, entry);
    }

    return (decks ?? []).map((d) => ({
      ...(d as Deck),
      total: counts.get(d.id)?.total ?? 0,
      due: counts.get(d.id)?.due ?? 0,
    }));
  }

  async get(id: string): Promise<Deck> {
    const { data, error } = await this.db.from('decks').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Deck;
  }

  async create(name: string, description: string, color: DeckColor): Promise<Deck> {
    const user = this.auth.user();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await this.db
      .from('decks')
      .insert({ name, description, color, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Deck;
  }

  async update(id: string, patch: Partial<Pick<Deck, 'name' | 'description' | 'color'>>): Promise<void> {
    const { error } = await this.db.from('decks').update(patch).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('decks').delete().eq('id', id);
    if (error) throw error;
  }
}
