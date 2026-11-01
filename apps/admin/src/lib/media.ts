import type { ApiClient } from '@baliqbozor/api-client';

import { unwrap } from './errors';

/** Подписанная ссылка на документ (10 минут, SPEC 10.3). */
export const mediaUrl = async (api: ApiClient, id: string) =>
  (await unwrap(api.GET('/api/v1/media/{id}/url', { params: { path: { id } } }))).url;
