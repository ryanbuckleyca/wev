import 'server-only';
import pino from 'pino';

/**
 * Server-only structured logging. Do not import from client components.
 *
 * - Production: JSON to stdout (log aggregators parse `level`, `msg`, `name`, etc.)
 * - Development: optional `pino-pretty` when `LOG_PRETTY` is not `0`
 * - Tests: `vitest.setup.ts` sets `LOG_LEVEL=silent`
 */
const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const usePrettyTransport =
  process.env.NODE_ENV === 'development' &&
  process.env.LOG_PRETTY !== '0' &&
  process.env.VITEST !== 'true' &&
  process.env.CI !== 'true';

export const logger = pino(
  usePrettyTransport
    ? {
        level,
        name: 'wev-bulletin',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        level,
        name: 'wev-bulletin',
      },
);
