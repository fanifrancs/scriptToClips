// Tiny structured logger for the app's backend workflow.
//
// This deliberately uses console logging instead of a logging service because
// the project is still small. The important industry-standard habit here is
// that long-running actions get a request id, timestamps, and a consistent
// event name, so production issues can be traced later without rewriting every
// route.
export function createRequestLogger(scope: string): Logger {
  const requestId = `${scope}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = Date.now();

  function write(level: 'info' | 'error', event: string, details: Record<string, unknown> = {}) {
    const payload = {
      level,
      scope,
      requestId,
      event,
      elapsedMs: Date.now() - startedAt,
      ...details
    };

    console[level === 'error' ? 'error' : 'log'](JSON.stringify(payload));
  }

  return {
    id: requestId,
    info: (event, details) => write('info', event, details),
    error: (event, details) => write('error', event, details)
  };
}
import type { Logger } from './types';
