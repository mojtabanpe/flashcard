import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private readonly toast = inject(ToastService);
  private readonly http = inject(HttpClient);
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private generation = 0;

  async speak(text: string): Promise<void> {
    const trimmed = text?.trim();
    if (!trimmed) return;
    const generation = ++this.generation;
    this.cancel();
    try {
      const blob = await firstValueFrom(this.http.post(environment.apiUrl + '/pronunciation', { text: trimmed }, {
        responseType: 'blob', withCredentials: true, headers: { 'X-Recall-Client': 'web' },
      }));
      if (generation !== this.generation) return;
      this.url = URL.createObjectURL(blob);
      this.audio = new Audio(this.url);
      this.audio.onended = () => { if (generation === this.generation) this.cancel(); };
      await this.audio.play();
    } catch {
      if (generation === this.generation) {
        this.cancel();
        this.toast.error('Could not play pronunciation.');
      }
    }
  }

  private cancel() {
    this.audio?.pause();
    this.audio = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
