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
  /** Written by AI; only these texts are rated. */
  ai: boolean;
  /** 1-5 stars, or null until rated. */
  rating: number | null;
  review_note: string;
  rated_at: string | null;
}

/** Topics offered when generating a reading text with AI. */
export const READING_TOPICS = [
  { id: 'technology', label: 'Technology' },
  { id: 'science', label: 'Science' },
  { id: 'health', label: 'Health & fitness' },
  { id: 'sports', label: 'Sports' },
  { id: 'travel', label: 'Travel' },
  { id: 'food', label: 'Food & cooking' },
  { id: 'business', label: 'Business & work' },
  { id: 'money', label: 'Money & economy' },
  { id: 'environment', label: 'Environment & nature' },
  { id: 'animals', label: 'Animals' },
  { id: 'history', label: 'History' },
  { id: 'culture', label: 'Culture & traditions' },
  { id: 'arts', label: 'Art & design' },
  { id: 'entertainment', label: 'Movies, music & books' },
  { id: 'psychology', label: 'Psychology' },
  { id: 'education', label: 'Education & learning' },
  { id: 'space', label: 'Space & astronomy' },
  { id: 'relationships', label: 'Family & relationships' },
  { id: 'daily-life', label: 'Everyday life' },
  { id: 'story', label: 'Short story' },
] as const;
export type ReadingTopic = (typeof READING_TOPICS)[number]['id'];

export const READING_LEVELS = [
  { id: 'B1', label: 'Intermediate (B1)' },
  { id: 'B2', label: 'Upper-intermediate (B2)' },
  { id: 'C1', label: 'Advanced (C1)' },
] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number]['id'];

/** Everyday situations for conversation practice (writing and listening). */
export const CONVERSATION_SITUATIONS = [
  { id: 'small-talk', label: 'Small talk' },
  { id: 'cafe', label: 'Café & restaurant' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'plans', label: 'Making plans with friends' },
  { id: 'texting', label: 'Texting a friend' },
  { id: 'work', label: 'At work' },
  { id: 'doctor', label: 'Doctor & pharmacy' },
  { id: 'directions', label: 'Travel & directions' },
  { id: 'hotel', label: 'Hotel & booking' },
  { id: 'phone', label: 'Phone calls & appointments' },
  { id: 'home', label: 'Neighbours & home' },
  { id: 'problems', label: 'Problems & complaints' },
  { id: 'feelings', label: 'Feelings & opinions' },
  { id: 'family', label: 'Family & friends' },
] as const;
export type ConversationSituation = (typeof CONVERSATION_SITUATIONS)[number]['id'];

export interface UsefulPhrase {
  phrase: string;
  meaning: string;
}

/** A short everyday writing task: the situation and what the other person said. */
export interface WritingTask {
  scenario: string;
  /** The other person's words the learner answers; may be empty. */
  message: string;
}

export interface WritingFeedback {
  /** The learner's text with only the mistakes fixed. */
  corrected: string;
  /** How a native speaker would naturally say it. */
  natural: string;
  mistakes: { original: string; fix: string; why: string }[];
  phrases: UsefulPhrase[];
  comment: string;
}

/** A short everyday conversation for listening practice. */
export interface Dialogue {
  title: string;
  lines: { speaker: string; text: string }[];
  questions: { question: string; options: string[]; answer: number }[];
  phrases: UsefulPhrase[];
}

/** How well the user recalled a card during review. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';
