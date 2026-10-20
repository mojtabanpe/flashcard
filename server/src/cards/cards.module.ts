import { Module } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { DecksModule } from '../decks/decks.module';
@Module({
  exports: [CardsService],
  imports: [DecksModule],
  providers: [CardsService],
  controllers: [CardsController],
})
export class CardsModule {}
