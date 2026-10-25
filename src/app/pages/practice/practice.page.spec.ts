import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { PracticePage } from './practice.page';
import { PracticeService } from '../../core/practice.service';
import { DecksService } from '../../core/decks.service';
import { CardsService } from '../../core/cards.service';
import { TtsService } from '../../core/tts.service';
import { ToastService } from '../../core/toast.service';

describe('Practice tab drafts', () => {
  it('keeps speaking and writing tasks and answers separate when switching tabs', async () => {
    const tts = { stop: vi.fn(), readAloud: vi.fn().mockResolvedValue(undefined), speak: vi.fn(), rate: 1 };
    const service = { writingTask: vi.fn().mockResolvedValueOnce({ scenario: 'Order a coffee.', message: 'What would you like?' }).mockResolvedValueOnce({ scenario: 'Text a friend.', message: 'Free tonight?' }) };
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      { provide: PracticeService, useValue: service },
      { provide: DecksService, useValue: { listWithStats: () => Promise.resolve([]) } },
      { provide: CardsService, useValue: {} },
      { provide: TtsService, useValue: tts },
      { provide: ToastService, useValue: {} },
    ] });
    const fixture = TestBed.createComponent(PracticePage);
    const page = fixture.componentInstance as any;
    page.setMode('speaking');
    await page.newTask();
    page.answer.set('A latte, please.');
    page.feedback.set({ comment: 'Nice answer.' });
    page.setMode('writing');
    expect(page.task()).toBeNull();
    await page.newTask();
    page.answer.set('Yes, see you tonight.');
    page.setMode('listening');
    page.setMode('speaking');
    expect(page.task().scenario).toBe('Order a coffee.');
    expect(page.answer()).toBe('A latte, please.');
    expect(page.feedback().comment).toBe('Nice answer.');
    page.setMode('writing');
    expect(page.task().scenario).toBe('Text a friend.');
    expect(page.answer()).toBe('Yes, see you tonight.');
    let resolveTask!: (value: { scenario: string; message: string }) => void;
    service.writingTask.mockImplementationOnce(() => new Promise(resolve => { resolveTask = resolve; }));
    page.setMode('speaking');
    const pending = page.newTask();
    page.setMode('writing');
    resolveTask({ scenario: 'Ask for directions.', message: 'Where are you going?' });
    await pending;
    expect(page.task().scenario).toBe('Text a friend.');
    page.setMode('speaking');
    expect(page.task().scenario).toBe('Ask for directions.');
    expect(page.busy()).toBe(false);
    page.dialogue.set({ title: 'Chat', lines: [
      { speaker: 'Amy', text: 'Hi' }, { speaker: 'Ben', text: 'Hello' },
      { speaker: 'Ben', text: 'How are you?' }, { speaker: 'Amy', text: 'Good!' },
    ], questions: [], phrases: [] });
    await page.playAll();
    expect(tts.readAloud.mock.calls[0][2]).toEqual(['primary', 'secondary', 'secondary', 'primary']);
    page.speak('Hello', page.speakerVoice('Ben'));
    expect(tts.speak).toHaveBeenCalledWith('Hello', 'secondary');
    fixture.destroy();
  });
});
