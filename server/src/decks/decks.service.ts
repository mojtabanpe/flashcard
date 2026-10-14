import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { CreateDeckDto, UpdateDeckDto } from './decks.dto';
import type { Deck, DeckWithStats } from '../../../shared/models';
@Injectable()
export class DecksService {
  constructor(private readonly database: DatabaseService) {}
  private get db() {
    return this.database.db;
  }
  list(userId: string): DeckWithStats[] {
    return this.db
      .prepare(
        `SELECT d.*, COUNT(c.id) AS total,
      COALESCE(SUM(CASE WHEN c.suspended=0 AND julianday(c.due_at)<=julianday(?) THEN 1 ELSE 0 END),0) AS due,
      COALESCE(SUM(c.suspended),0) AS suspended FROM decks d
      LEFT JOIN cards c ON c.deck_id=d.id AND c.user_id=d.user_id
      WHERE d.user_id=? GROUP BY d.id ORDER BY d.created_at,d.id`,
      )
      .all(new Date().toISOString(), userId) as unknown as DeckWithStats[];
  }
  get(userId: string, id: string): Deck {
    const row = this.db
      .prepare('SELECT * FROM decks WHERE id=? AND user_id=?')
      .get(id, userId);
    if (!row) throw new NotFoundException('Deck not found.');
    return row as unknown as Deck;
  }
  create(userId: string, body: CreateDeckDto) {
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO decks VALUES (?,?,?,?,?,?,?)')
      .run(id, userId, body.name, body.description ?? '', body.color, now, now);
    return this.get(userId, id);
  }
  update(userId: string, id: string, patch: UpdateDeckDto) {
    const current = this.get(userId, id);
    this.db
      .prepare(
        'UPDATE decks SET name=?,description=?,color=?,updated_at=? WHERE id=? AND user_id=?',
      )
      .run(
        patch.name ?? current.name,
        patch.description ?? current.description,
        patch.color ?? current.color,
        new Date().toISOString(),
        id,
        userId,
      );
    return this.get(userId, id);
  }
  remove(userId: string, id: string) {
    this.get(userId, id);
    this.db
      .prepare('DELETE FROM decks WHERE id=? AND user_id=?')
      .run(id, userId);
    return { deleted: true };
  }
}
