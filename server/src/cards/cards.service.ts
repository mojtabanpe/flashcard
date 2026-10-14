import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { DecksService } from '../decks/decks.service';
import { CreateCardDto, UpdateCardDto, ReviewDto } from './cards.dto';
import type { Card } from '../../../shared/models';
import { isLeech, schedule } from '../../../shared/srs';
@Injectable()
export class CardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly decks: DecksService,
  ) {}
  private get db() {
    return this.database.db;
  }
  private card(row: Record<string, unknown>): Card {
    return { ...row, suspended: Boolean(row['suspended']) } as unknown as Card;
  }
  get(userId: string, id: string): Card {
    const row = this.db
      .prepare('SELECT * FROM cards WHERE id=? AND user_id=?')
      .get(id, userId);
    if (!row) throw new NotFoundException('Card not found.');
    return this.card(row);
  }
  list(userId: string, deckId: string, due: boolean) {
    this.decks.get(userId, deckId);
    const query = due
      ? 'SELECT * FROM cards WHERE user_id=? AND deck_id=? AND suspended=0 AND julianday(due_at)<=julianday(?) ORDER BY julianday(due_at),id'
      : 'SELECT * FROM cards WHERE user_id=? AND deck_id=? ORDER BY created_at,id';
    const rows = due
      ? this.db.prepare(query).all(userId, deckId, new Date().toISOString())
      : this.db.prepare(query).all(userId, deckId);
    return rows.map((row) => this.card(row));
  }
  create(userId: string, body: CreateCardDto) {
    this.decks.get(userId, body.deck_id);
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO cards (id,deck_id,user_id,front,back,unit,examples,due_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, body.deck_id, userId, body.front, body.back, body.unit?.toLowerCase() ?? '', body.examples ?? '', now, now, now);
    return this.get(userId, id);
  }
  update(userId: string, id: string, body: UpdateCardDto) {
    const card = this.get(userId, id);
    this.db
      .prepare(
        'UPDATE cards SET front=?,back=?,unit=?,examples=?,updated_at=? WHERE id=? AND user_id=?',
      )
      .run(
        body.front ?? card.front,
        body.back ?? card.back,
        body.unit?.toLowerCase() ?? card.unit,
        body.examples ?? card.examples,
        new Date().toISOString(),
        id,
        userId,
      );
    return this.get(userId, id);
  }
  remove(userId: string, id: string) {
    this.get(userId, id);
    this.db
      .prepare('DELETE FROM cards WHERE id=? AND user_id=?')
      .run(id, userId);
    return { deleted: true };
  }
  unsuspend(userId: string, id: string) {
    this.get(userId, id);
    this.db
      .prepare(
        'UPDATE cards SET suspended=0,lapses=0,updated_at=? WHERE id=? AND user_id=?',
      )
      .run(new Date().toISOString(), id, userId);
    return this.get(userId, id);
  }
  review(userId: string, id: string, body: ReviewDto) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const card = this.get(userId, id);
      const next = schedule(card, body.rating);
      const suspended =
        card.suspended || (body.rating === 'again' && isLeech(next));
      const suspensions =
        card.suspensions + (!card.suspended && suspended ? 1 : 0);
      this.db
        .prepare(
          `UPDATE cards SET ease_factor=?,interval_days=?,repetitions=?,lapses=?,due_at=?,
        last_reviewed_at=?,suspended=?,suspensions=?,updated_at=? WHERE id=? AND user_id=?`,
        )
        .run(
          next.ease_factor,
          next.interval_days,
          next.repetitions,
          next.lapses,
          next.due_at,
          next.last_reviewed_at,
          Number(suspended),
          suspensions,
          new Date().toISOString(),
          id,
          userId,
        );
      const result = this.get(userId, id);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
