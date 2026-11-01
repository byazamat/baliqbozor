import { maskPhone } from '@baliqbozor/domain';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../config/env.js';

/** SMS из worker (SPEC 11.1): критичные события и приглашения. M1 — консоль, Eskiz — M8 (D-33). */
export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('Sms');

  constructor(@Inject(ENV) private readonly env: Env) {}

  send(phone: string, text: string): Promise<void> {
    const body = this.env.APP_ENV === 'local' ? text : `[${String(text.length)} chars]`;
    this.logger.log(`SMS to ${maskPhone(phone)}: ${body}`);
    return Promise.resolve();
  }
}
