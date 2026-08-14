import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { ToastService } from './toast.service';

/**
 * Text-to-speech via the local OpenAI-compatible /v1/audio/speech endpoint.
 * Sends the text, gets an mp3 blob back, and plays it in the browser.
 */
@Injectable({ providedIn: 'root' })
export class TtsService {
  private readonly toast = inject(ToastService);
  private audio: HTMLAudioElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Play pronunciation of `text`. Re-triggering restarts the current clip. */
  speak(text: string): void {
    const trimmed = text?.trim();
    if (!trimmed) return;

    this.cancel();
    fetch(environment.ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${environment.ttsKey}`,
      },
      body: JSON.stringify({ model: environment.ttsModel, input: trimmed }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Speech request failed (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.audio = audio;
        this.timer = setTimeout(() => URL.revokeObjectURL(url), 30_000);
        audio.play().catch(() => URL.revokeObjectURL(url));
      })
      .catch(() => this.toast.error('Could not play pronunciation.'));
  }

  private cancel() {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}