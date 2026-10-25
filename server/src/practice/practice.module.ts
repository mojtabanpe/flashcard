import type { Request } from 'express';
import {
  BadGatewayException,
  BadRequestException,
  Req,
  Body,
  Controller,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AiModule, AiService } from '../ai/ai.module';
import {
  CONVERSATION_SITUATIONS,
  READING_LEVELS,
  type ConversationSituation,
  type Dialogue,
  type ReadingLevel,
  type UsefulPhrase,
  type WritingFeedback,
  type WritingTask,
} from '../../../shared/models';
class PracticeDto {
  @IsIn(CONVERSATION_SITUATIONS.map((s) => s.id)) situation!: ConversationSituation;
  @IsOptional() @IsIn(READING_LEVELS.map((l) => l.id)) level?: ReadingLevel;
}
class WritingFeedbackDto extends PracticeDto {
  @IsString() @Matches(/\S/) @MaxLength(600) scenario!: string;
  @IsOptional() @IsString() @MaxLength(600) message?: string;
  @IsString() @Matches(/\S/) @MaxLength(3000) answer!: string;
}
const goal =
  'The learner is studying English to take part in everyday conversation, so prefer natural, spoken, everyday English (contractions, common phrasal verbs and expressions) over formal or exam-style English.';
const taskInstructions = `You create short everyday-English writing practice. ${goal}
Reply with JSON only, no prose, in this shape: {"scenario": "...", "message": "..."}
- "scenario": one or two sentences, in the second person, describing a realistic everyday situation and what the learner should write (a reply to a text, what they would say, a short note).
- "message": what the other person said or wrote, which the learner answers (one to three natural sentences), or "" if nobody spoke first.
Fit the given CEFR level. Everything must be in English.`;
const feedbackInstructions = `You are a friendly English teacher. ${goal}
Check the learner's answer to the task. Reply with JSON only, no prose, in this shape:
{"corrected": "...", "natural": "...", "mistakes": [{"original": "...", "fix": "...", "why": "..."}], "phrases": [{"phrase": "...", "meaning": "..."}], "comment": "..."}
- "corrected": the learner's text with only the mistakes fixed; keep their own words otherwise.
- "natural": how a native speaker would naturally say it in this situation.
- "mistakes": at most 8 grammar, word-choice or unnatural-phrasing problems, each with a short, simple explanation; [] if there are none.
- "phrases": 2 to 4 useful everyday phrases for this situation, each with a short meaning.
- "comment": one or two encouraging sentences with the single most useful tip.
Everything must be in English.`;
const dialogueInstructions = `You write short everyday English conversations for listening practice. ${goal}
Reply with JSON only, no prose, in this shape:
{"title": "...", "lines": [{"speaker": "...", "text": "..."}], "questions": [{"question": "...", "options": ["...", "...", "..."], "answer": 0}], "phrases": [{"phrase": "...", "meaning": "..."}]}
- Two speakers with first names, 10 to 16 lines, sounding like real people talking (contractions, short turns, words like "well", "oh", "actually").
- "questions": 3 multiple-choice questions about details of the conversation, each with 3 options; "answer" is the index of the correct option.
- "phrases": 3 to 5 useful everyday phrases used in the conversation, each with a short meaning.
- "title": at most 8 words.
Fit the given CEFR level. Everything must be in English.`;
const levelNames: Record<ReadingLevel, string> = {
  B1: 'B1 (intermediate)',
  B2: 'B2 (upper-intermediate)',
  C1: 'C1 (advanced)',
};
type Json = Record<string, unknown>;
/** Accepts raw JSON or JSON wrapped in prose/code fences. */
function parseObject(content: string): Json {
  const start = content.indexOf('{'),
    end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in AI response');
  const value: unknown = JSON.parse(content.slice(start, end + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid AI response');
  return value as Json;
}
function text(value: unknown, max: number, required = true): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max) throw new Error('Invalid AI response');
  return result;
}
function list(value: unknown, max: number): Json[] {
  return Array.isArray(value)
    ? value.filter((item): item is Json => !!item && typeof item === 'object').slice(0, max)
    : [];
}
function phrases(value: unknown, max: number): UsefulPhrase[] {
  return list(value, max)
    .map((p) => ({ phrase: text(p['phrase'], 200, false), meaning: text(p['meaning'], 400, false) }))
    .filter((p) => p.phrase && p.meaning);
}
export function parseWritingTask(content: string): WritingTask {
  const value = parseObject(content);
  return { scenario: text(value['scenario'], 600), message: text(value['message'], 600, false) };
}
export function parseWritingFeedback(content: string): WritingFeedback {
  const value = parseObject(content);
  return {
    corrected: text(value['corrected'], 4000),
    natural: text(value['natural'], 4000),
    mistakes: list(value['mistakes'], 8)
      .map((m) => ({
        original: text(m['original'], 400, false),
        fix: text(m['fix'], 400, false),
        why: text(m['why'], 600, false),
      }))
      .filter((m) => m.original && m.fix),
    phrases: phrases(value['phrases'], 4),
    comment: text(value['comment'], 800, false),
  };
}
export function parseDialogue(content: string): Dialogue {
  const value = parseObject(content);
  const lines = list(value['lines'], 24)
    .map((l) => ({ speaker: text(l['speaker'], 40, false), text: text(l['text'], 600, false) }))
    .filter((l) => l.speaker && l.text);
  const questions = list(value['questions'], 5)
    .map((q) => {
      const options = Array.isArray(q['options'])
        ? q['options'].map((o) => text(o, 300, false)).filter(Boolean).slice(0, 4)
        : [];
      return { question: text(q['question'], 400, false), options, answer: Number(q['answer']) };
    })
    .filter(
      (q) =>
        q.question && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length,
    );
  if (lines.length < 4) throw new Error('Invalid AI response');
  return { title: text(value['title'], 200), lines, questions, phrases: phrases(value['phrases'], 5) };
}
@Injectable()
export class PracticeService {
  constructor(private readonly ai: AiService) {}
  private async ask<T>(system: string, user: string, temperature: number, parse: (content: string) => T) {
    try {
      return parse(
        await this.ai.chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          90000,
        ),
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadGatewayException('Could not prepare the exercise. Try again.');
    }
  }
  private context(situation: ConversationSituation, level: ReadingLevel = 'B1') {
    const label = CONVERSATION_SITUATIONS.find((s) => s.id === situation)!.label;
    return 'Situation: ' + label + '\nLevel: ' + levelNames[level];
  }
  writingTask(situation: ConversationSituation, level?: ReadingLevel) {
    return this.ask(taskInstructions, this.context(situation, level), 0.9, parseWritingTask);
  }
  writingFeedback(body: WritingFeedbackDto) {
    return this.ask(
      feedbackInstructions,
      this.context(body.situation, body.level) +
        '\nTask: ' +
        body.scenario.trim() +
        (body.message?.trim() ? '\nThe other person said: ' + body.message.trim() : '') +
        "\nThe learner's answer:\n---\n" +
        body.answer.trim() +
        '\n---',
      0.3,
      parseWritingFeedback,
    );
  }
  async transcribe(audio: Buffer, contentType: string) {
    if (!Buffer.isBuffer(audio) || !audio.length)
      throw new BadRequestException('Record an audio answer first.');
    if (audio.length > 1500 * 1024) throw new BadRequestException('Recording is too large.');
    const mime = contentType.split(';')[0];
    const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
    if (!extensions[mime]) throw new BadRequestException('Unsupported audio format.');
    const key = process.env['STT_API_KEY'] ?? process.env['AI_API_KEY'] ?? process.env['TTS_API_KEY'];
    if (!key) throw new ServiceUnavailableException('Speech recognition is not configured.');
    const endpoint = process.env['STT_URL'] ?? new URL('audio/transcriptions', (process.env['AI_URL'] ?? process.env['TTS_URL'] ?? 'http://127.0.0.1:20128/v1/chat/completions').replace(/(?:chat\/completions|audio\/speech)$/, '')).href;
    const form = new FormData();
    form.set('model', process.env['STT_MODEL'] ?? 'dg/whisper-large');
    form.set('file', new Blob([new Uint8Array(audio)], { type: mime }), 'answer.' + extensions[mime]);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error('Transcription failed');
      const result = await response.json() as { text?: unknown };
      if (typeof result.text !== 'string' || !result.text.trim())
        throw new Error('No speech recognized');
      return { text: result.text.trim().slice(0, 3000) };
    } catch {
      throw new BadGatewayException('Could not understand the recording. Try again or type your answer.');
    }
  }
  dialogue(situation: ConversationSituation, level?: ReadingLevel) {
    return this.ask(dialogueInstructions, this.context(situation, level), 0.9, parseDialogue);
  }
}
@Controller('ai/practice')
class PracticeController {
  constructor(private readonly practice: PracticeService) {}
  @Post('transcribe')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  transcribe(@Req() request: Request) {
    return this.practice.transcribe(request.body, request.headers['content-type'] ?? '');
  }
  @Post('writing-task')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  writingTask(@Body() body: PracticeDto) {
    return this.practice.writingTask(body.situation, body.level);
  }
  @Post('writing-feedback')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  writingFeedback(@Body() body: WritingFeedbackDto) {
    return this.practice.writingFeedback(body);
  }
  @Post('dialogue')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  dialogue(@Body() body: PracticeDto) {
    return this.practice.dialogue(body.situation, body.level);
  }
}
@Module({ imports: [AiModule], controllers: [PracticeController], providers: [PracticeService] })
export class PracticeModule {}
