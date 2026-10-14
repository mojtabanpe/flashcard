import { matchesCard } from './card-search';

describe('vocabulary search', () => {
  const card = { front: 'café', back: 'U19 A small restaurant', unit: '', examples: 'We had coffee together.' };
  it('searches definitions and examples without case or accent differences', () => {
    expect(matchesCard(card, 'CAFE coffee', '')).toBe(true);
    expect(matchesCard(card, 'coffee unknown', '')).toBe(false);
  });
  it('filters both explicit and legacy unit tags', () => {
    expect(matchesCard(card, '', 'u19')).toBe(true);
    expect(matchesCard({ ...card, unit: 'u20' }, '', 'u19')).toBe(false);
    expect(matchesCard({ ...card, unit: 'u20' }, '', 'u20')).toBe(true);
  });
  it('accepts whitespace and an empty query', () => {
    expect(matchesCard(card, '   ', '')).toBe(true);
    expect(matchesCard(card, 'small   restaurant', 'u19')).toBe(true);
  });
});
