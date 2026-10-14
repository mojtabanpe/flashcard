import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient } from 'redis';
export interface AudioResult {
  audio: Buffer;
  contentType: string;
}
export const MIN_CACHE_SECONDS = 86400;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
@Injectable()
export class AudioCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AudioCacheService.name);
  private readonly client = process.env['REDIS_URL']
    ? createClient({
        url: process.env['REDIS_URL'],
        disableOfflineQueue: true,
        socket: {
          connectTimeout: 1000,
          reconnectStrategy: (retries) => Math.min(250 * (retries + 1), 3000),
        },
      })
    : undefined;
  readonly ttlSeconds: number;
  constructor() {
    const configured = Number(
      process.env['TTS_CACHE_TTL_SECONDS'] ?? MIN_CACHE_SECONDS,
    );
    this.ttlSeconds =
      Number.isSafeInteger(configured) && configured > 0
        ? Math.max(MIN_CACHE_SECONDS, configured)
        : MIN_CACHE_SECONDS;
    this.client?.on('error', () =>
      this.logger.warn(
        'Redis audio cache unavailable; using the speech provider.',
      ),
    );
  }
  onModuleInit() {
    void this.client
      ?.connect()
      .catch(() => this.logger.warn('Redis audio cache connection failed.'));
  }
  onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy();
  }
  async get(key: string): Promise<AudioResult | null> {
    if (!this.client?.isReady) return null;
    try {
      const value = await this.client
        .withAbortSignal(AbortSignal.timeout(1000))
        .get(key);
      if (!value || value.length > Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 1024)
        return null;
      const data: unknown = JSON.parse(value);
      if (!data || typeof data !== 'object') return null;
      const record = data as Record<string, unknown>;
      if (
        typeof record['audio'] !== 'string' ||
        typeof record['contentType'] !== 'string' ||
        !/^(audio\/|application\/octet-stream)/i.test(record['contentType'])
      )
        return null;
      const audio = Buffer.from(record['audio'], 'base64');
      if (
        !audio.length ||
        audio.length > MAX_AUDIO_BYTES ||
        audio.toString('base64') !== record['audio']
      )
        return null;
      return { audio, contentType: record['contentType'] };
    } catch {
      this.logger.warn(
        'Redis audio cache read failed; using the speech provider.',
      );
      return null;
    }
  }
  async set(key: string, value: AudioResult): Promise<boolean> {
    if (!this.client?.isReady) return false;
    try {
      await this.client
        .withAbortSignal(AbortSignal.timeout(1000))
        .set(
          key,
          JSON.stringify({
            contentType: value.contentType,
            audio: value.audio.toString('base64'),
          }),
          { expiration: { type: 'EX', value: this.ttlSeconds } },
        );
      return true;
    } catch {
      this.logger.warn(
        'Redis audio cache write failed; returning uncached speech.',
      );
      return false;
    }
  }
}
