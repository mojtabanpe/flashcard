import { Card, Rating } from './models';

/**
 * The slice of a card that the spaced-repetition algorithm reads and writes.
 * Kept separate from {@link Card} so the algorithm stays pure and testable.
 */
export interface SrsState {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_reviewed_at: string | null;
}

const RATING_QUALITY: Record<Rating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/**
 * SM-2 spaced repetition. Given a card and how the user rated their recall,
 * returns the next ease factor, interval and due date.
 *
 * A failed recall ("again") resets the streak and re-schedules the card a few
 * minutes out so it returns later in the same session. A passing grade grows
 * the interval geometrically by the ease factor.
 */
export function schedule(card: Pick<Card, keyof SrsState>, rating: Rating, now = new Date()): SrsState {
  const quality = RATING_QUALITY[rating];
  let { ease_factor: ease, interval_days: interval, repetitions } = card;

  if (quality < 3) {
    repetitions = 0;
    interval = 0;
    return {
      ease_factor: Math.max(1.3, ease - 0.2),
      interval_days: interval,
      repetitions,
      due_at: new Date(now.getTime() + 5 * MINUTE).toISOString(),
      last_reviewed_at: now.toISOString(),
    };
  }

  if (repetitions === 0) {
    interval = 1;
  } else if (repetitions === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * ease);
  }
  // "Hard" earns a pass but dampens growth; "easy" stretches the interval out.
  if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.6));
  if (rating === 'easy') interval = Math.round(interval * 1.3);

  repetitions += 1;
  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ease = Math.max(1.3, ease);

  return {
    ease_factor: Math.round(ease * 100) / 100,
    interval_days: interval,
    repetitions,
    due_at: new Date(now.getTime() + interval * DAY).toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

/** Human-friendly label for when a card will next be seen, used on rating buttons. */
export function previewInterval(card: Pick<Card, keyof SrsState>, rating: Rating): string {
  const next = schedule(card, rating);
  if (rating === 'again') return '5m';
  if (next.interval_days < 1) return '<1d';
  if (next.interval_days === 1) return '1d';
  if (next.interval_days < 30) return `${next.interval_days}d`;
  if (next.interval_days < 365) return `${Math.round(next.interval_days / 30)}mo`;
  return `${Math.round(next.interval_days / 365)}y`;
}
