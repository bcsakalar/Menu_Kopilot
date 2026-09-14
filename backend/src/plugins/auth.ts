import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../lib/errors.js';
import type { AccessTokenClaims, AuthUser } from '../modules/auth/schemas.js';
import type { AuthService } from '../modules/auth/service.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

/** Verifies the bearer JWT and loads the user ("who are you"). Ownership checks live in services. */
export const authPlugin = fp<{ service: AuthService }>(
  async (app: FastifyInstance, { service }) => {
    app.decorateRequest('authUser', undefined);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      try {
        await request.jwtVerify();
      } catch {
        throw new AppError('UNAUTHORIZED', 'Oturum geçersiz veya süresi dolmuş');
      }
      const user = await service.validateAccess(request.user);
      if (!user) throw new AppError('UNAUTHORIZED', 'Oturum geçersiz veya süresi dolmuş');
      request.authUser = user;
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
