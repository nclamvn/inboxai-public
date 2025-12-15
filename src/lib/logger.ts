/**
 * Production-safe Logger
 * Only logs in development, silent in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix?: string;
  enabled?: boolean;
}

const isDev = process.env.NODE_ENV === 'development';

class Logger {
  private prefix: string;
  private enabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.enabled = options.enabled ?? isDev;
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}]` : '';
    const formattedMessage = `${timestamp} ${prefixStr} ${message}`;

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...args);
        break;
      case 'info':
        console.info(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'error':
        // Always log errors, even in production
        console.error(formattedMessage, ...args);
        break;
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.formatMessage('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.formatMessage('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.formatMessage('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    // Errors always log regardless of environment
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}]` : '';
    console.error(`${timestamp} ${prefixStr} ${message}`, ...args);
  }

  // Create a child logger with a specific prefix
  child(prefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({ prefix: newPrefix, enabled: this.enabled });
  }
}

// Default logger instance
export const logger = new Logger();

// Create loggers for specific modules
export const createLogger = (prefix: string): Logger => {
  return new Logger({ prefix });
};

// Pre-configured loggers for common modules
export const apiLogger = createLogger('API');
export const aiLogger = createLogger('AI');
export const gmailLogger = createLogger('GMAIL');
export const syncLogger = createLogger('SYNC');
export const authLogger = createLogger('AUTH');

export default logger;
