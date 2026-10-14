import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.guard';
import { DatabaseService } from './database/database.service';
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Public() @Get()
  async check() {
    await this.database.one('SELECT 1');
    return { status: 'ok' };
  }
}
