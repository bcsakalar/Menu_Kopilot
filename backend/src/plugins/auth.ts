import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../lib/errors.js';
import type { AccessTokenClaims, AuthUser } from '../modules/auth/schemas.js';
import { type AuthService, VISITOR_SESSION_SECONDS } from '../modules/auth/service.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** A session of any kind: the visitor cookie, or a bearer token. */
    authenticate: (request: FastifyRequest) => Promise<void>;
    /** Loads the session when there is one and carries on when there is none. */
    optionalSession: (request: FastifyRequest) => Promise<void>;
    /** Like `authenticate`, and a browser without a session becomes a new visitor. */
    ensureVisitor: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** The admin cookie (or a bearer token) of an admin. */
    authenticateAdmin: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export const VISITOR_COOKIE = 'mk_visitor';
export const ADMIN_COOKIE = 'mk_admin';

export function sessionCookie(name: string, token: string, maxAgeSeconds: number, secure: boolean, sameSite: 'Lax' | 'Strict'): string {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export const clearCookie = (name: string): string => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, value] = part.trim().split('=', 2);
    if (key === name && value) return value;
  }
  return undefined;
}

/** Session cookies carry the JWT; a bearer token works too (API clients, tests). Ownership checks live in services. */
export const authPlugin = fp<{ service: AuthService; secureCookies: boolean }>(
  async (app: FastifyInstance, { service, secureCookies }) => {
    app.decorateRequest('authUser', undefined);

    const load = async (request: FastifyRequest, cookie: string): Promise<boolean> => {
      const bearer = /^Bearer (.+)$/iu.exec(request.headers.authorization ?? '')?.[1];
      const token = bearer ?? readCookie(request.headers.cookie, cookie);
      if (!token) return false;
      let claims: AccessTokenClaims;
      try {
        claims = app.jwt.verify<AccessTokenClaims>(token);
      } catch {
        return false;
      }
      const user = await service.validateAccess(claims);
      if (!user) return false;
      request.authUser = user;
      return true;
    };

    app.decorate('authenticate', async (request: FastifyRequest) => {
      if (!(await load(request, VISITOR_COOKIE))) throw new AppError('UNAUTHORIZED', 'Oturum geçersiz veya süresi dolmuş');
    });

    app.decorate('optionalSession', async (request: FastifyRequest) => {
      await load(request, VISITOR_COOKIE);
    });

    app.decorate('ensureVisitor', async (request: FastifyRequest, reply: FastifyReply) => {
      if (await load(request, VISITOR_COOKIE)) return;
      const { token, user } = await service.createVisitor();
      // On the raw response: a chat answer is a hijacked SSE stream, which never sends Fastify's reply headers.
      reply.raw.setHeader('set-cookie', sessionCookie(VISITOR_COOKIE, token, VISITOR_SESSION_SECONDS, secureCookies, 'Lax'));
      request.authUser = user;
    });

    app.decorate('authenticateAdmin', async (request: FastifyRequest) => {
      if (!(await load(request, ADMIN_COOKIE))) throw new AppError('UNAUTHORIZED', 'Oturum geçersiz veya süresi dolmuş');
      requireAdmin(request);
    });
  },
  { name: 'auth' },
);

export function getAuthUser(request: FastifyRequest): AuthUser {
  if (!request.authUser) throw new AppError('UNAUTHORIZED', 'Oturum gerekli');
  return request.authUser;
}

export function requireAdmin(request: FastifyRequest): AuthUser {
  const user = getAuthUser(request);
  if (user.role !== 'admin') throw new AppError('FORBIDDEN', 'Bu işlem için yönetici yetkisi gerekli');
  return user;
}
