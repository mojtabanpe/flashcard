import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { DecksModule } from '../decks/decks.module';
import { TextsModule } from '../texts/texts.module';
import { McpService } from './mcp.service';
import { McpAuthService } from './mcp-auth.service';
import { McpController } from './mcp.controller';
@Module({
  imports: [CardsModule, DecksModule, TextsModule],
  providers: [McpService, McpAuthService],
  controllers: [McpController],
})
export class McpModule {}
