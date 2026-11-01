import type { ApiClient, components } from '@baliqbozor/api-client';

import { unwrap } from './errors';

export type Org = components['schemas']['OrgDto'];
export type MemberRole = components['schemas']['MemberRole'];

export const orgQueryKey = (orgId: string) => ['org', orgId] as const;
export const documentsQueryKey = (orgId: string) => ['org', orgId, 'documents'] as const;
export const membersQueryKey = (orgId: string) => ['org', orgId, 'members'] as const;

/**
 * Открыть документ по подписанной ссылке (10 мин). Окно открывается сразу по клику,
 * иначе браузер заблокирует его как всплывающее после `await`.
 */
export async function openMedia(api: ApiClient, mediaId: string): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  try {
    const { url } = await unwrap(
      api.GET('/api/v1/media/{id}/url', { params: { path: { id: mediaId } } }),
    );
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
