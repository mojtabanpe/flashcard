import { readFileSync } from 'node:fs';
import { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { openDatabase, databasePath } from './database/schema';
import { isDeepStrictEqual } from 'node:util';

interface SourceUser {
  id: string;
  email: string;
  encrypted_password: string;
  created_at: string;
  banned_until?: string;
  deleted_at?: string;
}
type Row = Record<string, SQLInputValue | boolean>;
interface ExportFile {
  format: number;
  project: string;
  exportedAt: string;
  tables: Record<string, Row[]>;
}
function same(actual: unknown, expected: unknown, label: string) {
  if (!isDeepStrictEqual(actual, expected))
    throw new Error('Verification failed: ' + label);
}
export function verifyImport(db: DatabaseSync, source: ExportFile) {
  for (const table of ['decks', 'cards']) {
    const originals = source.tables['public.' + table];
    const actual = db
      .prepare('SELECT * FROM ' + table + ' ORDER BY id')
      .all()
      .map((row) => {
        const result = { ...row };
        if (table === 'cards')
          result['suspended'] = Boolean(row['suspended']) as unknown as number;
        return result;
      });
    same(
      actual,
      originals.map((row) => table === 'cards' ? { unit: '', examples: '', ...row } : row).sort((a, b) =>
        String(a['id']).localeCompare(String(b['id'])),
      ),
      table + ' fields',
    );
  }
  const expectedUsers = (source.tables['auth.users'] as unknown as SourceUser[])
    .map((u) => ({
      id: u.id,
      email: u.email,
      password_hash: u.encrypted_password,
      created_at: u.created_at,
      banned_until: u.banned_until ?? null,
      deleted_at: u.deleted_at ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  same(
    db
      .prepare('SELECT * FROM users ORDER BY id')
      .all()
      .map((u) => ({ ...u })),
    expectedUsers,
    'users and password hashes',
  );
  for (const [table, rows] of Object.entries(source.tables)) {
    const archived = db
      .prepare(
        'SELECT payload FROM migration_archive WHERE table_name=? ORDER BY row_index',
      )
      .all(table)
      .map((row) => JSON.parse(String(row['payload'])) as unknown);
    same(archived, rows, 'archive ' + table);
  }
  same(db.prepare('PRAGMA foreign_key_check').all(), [], 'foreign keys');
  if (db.prepare('PRAGMA integrity_check').get()?.['integrity_check'] !== 'ok')
    throw new Error('SQLite integrity check failed');
  return {
    users: expectedUsers.length,
    decks: source.tables['public.decks'].length,
    cards: source.tables['public.cards'].length,
    archivedTables: Object.keys(source.tables).length,
  };
}
export function importSnapshot(db: DatabaseSync, source: ExportFile) {
  if (
    source.format !== 1 ||
    !source.tables['auth.users'] ||
    !source.tables['public.decks'] ||
    !source.tables['public.cards']
  )
    throw new Error('Unsupported or incomplete export.');
  if ((source.tables['storage.objects']?.length ?? 0) > 0)
    throw new Error(
      'Storage files must be downloaded and migrated before cutover.',
    );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of [
      'users',
      'decks',
      'cards',
      'sessions',
      'migration_archive',
      'migration_manifest',
    ])
      if (
        Number(
          db.prepare('SELECT COUNT(*) AS n FROM ' + table).get()?.['n'],
        ) !== 0
      )
        throw new Error(
          'Import requires an empty database; existing data will not be overwritten.',
        );
    for (const u of source.tables['auth.users'] as unknown as SourceUser[]) {
      if (!u.email || !/^\$2[aby]\$/.test(u.encrypted_password))
        throw new Error('Unsupported user authentication method.');
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
        u.id,
        u.email,
        u.encrypted_password,
        u.created_at,
        u.banned_until ?? null,
        u.deleted_at ?? null,
      );
    }
    for (const table of ['decks', 'cards']) {
      const columns = db
        .prepare('PRAGMA table_info(' + table + ')')
        .all()
        .map((row) => String(row['name']));
      const insert = db.prepare(
        'INSERT INTO ' +
          table +
          ' (' +
          columns.join(',') +
          ') VALUES (' +
          columns.map(() => '?').join(',') +
          ')',
      );
      for (const row of source.tables['public.' + table]) {
        if (Object.keys(row).some((key) => !columns.includes(key)))
          throw new Error('Unmapped source column in ' + table);
        insert.run(
          ...columns.map((column) => {
            const value = row[column];
            if (table === 'cards' && (column === 'unit' || column === 'examples') && value === undefined)
              return '';
            if (value === undefined)
              throw new Error('Missing source column ' + column);
            return typeof value === 'boolean' ? Number(value) : value;
          }),
        );
      }
    }
    const archive = db.prepare('INSERT INTO migration_archive VALUES (?,?,?)');
    for (const [table, rows] of Object.entries(source.tables))
      rows.forEach((row, index) =>
        archive.run(table, index, JSON.stringify(row)),
      );
    const report = verifyImport(db, source);
    db.prepare('INSERT INTO migration_manifest VALUES (1,?)').run(
      JSON.stringify({
        project: source.project,
        exportedAt: source.exportedAt,
        importedAt: new Date().toISOString(),
        ...report,
      }),
    );
    db.exec('COMMIT');
    return report;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
if (require.main === module) {
  const source = JSON.parse(
    readFileSync(process.argv[2] ?? '../backups/supabase-export.json', 'utf8'),
  ) as ExportFile;
  const db = openDatabase(databasePath());
  try {
    console.log('Import verified:', importSnapshot(db, source));
  } finally {
    db.close();
  }
}
