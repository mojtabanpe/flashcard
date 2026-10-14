import { hash } from 'bcryptjs';
import { createPool, migrate } from './database/schema';
import { readPassword } from './read-password';

/** Set a user's password and sign out their existing sessions. */
async function main(email: string) {
  const pool = createPool();
  try {
    await migrate(pool);
    const passwordHash = await hash(await readPassword('New password for ' + email + ': '), 12);
    const user = await pool.query<{ id: string }>(
      'UPDATE users SET password_hash=$1 WHERE lower(email)=lower($2) RETURNING id',
      [passwordHash, email.trim()],
    );
    if (!user.rows[0]) throw new Error('User not found: ' + email);
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [user.rows[0].id]);
    console.log('Password updated for', email);
  } finally {
    await pool.end();
  }
}
const email = process.argv[2];
if (!email) {
  console.error('Usage: set-password <email>');
  process.exit(1);
}
main(email).catch((error: Error) => {
  console.error('Password update failed:', error.message);
  process.exitCode = 1;
});
