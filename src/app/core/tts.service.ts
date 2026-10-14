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
  private finish: (() => void) | null = null;

  async speak(text: string): Promise<void> {
    const trimmed = text?.trim();
    if (!trimmed) return;
    const generation = ++this.generation;
    this.cancel();
    try {
      const blob = await this.fetchAudio(trimmed);
      if (generation !== this.generation) return;
      await this.play(blob, generation);
    } catch {
      if (generation === this.generation) {
        this.cancel();
        this.toast.error('Could not play pronunciation.');
      }
    }
  }

  /**
   * Read `chunks` aloud in order, fetching the next chunk while the current one plays.
   * Resolves when every chunk has played or reading was stopped.
   */
  async readAloud(chunks: string[], onChunk: (index: number) => void): Promise<void> {
    const generation = ++this.generation;
    this.cancel();
    const parts = chunks.map((c) => c.trim());
    let next: Promise<Blob> | null = null;
    try {
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        const current = next ?? this.fetchAudio(parts[i]);
        const following = parts.findIndex((p, j) => j > i && !!p);
        next = following > 0 ? this.fetchAudio(parts[following]) : null;
        next?.catch(() => undefined);
        const blob = await current;
        if (generation !== this.generation) return;
        onChunk(i);
        await this.play(blob, generation);
        if (generation !== this.generation) return;
      }
    } catch {
      if (generation === this.generation) this.toast.error('Could not read the text aloud.');
    } finally {
      if (generation === this.generation) this.cancel();
    }
  }

  stop() {
    this.generation++;
    this.cancel();
  }

  private fetchAudio(text: string): Promise<Blob> {
    return firstValueFrom(this.http.post(environment.apiUrl + '/pronunciation', { text }, {
      responseType: 'blob', withCredentials: true, headers: { 'X-Recall-Client': 'web' },
    }));
  }

  /** Play one clip; resolves when it ends or is cancelled. */
  private play(blob: Blob, generation: number): Promise<void> {
    this.cancel();
    this.url = URL.createObjectURL(blob);
    const audio = (this.audio = new Audio(this.url));
    return new Promise<void>((resolve, reject) => {
      this.finish = resolve;
      audio.onended = () => {
        if (generation === this.generation) this.cancel();
        resolve();
      };
      audio.onerror = () => reject(new Error('Audio playback failed'));
      audio.play().catch(reject);
    });
  }

  private cancel() {
    this.audio?.pause();
    this.audio = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    const finish = this.finish;
    this.finish = null;
    finish?.();
  }
}
