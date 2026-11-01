/** Отправка SMS (SPEC 16): OTP и критичные уведомления. Реализации: console (M1), eskiz (M8). */
export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
