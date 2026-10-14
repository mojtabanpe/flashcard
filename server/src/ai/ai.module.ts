import {
  BadGatewayException,
  Body,
  Controller,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
class CardAnswerDto {
  @IsString() @Matches(/\S/) @MaxLength(500) front!: string;
  @IsOptional() @IsString() @MaxLength(120) deck?: string;
  @IsOptional() @IsString() @MaxLength(1000) context?: string;
}
export type CardAnswer = { front: string; back: string; examples: string };
const instructions = `You write answers for English vocabulary flashcards.
The front of the card is a word or phrase. Reply with JSON only, no prose, in this shape:
{"front": "...", "back": "...", "examples": "..."}
- "front": the word or phrase in dictionary form (e.g. "took" becomes "take", "children" becomes "child"); keep set phrases as written.
- "back": a concise English learner's definition (one sentence, at most 25 words). Do not repeat the word, add translations, part-of-speech labels or unit names.
- "examples": two or three natural English example sentences using the word, as a Markdown list with one "- " item per line.
If a context sentence is given, define the meaning used in that sentence.
Everything must be in English.`;
/** Accepts raw JSON or JSON wrapped in prose/code fences, and validates its shape. */
export function parseCardAnswer(content: string, front: string): CardAnswer {
  const start = content.indexOf('{'),
    end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in AI response');
  const value = JSON.parse(content.slice(start, end + 1)) as Record<
    string,
    unknown
  >;
  const lemma =
    typeof value['front'] === 'string' && value['front'].trim().length <= 500
      ? value['front'].trim()
      : '';
  const back = typeof value['back'] === 'string' ? value['back'].trim() : '';
  const examples = Array.isArray(value['examples'])
    ? value['examples'].map((line) => '- ' + String(line).trim()).join('\n')
    : typeof value['examples'] === 'string'
      ? value['examples'].trim()
      : '';
  if (!back || back.length > 2000 || examples.length > 5000)
    throw new Error('Invalid AI response');
  return { front: lemma || front.trim(), back, examples };
}
@Injectable()
export class AiService {
  async cardAnswer(
    front: string,
    deck?: string,
    context?: string,
  ): Promise<CardAnswer> {
    const endpoint =
      process.env['AI_URL'] ?? 'http://127.0.0.1:20128/v1/chat/completions';
    const model = process.env['AI_MODEL'] ?? 'zaban';
    // Same 9Router gateway as TTS, so its key is reused unless AI_API_KEY is set.
    const key = process.env['AI_API_KEY'] ?? process.env['TTS_API_KEY'];
    if (!key)
      throw new ServiceUnavailableException('AI answers are not configured.');
    try {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
        },
        body: JSON.stringify({
          model,
          stream: false,
          temperature: 0.3,
          messages: [
            { role: 'system', content: instructions },
            {
              role: 'user',
              content:
                (deck?.trim() ? 'Deck: ' + deck.trim() + '\n' : '') +
                'Front: ' +
                front.trim() +
                (context?.trim() ? '\nContext: ' + context.trim() : ''),
            },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!result.ok) throw new Error('Upstream AI request failed');
      const body = (await result.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Invalid AI response');
      return parseCardAnswer(content, front);
    } catch {
      throw new BadGatewayException('Could not generate an answer. Try again.');
    }
  }
}
@Controller('ai')
class AiController {
  constructor(private readonly ai: AiService) {}
  @Post('card-answer')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  cardAnswer(@Body() body: CardAnswerDto) {
    return this.ai.cardAnswer(body.front, body.deck, body.context);
  }
}
@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
