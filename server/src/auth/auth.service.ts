import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
export interface User {
  id: string;
  email: string;
}
interface UserRow extends User {
  password_hash: string;
  banned_until: string | null;
  deleted_at: string | null;
}
export const sessionCookie = 'recall_session';
const lifetime = 30 * 24 * 60 * 60 * 1000;
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}
  private get db() {
    return this.database.db;
  }
  async signUp(email: string, password: string) {
    email = email.trim().toLowerCase();
    if (this.db.prepare('SELECT id FROM users WHERE email = ?').get(email))
      throw new ConflictException('An account with this email already exists.');
    const passwordHash = await hash(password, 12);
    const id = randomUUID();
    try {
      this.db
        .prepare(
          'INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)',
        )
        .run(id, email, passwordHash, new Date().toISOString());
    } catch (error) {
      if (this.db.prepare('SELECT id FROM users WHERE email = ?').get(email))
        throw new ConflictException(
          'An account with this email already exists.',
        );
      throw error;
    }
    return this.newSession({ id, email });
  }
  async signIn(email: string, password: string) {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.trim().toLowerCase()) as unknown as UserRow | undefined;
    const fallback =
      '$2b$12$C6UzMDM.H6dfI/f/IKcEe.4SOXtIrvn7uY7JjfKtUkCMLjGbFbN5a';
    const matches = await compare(password, row?.password_hash || fallback);
    if (
      !row ||
      !matches ||
      row.deleted_at ||
      (row.banned_until && Date.parse(row.banned_until) > Date.now())
    )
      throw new UnauthorizedException('Email or password is incorrect.');
    return this.newSession({ id: row.id, email: row.email });
  }
  private newSession(user: User) {
    this.db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(Date.now());
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(digest(token), user.id, Date.now() + lifetime);
    return { user, token, maxAge: lifetime };
  }
  session(token?: string): User | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .prepare(
        `SELECT u.id,u.email,u.banned_until,u.deleted_at FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
      )
      .get(digest(token), Date.now()) as unknown as UserRow | undefined;
    if (
      !row ||
      row.deleted_at ||
      (row.banned_until && Date.parse(row.banned_until) > Date.now())
    )
      return null;
    return { id: row.id, email: row.email };
  }
  signOut(token?: string) {
    if (token)
      this.db
        .prepare('DELETE FROM sessions WHERE token_hash=?')
        .run(digest(token));
  }
}
