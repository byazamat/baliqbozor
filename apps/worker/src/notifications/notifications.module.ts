import { Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module.js';
import { NotificationHandlers } from './notification.handlers.js';
import { ConsoleSmsSender, SMS_SENDER } from './sms.js';

@Module({
  imports: [OutboxModule],
  providers: [NotificationHandlers, { provide: SMS_SENDER, useClass: ConsoleSmsSender }],
})
export class NotificationsModule {}
