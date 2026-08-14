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
  const match = back.match(/^U\d+\s+/);
  if (!match) return { unit: null, body: back };
  return { unit: match[0].trim(), body: back.slice(match[0].length) };
}
