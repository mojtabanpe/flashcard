import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { openDatabase } from './schema';
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db = openDatabase();
  onModuleDestroy() {
    this.db.close();
  }
}
