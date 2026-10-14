import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { createPool, migrate, transaction } from './database/schema';
import { readPassword } from './read-password';

/**
 * Create `targetEmail` with a copy of every deck, card (including review
 * history) and reading text owned by `sourceEmail`. Copies get new ids, so the
 * two accounts stay independent afterwards.
 */
export async function cloneUser(
  pool: Pool,
  sourceEmail: string,
  targetEmail: string,
  password: { hash: string } | 'same',
) {
  await migrate(pool);
  return transaction(pool, async (client) => {
    const source = (
      await client.query<{ id: string; password_hash: string }>(
        'SELECT id, password_hash FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL',
        [sourceEmail.trim()],
      )
    ).rows[0];
    if (!source) throw new Error('Source user not found: ' + sourceEmail);
    const email = targetEmail.trim().toLowerCase();
    if ((await client.query('SELECT 1 FROM users WHERE lower(email)=$1', [email])).rowCount)
      throw new Error('A user with this email already exists: ' + email);
    const id = randomUUID();
    await client.query('INSERT INTO users (id,email,password_hash,created_at) VALUES ($1,$2,$3,now())', [
      id,
      email,
      password === 'same' ? source.password_hash : password.hash,
    ]);
    const decks = (
      await client.query<{ id: string }>('SELECT id FROM decks WHERE user_id=$1 ORDER BY created_at,id', [source.id])
    ).rows;
    for (const deck of decks) {
      const copy = randomUUID();
      await client.query(
        `INSERT INTO decks (id,user_id,name,description,color,created_at,updated_at)
         SELECT $1,$2,name,description,color,created_at,updated_at FROM decks WHERE id=$3`,
        [copy, id, deck.id],
      );
      await client.query(
        `INSERT INTO cards (id,deck_id,user_id,front,back,unit,examples,ease_factor,interval_days,repetitions,
           lapses,suspended,suspensions,due_at,last_reviewed_at,created_at,updated_at)
         SELECT gen_random_uuid()::text,$1,$2,front,back,unit,examples,ease_factor,interval_days,repetitions,
           lapses,suspended,suspensions,due_at,last_reviewed_at,created_at,updated_at
         FROM cards WHERE deck_id=$3 AND user_id=$4`,
        [copy, id, deck.id, source.id],
      );
    }
    await client.query(
      `INSERT INTO texts (id,user_id,title,body,created_at,updated_at)
       SELECT gen_random_uuid()::text,$1,title,body,created_at,updated_at FROM texts WHERE user_id=$2`,
      [id, source.id],
    );
    const count = async (table: string, user: string) =>
      Number((await client.query(`SELECT count(*) AS n FROM ${table} WHERE user_id=$1`, [user])).rows[0]['n']);
    const summary = { decks: 0, cards: 0, texts: 0 };
    for (const table of ['decks', 'cards', 'texts'] as const) {
      summary[table] = await count(table, id);
      if (summary[table] !== (await count(table, source.id)))
        throw new Error(`Copy of ${table} is incomplete.`);
    }
    return { email, ...summary };
  });
}

if (require.main === module) {
  const [source, target] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const same = process.argv.includes('--same-password');
  if (!source || !target) {
    console.error('Usage: clone-user <source-email> <new-email> [--same-password]');
    process.exit(1);
  }
  const pool = createPool();
  (async () => {
    const password = same ? ('same' as const) : { hash: await hash(await readPassword('Password for ' + target + ': '), 12) };
    console.log('User copied:', JSON.stringify(await cloneUser(pool, source, target, password)));
  })()
    .catch((error: Error) => {
      console.error('Copy failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => void pool.end());
}
