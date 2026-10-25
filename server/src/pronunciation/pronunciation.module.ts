import { Body, Controller, Module, Post, Req, Res } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { SpeechService } from './speech/speech.service';
import { AudioCacheService } from './audio-cache/audio-cache.service';
class PronunciationDto {
  @IsOptional() @IsIn(['primary', 'secondary']) voice?: 'primary' | 'secondary';
  @IsString() @Matches(/\S/) @MaxLength(2000) text!: string;
}
@Controller('pronunciation')
class PronunciationController {
  constructor(private readonly speech: SpeechService) {}
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async speak(
    @Req() request: AuthRequest,
    @Body() body: PronunciationDto,
    @Res() response: Response,
  ) {
    const result = await this.speech.speak(request.user.id, body.text, body.voice);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-TTS-Cache', result.cacheStatus);
    response.send(result.audio);
  }
}
@Module({
  controllers: [PronunciationController],
  providers: [SpeechService, AudioCacheService],
})
export class PronunciationModule {}
