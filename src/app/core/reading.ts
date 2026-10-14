/** A run of text in the reader; only `word` tokens can be looked up. */
export interface ReadingToken {
  id: number;
  text: string;
  word: boolean;
  /** Index into `ReadingDoc.sentences`. */
  sentence: number;
}

export interface ReadingDoc {
  paragraphs: ReadingToken[][];
  sentences: string[];
  /** Groups of consecutive sentence indices read aloud as one request. */
  chunks: number[][];
}

const WORD = /\p{L}(?:[\p{L}\p{M}'’-]*\p{L})?/gu;

function splitSentences(paragraph: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(paragraph), (s) => s.segment);
  }
  return paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) ?? [paragraph];
}

/**
 * Split text into paragraphs of word/space tokens tagged with their sentence,
 * and group sentences into chunks of at least `minChunk` characters (at most
 * `maxChunk`) so reading aloud stays within the pronunciation rate limit.
 */
export function parseReading(body: string, minChunk = 220, maxChunk = 1800): ReadingDoc {
  const paragraphs: ReadingToken[][] = [];
  const sentences: string[] = [];
  let id = 0;
  for (const paragraph of body.split(/\n\s*\n|\r\n\s*\r\n/)) {
    if (!paragraph.trim()) continue;
    const tokens: ReadingToken[] = [];
    for (const sentence of splitSentences(paragraph)) {
      if (!sentence.trim()) {
        tokens.push({ id: id++, text: sentence, word: false, sentence: Math.max(0, sentences.length - 1) });
        continue;
      }
      const index = sentences.length;
      sentences.push(sentence.trim());
      let last = 0;
      for (const match of sentence.matchAll(WORD)) {
        if (match.index > last) tokens.push({ id: id++, text: sentence.slice(last, match.index), word: false, sentence: index });
        tokens.push({ id: id++, text: match[0], word: true, sentence: index });
        last = match.index + match[0].length;
      }
      if (last < sentence.length) tokens.push({ id: id++, text: sentence.slice(last), word: false, sentence: index });
    }
    paragraphs.push(tokens);
  }
  const chunks: number[][] = [];
  let current: number[] = [], length = 0;
  sentences.forEach((sentence, index) => {
    if (current.length && length + sentence.length > maxChunk) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(index);
    length += sentence.length + 1;
    if (length >= minChunk) {
      chunks.push(current);
      current = [];
      length = 0;
    }
  });
  if (current.length) chunks.push(current);
  return { paragraphs, sentences, chunks };
}
