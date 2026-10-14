import { Card } from './models';
import { cardParts } from './format';

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function matchesCard(
  card: Pick<Card, 'front' | 'back' | 'examples' | 'unit'>,
  query: string,
  unit: string,
): boolean {
  if (unit && cardParts(card).unit !== unit) return false;
  const text = normalize([card.front, card.back, card.examples, cardParts(card).unit].join(' '));
  return normalize(query).trim().split(/\s+/).every(word => text.includes(word));
}
