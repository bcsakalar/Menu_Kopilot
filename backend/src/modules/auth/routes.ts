import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ADMIN_COOKIE, clearCookie, getAuthUser, sessionCookie } from '../../plugins/auth.js';
import { loginBodySchema, tokenResponseSchema, userDtoSchema } from './schemas.js';
import type { AuthService } from './service.js';

/** The admin panel's sign-in. The site itself has none: see `ensureVisitor` in plugins/auth.ts. */
export const authRoutes: FastifyPluginAsyncZod<{ service: AuthService; secureCookies: boolean }> = async (
  app,
  { service, secureCookies },
) => {
  app.post(
    '/auth/login',
    {
      // Per address, for password guessing: a few admins behind one office address still have room (D-215).
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Admin panel sign-in: email + password; sets the admin cookie',
        body: loginBodySchema,
        response: { 200: tokenResponseSchema },
      },
    },
    async (request, reply) => {
      const tokens = await service.login(request.body.email, request.body.password, request.body.deviceName);
      reply.header('set-cookie', sessionCookie(ADMIN_COOKIE, tokens.accessToken, tokens.expiresIn, secureCookies, 'Strict'));
      return tokens;
    },
  );

  app.post(
    '/auth/logout',
    {
      onRequest: [app.authenticateAdmin],
      schema: { tags: ['auth'], summary: 'End the admin session', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      await service.logout(getAuthUser(request).deviceId);
      return reply.header('set-cookie', clearCookie(ADMIN_COOKIE)).code(204).send();
    },
  );

  app.get(
    '/auth/me',
    {
      onRequest: [app.authenticateAdmin],
      schema: { tags: ['auth'], security: [{ bearerAuth: [] }], response: { 200: userDtoSchema } },
    },
    async (request) => {
      const { deviceId: _deviceId, ...user } = getAuthUser(request);
      return user;
    },
  );
};
