import {
  BadGatewayException,
  Body,
  Controller,
  Injectable,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthRequest } from '../auth/auth.guard';
import { TextsService } from '../texts/texts.service';
import { TextsModule } from '../texts/texts.module';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  READING_LEVELS,
  READING_TOPICS,
  type ReadingLevel,
  type ReadingTopic,
} from '../../../shared/models';
class CardAnswerDto {
  @IsString() @Matches(/\S/) @MaxLength(500) front!: string;
  @IsOptional() @IsString() @MaxLength(120) deck?: string;
  @IsOptional() @IsString() @MaxLength(1000) context?: string;
}
class ReadingTextDto {
  @IsIn(READING_TOPICS.map((t) => t.id)) topic!: ReadingTopic;
  @IsOptional() @IsIn(READING_LEVELS.map((l) => l.id)) level?: ReadingLevel;
}
export type CardAnswer = { front: string; back: string; examples: string };
export type GeneratedText = { title: string; body: string; feedback_from?: string };
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
const readingInstructions = `You write English reading-practice texts for language learners.
Write an original, engaging and factually careful text of about 1,000 words (between 900 and 1,100) on the given topic, at the given CEFR level, so a learner can read it closely in about 15 minutes.
- Pick one specific, interesting angle on the topic instead of a general overview.
- Use vocabulary and grammar that suit the level, with a natural range of useful words, collocations and phrasal verbs.
- Write 6 to 10 paragraphs separated by a blank line.
- Reply in plain text without Markdown: the first line is only the title (at most 10 words), then a blank line, then the text. No headings, lists, glossary, questions or notes.`;
/** The learner's verdict on their last rated text, turned into instructions. */
function feedbackNote(feedback: { title: string; rating: number; review_note: string }) {
  const note = feedback.review_note.trim();
  return (
    '\n\nThe learner rated their previous text "' +
    feedback.title +
    '" ' +
    feedback.rating +
    ' out of 5' +
    (note ? ' and wrote:\n---\n' + note + '\n---' : ' without notes') +
    '\nUse this as guidance for the new text: keep what they liked and fix what they did not. ' +
    'Take extra care this time: plan how the text meets this feedback, write it, then check it against the feedback before you answer.'
  );
}
const levelNames: Record<ReadingLevel, string> = {
  B1: 'B1 (intermediate)',
  B2: 'B2 (upper-intermediate)',
  C1: 'C1 (advanced)',
};
/** Splits "Title\n\nBody" from the model, tolerating Markdown and labels. */
export function parseReadingText(content: string): GeneratedText {
  const lines = content
    .replace(/^\s*```\w*\n?|\n?```\s*$/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n');
  const title = (lines.shift() ?? '')
    .replace(/^(?:#+\s*)?(?:title:\s*)?/i, '')
    .replace(/^["'“]|["'”]$/g, '')
    .trim();
  const body = lines
    .filter((line) => !/^#+\s/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const words = body.split(/\s+/).filter(Boolean).length;
  if (!title || title.length > 200 || words < 300 || body.length > 50000)
    throw new Error('Invalid AI response');
  return { title, body };
}
@Injectable()
export class AiService {
  constructor(private readonly texts: TextsService) {}
  /** Ask the 9Router chat endpoint; the key and model stay on the server. */
  async chat(
    messages: { role: 'system' | 'user'; content: string }[],
    temperature: number,
    timeout: number,
  ): Promise<string> {
    const endpoint =
      process.env['AI_URL'] ?? 'http://127.0.0.1:20128/v1/chat/completions';
    const model = process.env['AI_MODEL'] ?? 'zaban';
    // Same 9Router gateway as TTS, so its key is reused unless AI_API_KEY is set.
    const key = process.env['AI_API_KEY'] ?? process.env['TTS_API_KEY'];
    if (!key)
      throw new ServiceUnavailableException('AI answers are not configured.');
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({ model, stream: false, temperature, messages }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!result.ok) throw new Error('Upstream AI request failed');
    const body = (await result.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Invalid AI response');
    return content;
  }
  async readingText(
    userId: string,
    topic: ReadingTopic,
    level: ReadingLevel = 'B2',
  ): Promise<GeneratedText> {
    const label = READING_TOPICS.find((t) => t.id === topic)!.label;
    const feedback = await this.texts.latestFeedback(userId);
    try {
      const content = await this.chat(
        [
          { role: 'system', content: readingInstructions },
          {
            role: 'user',
            content:
              'Topic: ' +
              label +
              '\nLevel: ' +
              levelNames[level] +
              (feedback ? feedbackNote(feedback) : ''),
          },
        ],
        feedback ? 0.7 : 0.9,
        150000,
      );
      const text = parseReadingText(content);
      return feedback ? { ...text, feedback_from: feedback.title } : text;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadGatewayException('Could not write a text. Try again.');
    }
  }

  async cardAnswer(
    front: string,
    deck?: string,
    context?: string,
  ): Promise<CardAnswer> {
    try {
      const content = await this.chat(
        [
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
        0.3,
        60000,
      );
      return parseCardAnswer(content, front);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
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
  @Post('reading-text')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  readingText(@Req() request: AuthRequest, @Body() body: ReadingTextDto) {
    return this.ai.readingText(request.user.id, body.topic, body.level);
  }
}
@Module({
  imports: [TextsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
