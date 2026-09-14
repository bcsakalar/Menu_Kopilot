import type { LoggerOptions } from 'pino';
import type { AppConfig } from '../config/env.js';

/** Structured pino logging; secrets and tokens are always redacted. */
export function loggerOptions(config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>): LoggerOptions {
  const options: LoggerOptions = {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-goog-api-key"]',
        '*.password',
        '*.passwordHash',
        '*.refreshToken',
        '*.accessToken',
        '*.apiKey',
        '*.geminiApiKey',
        '*.groqApiKey',
        'headers.authorization',
      ],
      censor: '[redacted]',
    },
  };
  if (config.nodeEnv === 'development' && process.stdout.isTTY) {
    options.transport = { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };
  }
  return options;
}
