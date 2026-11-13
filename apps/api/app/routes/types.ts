import type { IncomingMessage } from 'node:http';
import { HttpError } from '../http.js';

export interface Ctx {
  readonly req: IncomingMessage;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly userId: string | null;
  readonly requestId: string;
}

export interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Route {
  readonly method: string;
  readonly path: readonly string[];
  readonly devOnly?: boolean;
  readonly handler: (ctx: Ctx) => Promise<Reply>;
}

export const ok = (body: unknown, status = 200): Reply => ({ status, body });

export const noContent = (): Reply => ({ status: 204, body: null });

export function requireUser(ctx: Ctx): string {
  if (ctx.userId === null) throw new HttpError(401, 'UNAUTHENTICATED', 'Start a session first');
  return ctx.userId;
}
