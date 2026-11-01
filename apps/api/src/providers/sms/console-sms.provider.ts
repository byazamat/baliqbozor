import { maskPhone } from '@baliqbozor/domain';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env.js';
import type { SmsProvider } from './sms.provider.js';

/**
 * SMS «в консоль» для разработки: номер маскируется; текст (с кодом) — только при APP_ENV=local,
 * иначе лишь факт отправки.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('Sms');

  constructor(@Inject(ENV) private readonly env: Env) {}

  send(phone: string, text: string): Promise<void> {
    const body = this.env.APP_ENV === 'local' ? text : `[${String(text.length)} chars]`;
    this.logger.log(`SMS to ${maskPhone(phone)}: ${body}`);
    return Promise.resolve();
  }
}
