import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
/**
 * Sends email over SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465).
 * Without it, tests keep messages in `outbox` and development logs them.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null = process.env['SMTP_URL']
    ? createTransport(process.env['SMTP_URL'])
    : null;
  readonly outbox: Mail[] = [];
  get enabled() {
    return !!this.transport || process.env['NODE_ENV'] !== 'production';
  }
  /** Public origin used in links, e.g. https://poshtetgarm.ir. */
  get appUrl() {
    return new URL(
      process.env['APP_PUBLIC_URL'] ||
        (process.env['APP_ORIGINS'] || 'http://localhost:4333').split(',')[0],
    ).origin;
  }
  async send(mail: Mail) {
    if (this.transport) {
      await this.transport.sendMail({
        from: process.env['MAIL_FROM'] || 'Recall <no-reply@localhost>',
        ...mail,
      });
    } else if (process.env['NODE_ENV'] === 'test') {
      this.outbox.push(mail);
    } else if (process.env['NODE_ENV'] === 'production') {
      this.logger.warn('SMTP_URL is not set; email was not sent.');
    } else {
      this.logger.log(`Email to ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }
}
