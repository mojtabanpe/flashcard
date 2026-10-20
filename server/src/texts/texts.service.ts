import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { CreateTextDto } from './texts.dto';
import type { ReadingText } from '../../../shared/models';
@Injectable()
export class TextsService {
  constructor(private readonly db: DatabaseService) {}
  list(userId: string) {
    return this.db.many<ReadingText>(
      'SELECT * FROM texts WHERE user_id=$1 ORDER BY created_at DESC,id',
      [userId],
    );
  }
  async get(userId: string, id: string): Promise<ReadingText> {
    const row = await this.db.one<ReadingText>(
      'SELECT * FROM texts WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Text not found.');
    return row;
  }
  async create(userId: string, body: CreateTextDto) {
    const id = randomUUID(),
      now = new Date().toISOString();
    await this.db.run(
      'INSERT INTO texts (id,user_id,title,body,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, userId, body.title.trim(), body.body.trim(), now, now],
    );
    return this.get(userId, id);
  }
  async update(userId: string, id: string, patch: Partial<CreateTextDto>) {
    const current = await this.get(userId, id);
    await this.db.run(
      'UPDATE texts SET title=$1,body=$2,updated_at=$3 WHERE id=$4 AND user_id=$5',
      [
        patch.title?.trim() ?? current.title,
        patch.body?.trim() ?? current.body,
        new Date().toISOString(),
        id,
        userId,
      ],
    );
    return this.get(userId, id);
  }
  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.run('DELETE FROM texts WHERE id=$1 AND user_id=$2', [
      id,
      userId,
    ]);
    return { deleted: true };
  }
}
