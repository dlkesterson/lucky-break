export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly subsystem: string;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
}

export type LogWriter = (entry: LogEntry) => void;
export type NowFn = () => number;

const toIsoTimestamp = (timestamp: number): string => new Date(timestamp).toISOString();

const bindConsole = <Key extends LogLevel>(method: Key): ((...parts: unknown[]) => void) => {
  const { console } = globalThis;
  const fallback = console.log.bind(console);
  const candidate = console[method]?.bind(console);
  return (candidate ?? fallback) as (...parts: unknown[]) => void;
};

const consoleSinks: Record<LogLevel, (...parts: unknown[]) => void> = {
  debug: bindConsole('debug'),
  info: bindConsole('info'),
  warn: bindConsole('warn'),
  error: bindConsole('error'),
};

export const defaultLogWriter: LogWriter = (entry) => {
  const sink = consoleSinks[entry.level];
  const prefix = `[${entry.level.toUpperCase()}][${entry.subsystem}]`;
  const timestamp = toIsoTimestamp(entry.timestamp);

  if (entry.context && Object.keys(entry.context).length > 0) {
    sink(`${timestamp} ${prefix} ${entry.message}`, entry.context);
    return;
  }

  sink(`${timestamp} ${prefix} ${entry.message}`);
};

export interface Logger {
  readonly debug: (message: string, context?: Record<string, unknown>) => void;
  readonly info: (message: string, context?: Record<string, unknown>) => void;
  readonly warn: (message: string, context?: Record<string, unknown>) => void;
  readonly error: (message: string, context?: Record<string, unknown>) => void;
  readonly child: (subsystem: string) => Logger;
}

export interface LoggerOptions {
  readonly writer?: LogWriter;
  readonly now?: NowFn;
}

const sanitizeSubsystem = (subsystem: string): string => subsystem.trim() || 'unknown';

const createLoggerForLevel = (
  level: LogLevel,
  subsystem: string,
  writer: LogWriter,
  now: NowFn,
): ((message: string, context?: Record<string, unknown>) => void) => {
  return (message, context) => {
    const entry: LogEntry = {
      level,
      subsystem,
      message,
      context,
      timestamp: now(),
    };
    writer(entry);
  };
};

export const createLogger = (subsystem: string, options: LoggerOptions = {}): Logger => {
  const writer = options.writer ?? defaultLogWriter;
  const now = options.now ?? Date.now;
  const normalized = sanitizeSubsystem(subsystem);

  const debug = createLoggerForLevel('debug', normalized, writer, now);
  const info = createLoggerForLevel('info', normalized, writer, now);
  const warn = createLoggerForLevel('warn', normalized, writer, now);
  const error = createLoggerForLevel('error', normalized, writer, now);

  const child: Logger['child'] = (suffix) => {
    const combined = `${normalized}:${sanitizeSubsystem(suffix)}`;
    return createLogger(combined, { writer, now });
  };

  return {
    debug,
    info,
    warn,
    error,
    child,
  };
};

export const rootLogger = createLogger('app');
