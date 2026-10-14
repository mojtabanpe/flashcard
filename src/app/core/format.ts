/**
 * Cards in the tactics deck store their unit on the back, e.g.
 * "U1 a person who exercises…". This splits the leading unit tag (U1, U2, …)
 * from the definition so it can be rendered as a subtitle above the body.
 */
export interface UnitSplit {
  unit: string | null;
  body: string;
}

export function splitUnit(back: string): UnitSplit {
  const match = back.match(/^u\d+\s+/i);
  if (!match) return { unit: null, body: back };
  return { unit: match[0].trim().toLowerCase(), body: back.slice(match[0].length) };
}

/** Prefer explicit metadata; continue to support older cards with a leading unit. */
export function cardParts(card: { back: string; unit?: string }): UnitSplit {
  const legacy = splitUnit(card.back);
  return { unit: card.unit?.toLowerCase() || legacy.unit, body: legacy.body };
}
