export type DeckColor = 'amber' | 'rose' | 'sage' | 'sky' | 'violet' | 'clay';

export const DECK_COLORS: DeckColor[] = ['amber', 'rose', 'sage', 'sky', 'violet', 'clay'];

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: DeckColor;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  /** Unit badge, separate from the answer (e.g. u19). */
  unit: string;
  /** Optional examples, revealed only on request. */
  examples: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  /** Times this card was rated "Again". Lightner tracks this to find leeches. */
  lapses: number;
  /** Leeches (or manually hidden cards) are pulled out of the review rotation. */
  suspended: boolean;
  /** How many times this card has been suspended — Lightner deletes at 2. */
  suspensions: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A deck plus computed study counts, used on the dashboard. */
export interface DeckWithStats extends Deck {
  total: number;
  due: number;
  suspended: number;
}

/** A passage the user reads aloud and mines for vocabulary. */
export interface ReadingText {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** How well the user recalled a card during review. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';
