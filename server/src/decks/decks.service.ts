import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { CreateDeckDto, UpdateDeckDto } from './decks.dto';
import type { Deck, DeckWithStats } from '../../../shared/models';
@Injectable()
export class DecksService {
  constructor(private readonly db: DatabaseService) {}
  list(userId: string) {
    return this.db.many<DeckWithStats>(
      `SELECT d.*, COUNT(c.id)::int AS total,
      COUNT(c.id) FILTER (WHERE NOT c.suspended AND c.due_at <= now())::int AS due,
      COUNT(c.id) FILTER (WHERE c.suspended)::int AS suspended FROM decks d
      LEFT JOIN cards c ON c.deck_id=d.id AND c.user_id=d.user_id
      WHERE d.user_id=$1 GROUP BY d.id ORDER BY d.created_at,d.id`,
      [userId],
    );
  }
  async get(userId: string, id: string): Promise<Deck> {
    const row = await this.db.one<Deck>(
      'SELECT * FROM decks WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Deck not found.');
    return row;
  }
  async create(userId: string, body: CreateDeckDto) {
    const id = randomUUID(),
      now = new Date().toISOString();
    await this.db.run(
      'INSERT INTO decks (id,user_id,name,description,color,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, userId, body.name, body.description ?? '', body.color, now, now],
    );
    return this.get(userId, id);
  }
  async update(userId: string, id: string, patch: UpdateDeckDto) {
    const current = await this.get(userId, id);
    await this.db.run(
      'UPDATE decks SET name=$1,description=$2,color=$3,updated_at=$4 WHERE id=$5 AND user_id=$6',
      [
        patch.name ?? current.name,
        patch.description ?? current.description,
        patch.color ?? current.color,
        new Date().toISOString(),
        id,
        userId,
      ],
    );
    return this.get(userId, id);
  }
  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.run('DELETE FROM decks WHERE id=$1 AND user_id=$2', [
      id,
      userId,
    ]);
    return { deleted: true };
  }
}
