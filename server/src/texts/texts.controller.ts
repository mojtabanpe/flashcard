import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.guard';
import { TextsService } from './texts.service';
import { CreateTextDto } from './texts.dto';
@Controller('texts')
export class TextsController {
  constructor(private readonly texts: TextsService) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.texts.list(r.user.id);
  }
  @Get(':id') get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.texts.get(r.user.id, id);
  }
  @Post() create(@Req() r: AuthRequest, @Body() body: CreateTextDto) {
    return this.texts.create(r.user.id, body);
  }
  @Delete(':id') remove(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.texts.remove(r.user.id, id);
  }
}
