import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AudioCacheService,
  AudioResult,
} from '../audio-cache/audio-cache.service';
export function speechCacheKey(
  userId: string,
  endpoint: string,
  model: string,
  text: string,
) {
  return (
    'recall:tts:v1:' +
    createHash('sha256')
      .update(JSON.stringify([userId, endpoint, model, text.trim()]))
      .digest('hex')
  );
}
export type SpeechResult = AudioResult & {
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
};
@Injectable()
export class SpeechService {
  private readonly pending = new Map<string, Promise<SpeechResult>>();
  constructor(private readonly cache: AudioCacheService) {}
  async speak(userId: string, text: string): Promise<SpeechResult> {
    const endpoint =
      process.env['TTS_URL'] ?? 'http://127.0.0.1:20128/v1/audio/speech';
    const model =
      process.env['TTS_MODEL'] ?? 'edge-tts/en-US-MichelleNeural';
    const normalized = text.trim(),
      key = speechCacheKey(userId, endpoint, model, normalized);
    const running = this.pending.get(key);
    if (running) return running;
    const request = this.load(key, endpoint, model, normalized);
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }
  private async load(
    cacheKey: string,
    endpoint: string,
    model: string,
    text: string,
  ): Promise<SpeechResult> {
    const cached = await this.cache.get(cacheKey);
    if (cached) return { ...cached, cacheStatus: 'HIT' };
    const key = process.env['TTS_API_KEY'];
    if (!key)
      throw new ServiceUnavailableException('Pronunciation is not configured.');
    try {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
        },
        body: JSON.stringify({ model, input: text }),
        signal: AbortSignal.timeout(30000),
      });
      if (!result.ok) throw new Error('Upstream speech request failed');
      const contentType = result.headers.get('content-type') ?? '';
      if (!/^(audio\/|application\/octet-stream)/i.test(contentType))
        throw new Error('Invalid speech response');
      if (Number(result.headers.get('content-length')) > 10 * 1024 * 1024)
        throw new Error('Speech too large');
      const audio = Buffer.from(await result.arrayBuffer());
      if (!audio.length || audio.length > 10 * 1024 * 1024)
        throw new Error('Invalid speech size');
      const saved = await this.cache.set(cacheKey, { audio, contentType });
      return { audio, contentType, cacheStatus: saved ? 'MISS' : 'BYPASS' };
    } catch {
      throw new BadGatewayException('Could not play pronunciation. Try again.');
    }
  }
}
