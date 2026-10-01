import { Injectable, Logger } from '@nestjs/common';

/**
 * Mailer port. The pilot has no email provider yet, so invite and reset links are logged for an
 * admin to copy (and returned to the admin who created the user). Swap in Resend/SES/SMTP later.
 */
@Injectable()
export class Mailer {
  private readonly log = new Logger('Mailer');
  async send(to: string, subject: string, text: string): Promise<void> {
    this.log.log(`[mail to=${to}] ${subject}\n${text}`);
  }
}

export const pagination = {
  encode: (createdAt: Date, id: string) => Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url'),
  decode: (cursor: string | undefined): { createdAt: Date; id: string } | null => {
    if (!cursor) return null;
    const [ts, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const d = new Date(ts ?? '');
    return Number.isNaN(d.getTime()) || !id ? null : { createdAt: d, id };
  },
};
