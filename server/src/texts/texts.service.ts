import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { CreateTextDto } from './texts.dto';
import type { ReadingText } from '../../../shared/models';
@Injectable()
export class TextsService {
  constructor(private readonly database: DatabaseService) {}
  private get db() {
    return this.database.db;
  }
  list(userId: string) {
    return this.db
      .prepare(
        'SELECT * FROM texts WHERE user_id=? ORDER BY created_at DESC,id',
      )
      .all(userId) as unknown as ReadingText[];
  }
  get(userId: string, id: string): ReadingText {
    const row = this.db
      .prepare('SELECT * FROM texts WHERE id=? AND user_id=?')
      .get(id, userId);
    if (!row) throw new NotFoundException('Text not found.');
    return row as unknown as ReadingText;
  }
  create(userId: string, body: CreateTextDto) {
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO texts (id,user_id,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .run(id, userId, body.title.trim(), body.body.trim(), now, now);
    return this.get(userId, id);
  }
  remove(userId: string, id: string) {
    this.get(userId, id);
    this.db
      .prepare('DELETE FROM texts WHERE id=? AND user_id=?')
      .run(id, userId);
    return { deleted: true };
  }
}
