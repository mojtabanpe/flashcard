import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import {
  ConversationSituation,
  Dialogue,
  ReadingLevel,
  WritingFeedback,
  WritingTask,
} from './models';

/** Everyday-conversation exercises written by AI on the server. */
@Injectable({ providedIn: 'root' })
export class PracticeService {
  private readonly api = inject(ApiService);

  transcribe(audio: Blob): Promise<{ text: string }> {
    return this.api.request('POST', '/ai/practice/transcribe', audio);
  }

  writingTask(situation: ConversationSituation, level: ReadingLevel): Promise<WritingTask> {
    return this.api.request('POST', '/ai/practice/writing-task', { situation, level });
  }

  writingFeedback(
    situation: ConversationSituation,
    level: ReadingLevel,
    task: WritingTask,
    answer: string,
  ): Promise<WritingFeedback> {
    return this.api.request('POST', '/ai/practice/writing-feedback', {
      situation,
      level,
      scenario: task.scenario,
      ...(task.message ? { message: task.message } : {}),
      answer,
    });
  }

  dialogue(situation: ConversationSituation, level: ReadingLevel): Promise<Dialogue> {
    return this.api.request('POST', '/ai/practice/dialogue', { situation, level });
  }
}
