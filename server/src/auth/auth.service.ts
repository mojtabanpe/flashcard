import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
export interface User {
  id: string;
  email: string;
}
interface UserRow extends User {
  password_hash: string;
  banned_until: string | null;
  deleted_at: string | null;
  email_verified_at: string | null;
}
export const sessionCookie = 'recall_session';
const lifetime = 30 * 24 * 60 * 60 * 1000;
const resetLifetime = 60 * 60 * 1000;
const verifyLifetime = 24 * 60 * 60 * 1000;
/** New accounts must confirm their email unless this is switched off (tests). */
const verificationRequired = () =>
  process.env['REQUIRE_EMAIL_VERIFICATION'] !== 'false';
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
  ) {}
  async signUp(email: string, password: string) {
    email = email.trim().toLowerCase();
    const verify = verificationRequired();
    if (verify && !this.mail.enabled)
      throw new ServiceUnavailableException(
        'Sign up needs email, which is not available right now.',
      );
    if (await this.db.one('SELECT id FROM users WHERE lower(email) = $1', [email]))
      throw new ConflictException('An account with this email already exists.');
    const passwordHash = await hash(password, 12);
    const id = randomUUID();
    try {
      await this.db.run(
        'INSERT INTO users (id,email,password_hash,created_at,email_verified_at) VALUES ($1,$2,$3,$4,$5)',
        [
          id,
          email,
          passwordHash,
          new Date().toISOString(),
          verify ? null : new Date().toISOString(),
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'An account with this email already exists.',
        );
      throw error;
    }
    if (!verify) return this.newSession({ id, email });
    this.sendVerificationLink(email).catch((error: Error) =>
      this.logger.error('Verification email failed: ' + error.message),
    );
    return null;
  }
  /** Email a fresh confirmation link; silent for unknown or confirmed accounts. */
  requestVerification(email: string) {
    if (!this.mail.enabled)
      throw new ServiceUnavailableException('Email is not available right now.');
    this.sendVerificationLink(email).catch((error: Error) =>
      this.logger.error('Verification email failed: ' + error.message),
    );
  }
  private async sendVerificationLink(email: string) {
    const row = await this.db.one<UserRow>(
      'SELECT id,email,email_verified_at,banned_until,deleted_at FROM users WHERE lower(email)=$1',
      [email.trim().toLowerCase()],
    );
    if (!row || row.email_verified_at || row.deleted_at) return;
    const token = randomBytes(32).toString('base64url');
    await this.db.run('DELETE FROM email_verifications WHERE expires_at <= $1 OR user_id=$2', [
      Date.now(),
      row.id,
    ]);
    await this.db.run('INSERT INTO email_verifications VALUES ($1,$2,$3)', [
      digest(token),
      row.id,
      Date.now() + verifyLifetime,
    ]);
    const link = new URL('/verify-email', this.mail.appUrl);
    link.searchParams.set('token', token);
    await this.mail.send({
      to: row.email,
      subject: 'Confirm your Recall email',
      text: [
        'Welcome to Recall. Confirm your email to finish creating your account',
        '(the link works once, for 24 hours):',
        link.href,
        '',
        'If you didn’t sign up, ignore this email.',
      ].join('\n'),
    });
  }
  /** Use a confirmation token once. */
  async verifyEmail(token: string) {
    const row = await this.db.one<{ id: string }>(
      `WITH used AS (DELETE FROM email_verifications WHERE token_hash=$1 AND expires_at>$2 RETURNING user_id)
      UPDATE users SET email_verified_at=COALESCE(email_verified_at, now())
      WHERE id IN (SELECT user_id FROM used) RETURNING id`,
      [digest(token), Date.now()],
    );
    if (!row)
      throw new BadRequestException(
        'This confirmation link is invalid or has expired.',
      );
  }
  async signIn(email: string, password: string) {
    const row = await this.db.one<UserRow>(
      'SELECT * FROM users WHERE lower(email) = $1',
      [email.trim().toLowerCase()],
    );
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
    if (!row.email_verified_at)
      throw new ForbiddenException(
        'Confirm your email first. Check your inbox for the link.',
      );
    return this.newSession({ id: row.id, email: row.email });
  }
  private async newSession(user: User) {
    await this.db.run('DELETE FROM sessions WHERE expires_at <= $1', [
      Date.now(),
    ]);
    const token = randomBytes(32).toString('base64url');
    await this.db.run('INSERT INTO sessions VALUES ($1,$2,$3)', [
      digest(token),
      user.id,
      Date.now() + lifetime,
    ]);
    return { user, token, maxAge: lifetime };
  }
  async session(token?: string): Promise<User | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = await this.db.one<UserRow>(
      `SELECT u.id,u.email,u.banned_until,u.deleted_at FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`,
      [digest(token), Date.now()],
    );
    if (
      !row ||
      row.deleted_at ||
      (row.banned_until && Date.parse(row.banned_until) > Date.now())
    )
      return null;
    return { id: row.id, email: row.email };
  }
  /** Change the password and sign out every other session of this user. */
  async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string,
    token?: string,
  ) {
    const row = await this.db.one<UserRow>(
      'SELECT password_hash FROM users WHERE id=$1',
      [user.id],
    );
    if (!row || !(await compare(currentPassword, row.password_hash)))
      throw new BadRequestException('Current password is incorrect.');
    const passwordHash = await hash(newPassword, 12);
    await this.db.transaction(async (client) => {
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
        passwordHash,
        user.id,
      ]);
      await client.query(
        'DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',
        [user.id, token ? digest(token) : ''],
      );
      await client.query('DELETE FROM password_resets WHERE user_id=$1', [
        user.id,
      ]);
    });
    this.notify(user.email, 'Your Recall password was changed');
  }
  /**
   * Email a single-use reset link. Runs in the background and answers the
   * same way for unknown accounts, so the response does not reveal them.
   */
  requestPasswordReset(email: string) {
    if (!this.mail.enabled)
      throw new ServiceUnavailableException(
        'Password reset by email is not available.',
      );
    this.sendResetLink(email).catch((error: Error) =>
      this.logger.error('Password reset email failed: ' + error.message),
    );
  }
  private async sendResetLink(email: string) {
    const row = await this.db.one<UserRow>(
      'SELECT id,email,banned_until,deleted_at FROM users WHERE lower(email)=$1',
      [email.trim().toLowerCase()],
    );
    if (
      !row ||
      row.deleted_at ||
      (row.banned_until && Date.parse(row.banned_until) > Date.now())
    )
      return;
    const token = randomBytes(32).toString('base64url');
    await this.db.run('DELETE FROM password_resets WHERE expires_at <= $1', [
      Date.now(),
    ]);
    await this.db.run('INSERT INTO password_resets VALUES ($1,$2,$3)', [
      digest(token),
      row.id,
      Date.now() + resetLifetime,
    ]);
    const link = new URL('/reset-password', this.mail.appUrl);
    link.searchParams.set('token', token);
    await this.mail.send({
      to: row.email,
      subject: 'Reset your Recall password',
      text: [
        'Someone asked to reset the password for your Recall account.',
        '',
        'Choose a new password here (the link works once, for one hour):',
        link.href,
        '',
        'If this wasn’t you, ignore this email; your password stays the same.',
      ].join('\n'),
    });
  }
  /** Use a reset token once: set the password and sign out every session. */
  async resetPassword(token: string, password: string) {
    const passwordHash = await hash(password, 12);
    const user = await this.db.transaction(async (client) => {
      const reset = await client.query<UserRow>(
        `DELETE FROM password_resets r USING users u
        WHERE r.token_hash=$1 AND r.expires_at>$2 AND u.id=r.user_id
        RETURNING u.id,u.email,u.banned_until,u.deleted_at`,
        [digest(token), Date.now()],
      );
      const row = reset.rows[0];
      if (
        !row ||
        row.deleted_at ||
        (row.banned_until && Date.parse(row.banned_until) > Date.now())
      )
        return null;
      await client.query(
        'UPDATE users SET password_hash=$1, email_verified_at=COALESCE(email_verified_at, now()) WHERE id=$2',
        [passwordHash, row.id],
      );
      await client.query('DELETE FROM sessions WHERE user_id=$1', [row.id]);
      await client.query('DELETE FROM password_resets WHERE user_id=$1', [
        row.id,
      ]);
      return row;
    });
    if (!user)
      throw new BadRequestException(
        'This reset link is invalid or has expired.',
      );
    this.notify(user.email, 'Your Recall password was reset');
  }
  /** Security notice; a mail failure must not undo the password change. */
  private notify(email: string, subject: string) {
    this.mail
      .send({
        to: email,
        subject,
        text: [
          subject + ' and other devices were signed out.',
          '',
          'If this wasn’t you, reset your password now: ' +
            new URL('/login', this.mail.appUrl).href,
        ].join('\n'),
      })
      .catch((error: Error) =>
        this.logger.error('Password notice failed: ' + error.message),
      );
  }
  async signOut(token?: string) {
    if (token)
      await this.db.run('DELETE FROM sessions WHERE token_hash=$1', [
        digest(token),
      ]);
  }
}
