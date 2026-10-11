import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getAuthUser } from '../../plugins/auth.js';
import { deviceBodySchema, loginBodySchema, refreshBodySchema, tokenResponseSchema, userDtoSchema } from './schemas.js';
import type { AuthService } from './service.js';

export const authRoutes: FastifyPluginAsyncZod<{ service: AuthService }> = async (app, { service }) => {
  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Email + password login; registers the device and returns tokens',
        body: loginBodySchema,
        response: { 200: tokenResponseSchema },
      },
    },
    async (request) => service.login(request.body.email, request.body.password, request.body.deviceName),
  );

  app.post(
    '/auth/device',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Device sign-in with the key the app is built with (no e-mail/password); returns tokens',
        body: deviceBodySchema,
        response: { 200: tokenResponseSchema },
      },
    },
    async (request) => service.enrollDevice(request.body.appKey, request.body.deviceName),
  );

  app.post(
    '/auth/refresh',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh token and issue a new access token',
        body: refreshBodySchema,
        response: { 200: tokenResponseSchema },
      },
    },
    async (request) => service.refresh(request.body.refreshToken),
  );

  app.post(
    '/auth/logout',
    {
      onRequest: [app.authenticate],
      schema: { tags: ['auth'], summary: 'Revoke the current device session', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      await service.logout(getAuthUser(request).deviceId);
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/me',
    {
      onRequest: [app.authenticate],
      schema: { tags: ['auth'], security: [{ bearerAuth: [] }], response: { 200: userDtoSchema } },
    },
    async (request) => {
      const { deviceId: _deviceId, ...user } = getAuthUser(request);
      return user;
    },
  );
};
