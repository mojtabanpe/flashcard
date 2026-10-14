import { backup } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { databasePath, openDatabase } from './database/schema';
async function main() {
  const source = databasePath();
  if (!existsSync(source)) throw new Error('Database does not exist.');
  const destination = resolve(
    process.argv[2] ??
      '../backups/recall-' +
        new Date().toISOString().replace(/[:.]/g, '-') +
        '.sqlite',
  );
  if (existsSync(destination))
    throw new Error('Backup destination already exists.');
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const db = openDatabase(source);
  try {
    await backup(db, destination);
    chmodSync(destination, 0o600);
    console.log('SQLite backup saved:', destination);
  } finally {
    db.close();
  }
}
void main();
