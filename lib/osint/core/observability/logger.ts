// ============================================================
// OSINT Platform — Structured Logger
// ============================================================
// JSON-structured logger with trace correlation IDs.
// Every log line is a self-contained JSON object suitable
// for ingestion into CloudWatch, Datadog, or similar.
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  (process.env.OSINT_LOG_LEVEL as LogLevel) || "info";

/** Metadata attached to every log line */
export interface LogMeta {
  traceId?: string;
  runId?: string;
  agentId?: string;
  providerId?: string;
  entityId?: string;
  stage?: string;
  durationMs?: number;
  query?: string;
  url?: string;
  status?: number | string;
  [key: string]: unknown;
}

export interface StructuredLogger {
  log(level: LogLevel, message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  /** Create a child logger that always includes the given bindings */
  child(bindings: LogMeta): StructuredLogger;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatLog(level: LogLevel, message: string, meta?: LogMeta): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  return JSON.stringify(entry);
}

class ConsoleStructuredLogger implements StructuredLogger {
  constructor(private bindings: LogMeta = {}) {}

  log(level: LogLevel, message: string, meta?: LogMeta): void {
    if (!shouldLog(level)) return;
    const merged = { ...this.bindings, ...meta };
    const formatted = formatLog(level, message, merged);

    if (level === "error") console.error(formatted);
    else if (level === "warn") console.warn(formatted);
    else if (level === "debug") console.debug(formatted);
    else console.log(formatted);
  }

  debug(message: string, meta?: LogMeta): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.log("error", message, meta);
  }

  child(bindings: LogMeta): StructuredLogger {
    return new ConsoleStructuredLogger({ ...this.bindings, ...bindings });
  }
}

/** Root logger — use this or create a child with traceId/runId */
export const logger: StructuredLogger = new ConsoleStructuredLogger();

/** Create a logger pre-bound with a traceId and runId */
export function createRunLogger(traceId: string, runId: string): StructuredLogger {
  return logger.child({ traceId, runId });
}
