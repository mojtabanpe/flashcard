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
    private readonly db: DatabaseService,
    private readonly decks: DecksService,
  ) {}
  async get(userId: string, id: string): Promise<Card> {
    const row = await this.db.one<Card>(
      'SELECT * FROM cards WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Card not found.');
    return row;
  }
  async list(userId: string, deckId: string, due: boolean) {
    await this.decks.get(userId, deckId);
    return this.db.many<Card>(
      due
        ? 'SELECT * FROM cards WHERE user_id=$1 AND deck_id=$2 AND NOT suspended AND due_at<=now() ORDER BY due_at,id'
        : 'SELECT * FROM cards WHERE user_id=$1 AND deck_id=$2 ORDER BY created_at,id',
      [userId, deckId],
    );
  }
  async create(userId: string, body: CreateCardDto) {
    await this.decks.get(userId, body.deck_id);
    const id = randomUUID(),
      now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO cards (id,deck_id,user_id,front,back,unit,examples,due_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        body.deck_id,
        userId,
        body.front,
        body.back,
        body.unit?.toLowerCase() ?? '',
        body.examples ?? '',
        now,
        now,
        now,
      ],
    );
    return this.get(userId, id);
  }
  async update(userId: string, id: string, body: UpdateCardDto) {
    const card = await this.get(userId, id);
    await this.db.run(
      'UPDATE cards SET front=$1,back=$2,unit=$3,examples=$4,updated_at=$5 WHERE id=$6 AND user_id=$7',
      [
        body.front ?? card.front,
        body.back ?? card.back,
        body.unit?.toLowerCase() ?? card.unit,
        body.examples ?? card.examples,
        new Date().toISOString(),
        id,
        userId,
      ],
    );
    return this.get(userId, id);
  }
  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.run('DELETE FROM cards WHERE id=$1 AND user_id=$2', [
      id,
      userId,
    ]);
    return { deleted: true };
  }
  async search(
    userId: string,
    query: string,
    deckId?: string,
    limit = 50,
    offset = 0,
  ) {
    if (deckId) await this.decks.get(userId, deckId);
    return this.db.many<Card>(
      `SELECT * FROM cards WHERE user_id=$1
       AND ($2::text IS NULL OR deck_id=$2)
       AND position(lower($3) in lower(front || ' ' || back || ' ' || examples || ' ' || unit)) > 0
       ORDER BY created_at,id LIMIT $4 OFFSET $5`,
      [userId, deckId ?? null, query, limit, offset],
    );
  }
  async move(userId: string, id: string, deckId: string) {
    await this.get(userId, id);
    await this.decks.get(userId, deckId);
    await this.db.run(
      'UPDATE cards SET deck_id=$1,updated_at=$2 WHERE id=$3 AND user_id=$4',
      [deckId, new Date().toISOString(), id, userId],
    );
    return this.get(userId, id);
  }
  async suspend(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.run(
      'UPDATE cards SET suspended=TRUE,updated_at=$1 WHERE id=$2 AND user_id=$3',
      [new Date().toISOString(), id, userId],
    );
    return this.get(userId, id);
  }
  async unsuspend(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.run(
      'UPDATE cards SET suspended=FALSE,lapses=0,updated_at=$1 WHERE id=$2 AND user_id=$3',
      [new Date().toISOString(), id, userId],
    );
    return this.get(userId, id);
  }
  review(userId: string, id: string, body: ReviewDto) {
    return this.db.transaction(async (client) => {
      // Lock the row so concurrent reviews of one card apply in order.
      const card = (
        await client.query<Card>(
          'SELECT * FROM cards WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, userId],
        )
      ).rows[0];
      if (!card) throw new NotFoundException('Card not found.');
      const next = schedule(card, body.rating);
      const suspended =
        card.suspended || (body.rating === 'again' && isLeech(next));
      const suspensions =
        card.suspensions + (!card.suspended && suspended ? 1 : 0);
      return (
        await client.query<Card>(
          `UPDATE cards SET ease_factor=$1,interval_days=$2,repetitions=$3,lapses=$4,due_at=$5,
        last_reviewed_at=$6,suspended=$7,suspensions=$8,updated_at=$9 WHERE id=$10 AND user_id=$11 RETURNING *`,
          [
            next.ease_factor,
            next.interval_days,
            next.repetitions,
            next.lapses,
            next.due_at,
            next.last_reviewed_at,
            suspended,
            suspensions,
            new Date().toISOString(),
            id,
            userId,
          ],
        )
      ).rows[0];
    });
  }
}
