/**
 * BravoForm — Logger estruturado
 *
 * Substitui `console.log/warn/error` espalhados pelo código.
 *
 * Comportamento:
 *   - Em DEVELOPMENT: imprime no console com formatação rica (cores, contexto)
 *   - Em PRODUCTION: silencia `debug` e `info`, mantém `warn`/`error` minimal
 *   - Hook futuro: `onLog()` permite plugar Sentry/Datadog/Logtail sem
 *     refatorar os call sites
 *
 * Uso:
 *   import { logger } from '@/lib/logger';
 *
 *   logger.info('Workflow saved', { workflowId, userId });
 *   logger.warn('Slow query detected', { duration_ms });
 *   logger.error('Failed to save', err, { workflowId });
 *
 * Nunca use `console.*` direto em código de produção.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

type LogSink = (level: LogLevel, message: string, context?: LogContext, error?: unknown) => void;

const isDev =
  typeof process !== 'undefined' &&
  (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_LOG_LEVEL === 'debug');

const isBrowser = typeof window !== 'undefined';

// ─── Sinks: para onde o log vai ────────────────────────────────────────────
const sinks: LogSink[] = [];

/**
 * Plugue um sink customizado (Sentry, Datadog, Logtail, etc.)
 *
 * Exemplo:
 *   addLogSink((level, msg, ctx, err) => {
 *     if (level === 'error') Sentry.captureException(err, { extra: ctx });
 *   });
 */
export function addLogSink(sink: LogSink) {
  sinks.push(sink);
}

// ─── Console formatter (apenas dev) ────────────────────────────────────────
const stylesByLevel: Record<LogLevel, string> = {
  debug: 'color: #9CA3AF; font-weight: bold',
  info:  'color: #3B82F6; font-weight: bold',
  warn:  'color: #F59E0B; font-weight: bold',
  error: 'color: #EF4444; font-weight: bold',
};

function formatTime() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`;
}

function emit(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  // Em produção: silencia debug/info
  if (!isDev && (level === 'debug' || level === 'info')) {
    return;
  }

  // Console (sempre que dev OU warn/error em prod)
  if (isDev) {
    const style = stylesByLevel[level];
    const prefix = `%c[${formatTime()}] ${level.toUpperCase()}`;
    if (isBrowser) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      if (context && error) fn(prefix, style, message, context, error);
      else if (context) fn(prefix, style, message, context);
      else if (error) fn(prefix, style, message, error);
      else fn(prefix, style, message);
    } else {
      // No server, sem cores ANSI para evitar lixo nos logs do Vercel
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      const parts = [`[${level.toUpperCase()}]`, message];
      if (context) parts.push(JSON.stringify(context));
      if (error) parts.push(error instanceof Error ? error.stack || error.message : String(error));
      fn(parts.join(' '));
    }
  } else {
    // Produção: warn/error minimal
    const fn = level === 'error' ? console.error : console.warn;
    fn(`[${level}]`, message, context ? JSON.stringify(context) : '', error ?? '');
  }

  // Encaminha para sinks customizados
  for (const sink of sinks) {
    try {
      sink(level, message, context, error);
    } catch {
      // Sinks nunca devem quebrar a aplicação
    }
  }
}

// ─── API pública ───────────────────────────────────────────────────────────
export const logger = {
  debug(message: string, context?: LogContext) {
    emit('debug', message, context);
  },
  info(message: string, context?: LogContext) {
    emit('info', message, context);
  },
  warn(message: string, context?: LogContext, error?: unknown) {
    emit('warn', message, context, error);
  },
  error(message: string, error?: unknown, context?: LogContext) {
    emit('error', message, context, error);
  },
};
