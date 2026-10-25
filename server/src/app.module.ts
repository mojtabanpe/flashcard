import { AiModule } from './ai/ai.module';
import { TextsModule } from './texts/texts.module';
import { PronunciationModule } from './pronunciation/pronunciation.module';
import { HealthController } from './health.controller';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { DecksModule } from './decks/decks.module';
import { CardsModule } from './cards/cards.module';
import { McpModule } from './mcp/mcp.module';
import { MailModule } from './mail/mail.module';
@Module({
  imports: [
    DatabaseModule,
    MailModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    AuthModule,
    DecksModule,
    CardsModule,
    PronunciationModule,
    AiModule,
    TextsModule,
    McpModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
