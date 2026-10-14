import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.guard';
import { DatabaseService } from './database/database.service';
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Public() @Get()
  check() {
    this.database.db.prepare('SELECT 1').get();
    return { status: 'ok' };
  }
}
