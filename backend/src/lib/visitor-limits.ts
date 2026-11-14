import { normalizeIP } from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

/**
 * Per-minute limits of the open site (D-214, D-215). A rep's browser is counted by its visitor cookie, not by its
 * address: every rep of an office reaches the site from the office's one public address, and reps behind a
 * corporate proxy share an address with other companies too (seen in production: 60 % of all messages came from one
 * address). The address limits are therefore generous; they only stop one machine from minting visitor after
 * visitor or flooding the site. An IPv6 address counts by its /64, the block one connection is given.
 */
export interface VisitorLimits {
  /** Requests per visitor cookie. */
  perVisitor: number;
  /** Requests without a valid cookie per address: each of them creates a visitor. */
  newPerAddress: number;
  /** Requests per address in all, whoever sends them. */
  perAddress: number;
}

export function visitorLimits(app: FastifyInstance, name: string, limits: VisitorLimits): (request: FastifyRequest) => Promise<void> {
  const address = (request: FastifyRequest): string => normalizeIP(request.ip, 64);
  const newcomer = `${name}-new:`;
  const perVisitor = app.createRateLimit({
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const visitor = app.sessionSubject(request);
      return visitor ? `${name}-visitor:${visitor}` : `${newcomer}${address(request)}`;
    },
    max: (_request, key) => (key.startsWith(newcomer) ? limits.newPerAddress : limits.perVisitor),
  });
  const perAddress = app.createRateLimit({
    timeWindow: '1 minute',
    keyGenerator: (request) => `${name}-address:${address(request)}`,
    max: limits.perAddress,
  });
  return async (request) => {
    for (const limit of [perAddress, perVisitor]) {
      const result = await limit(request);
      if (!result.isAllowed && result.isExceeded) throw new AppError('RATE_LIMITED', 'Çok fazla istek; biraz sonra tekrar dene');
    }
  };
}
