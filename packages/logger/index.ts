export interface ILogger {
  debug: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
  fatal: (message: string, meta?: any) => void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const globalProcess: any = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
const env: Record<string, string | undefined> = globalProcess?.env ?? {};

const getLogLevel = (): LogLevel => {
  const level = (env.VITE_LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LOG_LEVELS[level] !== undefined ? level : 'info';
};

const currentLogLevel = getLogLevel();

const sensitiveKeys = [
  'password',
  'secret',
  'authorization',
  'apikey',
];

const redactSensitiveInfo = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveInfo);
  }

  return Object.keys(obj).reduce((acc, key) => {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((k) => lowerKey.includes(k))) {
      acc[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object') {
      if (obj[key] instanceof Date) {
        acc[key] = obj[key].toISOString();
      } else {
        acc[key] = redactSensitiveInfo(obj[key]);
      }
    } else {
      acc[key] = obj[key];
    }
    return acc;
  }, {} as any);
};

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  magenta: '\x1b[35m',      // For email/notification logs
  brightMagenta: '\x1b[95m', // Brighter magenta
};

const formatMessage = (level: LogLevel, service: string, message: string, meta?: any) => {
  const timestamp = new Date().toISOString();
  const redactedMeta = meta ? redactSensitiveInfo(meta) : {};

  return {
    timestamp,
    level,
    service,
    message,
    ...redactedMeta,
  };
};

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
};

export function createLogger({ name }: { name: string }): ILogger {
  const service = `${name}-${env.NODE_ENV ?? 'dev'}`;

  const log = (level: LogLevel, message: string, meta?: any) => {
    if (!shouldLog(level)) return;

    const formattedMessage = formatMessage(level, service, message, meta);

    // In development, use pretty console formatting
    if (env.NODE_ENV === 'development') {
      const styles = {
        debug: 'color: #888',
        info: 'color: #2196F3',
        warn: 'color: #FF9800',
        error: 'color: #F44336',
        fatal: 'color: #FFFFFF; background: #F44336; padding: 2px 4px',
      };

      // Console logging enabled for debugging
      console.log(
        `%c[${formattedMessage.timestamp}] ${level.toUpperCase()} ${service}:`,
        styles[level],
        message,
        meta ? formattedMessage : ''
      );
    } else {
      // In production, use JSON logging with ANSI colors
      const colorByLevel = {
        debug: COLORS.gray,
        info: COLORS.blue,
        warn: COLORS.yellow,
        error: COLORS.red,
        fatal: `${COLORS.bgRed}${COLORS.white}`,
      };

      // Special highlighting for email/notification services
      const isEmailService = service.includes('email') ||
                            service.includes('notification') ||
                            service.includes('delivery-queue') ||
                            message.toLowerCase().includes('email') ||
                            message.toLowerCase().includes('notification delivery');

      const color = isEmailService ? COLORS.brightMagenta : colorByLevel[level];
      const jsonString = JSON.stringify(formattedMessage);

      console.log(`${color}${jsonString}${COLORS.reset}`);
    }
  };

  return {
    debug: (message: string, meta?: any) => log('debug', message, meta),
    info: (message: string, meta?: any) => log('info', message, meta),
    warn: (message: string, meta?: any) => log('warn', message, meta),
    error: (message: string, meta?: any) => log('error', message, meta),
    fatal: (message: string, meta?: any) => log('fatal', message, meta),
  };
}

// Create default loggers for common use cases
export const authLogger = createLogger({ name: 'auth' });
export const routeLogger = createLogger({ name: 'route' });
export const appLogger = createLogger({ name: 'app' });
