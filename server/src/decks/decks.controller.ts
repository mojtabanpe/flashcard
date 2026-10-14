import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.guard';
import { DecksService } from './decks.service';
import { CreateDeckDto, UpdateDeckDto } from './decks.dto';
@Controller('decks')
export class DecksController {
  constructor(private readonly decks: DecksService) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.decks.list(r.user.id);
  }
  @Get(':id') get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.decks.get(r.user.id, id);
  }
  @Post() create(@Req() r: AuthRequest, @Body() body: CreateDeckDto) {
    return this.decks.create(r.user.id, body);
  }
  @Patch(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDeckDto,
  ) {
    return this.decks.update(r.user.id, id, body);
  }
  @Delete(':id') remove(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.decks.remove(r.user.id, id);
  }
}
