import { describe, expect, it } from 'vitest';
import { parseReading } from './reading';

describe('parseReading', () => {
  it('splits paragraphs, sentences and words while keeping the original text', () => {
    const doc = parseReading("She didn't go. It rained!\n\nThe well-known end.");
    expect(doc.paragraphs.length).toBe(2);
    expect(doc.sentences).toEqual(["She didn't go.", 'It rained!', 'The well-known end.']);
    expect(doc.paragraphs.map((p) => p.map((t) => t.text).join(''))).toEqual(["She didn't go. It rained!", 'The well-known end.']);
    const words = doc.paragraphs.flat().filter((t) => t.word);
    expect(words.map((t) => t.text)).toEqual(['She', "didn't", 'go', 'It', 'rained', 'The', 'well-known', 'end']);
    expect(words.find((t) => t.text === 'rained')?.sentence).toBe(1);
  });

  it('groups short sentences into chunks and caps long ones', () => {
    const doc = parseReading('One. Two. Three. Four.', 10);
    expect(doc.chunks).toEqual([[0, 1], [2, 3]]);
    const long = parseReading('A' + 'a'.repeat(50) + '. B' + 'b'.repeat(50) + '.', 1000, 60);
    expect(long.chunks).toEqual([[0], [1]]);
  });
});
