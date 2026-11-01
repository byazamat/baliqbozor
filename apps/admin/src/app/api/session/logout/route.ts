import { sessionHandlers } from '@/lib/session-server';

export function POST(request: Request): Promise<Response> {
  return sessionHandlers.logout(request);
}
