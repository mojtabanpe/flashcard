import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth.guard';
import { McpAuthService, mcpScopes } from './mcp-auth.service';
import { setupPage } from './mcp-pages';
class CreateMcpTokenDto {
  @IsString() @Matches(/\S/) @MaxLength(80) name!: string;
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(mcpScopes, { each: true })
  scopes?: string[];
}
@Controller('mcp')
export class McpController {
  constructor(private readonly auth: McpAuthService) {}
  @Get('setup') setup(@Res() res: Response) {
    setupPage(res, this.auth.resource.href);
  }
  @Get('tokens') list(@Req() req: AuthRequest) {
    return this.auth.listKeys(req.user.id);
  }
  @Post('tokens') create(
    @Req() req: AuthRequest,
    @Body() body: CreateMcpTokenDto,
  ) {
    return this.auth.createKey(req.user.id, body.name.trim(), body.scopes);
  }
  @Delete('tokens/:id') revoke(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revokeKey(req.user.id, id);
  }
}
