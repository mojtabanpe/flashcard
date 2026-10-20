import { Module } from '@nestjs/common';
import { TextsService } from './texts.service';
import { TextsController } from './texts.controller';
@Module({
  exports: [TextsService],
  providers: [TextsService],
  controllers: [TextsController],
})
export class TextsModule {}
