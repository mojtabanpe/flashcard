import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.guard';
import { CardsService } from './cards.service';
import { CreateCardDto, UpdateCardDto, ReviewDto } from './cards.dto';
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}
  @Get() list(
    @Req() r: AuthRequest,
    @Query('deck_id', ParseUUIDPipe) deckId: string,
    @Query('due') due?: string,
  ) {
    return this.cards.list(r.user.id, deckId, due === 'true');
  }
  @Post() create(@Req() r: AuthRequest, @Body() body: CreateCardDto) {
    return this.cards.create(r.user.id, body);
  }
  @Patch(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCardDto,
  ) {
    return this.cards.update(r.user.id, id, body);
  }
  @Delete(':id') remove(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cards.remove(r.user.id, id);
  }
  @Post(':id/unsuspend') unsuspend(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cards.unsuspend(r.user.id, id);
  }
  @Post(':id/review') review(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewDto,
  ) {
    return this.cards.review(r.user.id, id, body);
  }
}
