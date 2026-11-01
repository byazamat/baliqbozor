import { createSessionHandlers } from '@baliqbozor/api-client/session-server';

/** Обработчики сессии web (D-31); cookie `bb_web_rt` не пересекается с админкой на том же хосте. */
export const sessionHandlers = createSessionHandlers({
  apiUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '',
  cookieName: 'bb_web_rt',
  secure: process.env.APP_ENV !== 'local',
  maxAgeDays: Number(process.env.REFRESH_TTL_DAYS ?? 30),
});
