import type { Logger } from '../types';

/**
 * Log levels in order of priority (lowest to highest)
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log context structure for consistent logging format
 */
export interface LogContext {
  /** The URL being processed */
  url?: string;
  /** Cache key involved in the operation */
  cacheKey?: string;
  /** HTTP status code */
  status?: number;
  /** Operation duration in milliseconds */
  duration?: number;
  /** Error object if applicable */
  error?: unknown;
  /** Cache hit/miss/stale status */
  cacheStatus?: string;
  /** TTL value in seconds */
  ttl?: number;
  /** Request method */
  method?: string;
  /** Additional context data */
  [key: string]: unknown;
}

/**
 * Creates a standardized log message with SharedCache prefix
 */
function createLogMessage(operation: string, details?: string): string {
  return details
    ? `SharedCache: ${operation} - ${details}`
    : `SharedCache: ${operation}`;
}

/**
 * Logger utility class that provides consistent logging format and optional level filtering
 */
export class SharedCacheLogger {
  private logger?: Logger;
  private minLevel: LogLevel;

  constructor(logger?: Logger, minLevel: LogLevel = LogLevel.INFO) {
    this.logger = logger;
    this.minLevel = minLevel;
  }

  /**
   * Log debug information about cache operations
   */
  debug(operation: string, context?: LogContext, details?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const message = createLogMessage(operation, details);
      this.logger?.debug(message, context);
    }
  }

  /**
   * Log informational messages about successful operations
   */
  info(operation: string, context?: LogContext, details?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const message = createLogMessage(operation, details);
      this.logger?.info(message, context);
    }
  }

  /**
   * Log warning messages about potentially problematic situations
   */
  warn(operation: string, context?: LogContext, details?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const message = createLogMessage(operation, details);
      this.logger?.warn(message, context);
    }
  }

  /**
   * Log error messages about failed operations
   */
  error(operation: string, context?: LogContext, details?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const message = createLogMessage(operation, details);
      this.logger?.error(message, context);
    }
  }

  /**
   * Handle promise rejections with proper error logging
   */
  handleAsyncError = (operation: string, context?: LogContext) => {
    return (error: unknown) => {
      this.error(operation, { ...context, error }, 'Promise rejected');
    };
  };

  /**
   * Check if a log level should be output based on minimum level setting
   */
  private shouldLog(level: LogLevel): boolean {
    return Boolean(this.logger && level >= this.minLevel);
  }

  /**
   * Create a new logger instance with a different minimum level
   */
  withLevel(minLevel: LogLevel): SharedCacheLogger {
    return new SharedCacheLogger(this.logger, minLevel);
  }

  /**
   * Check if logger is available and can log at the specified level
   */
  canLog(level: LogLevel): boolean {
    return this.shouldLog(level);
  }
}

/**
 * Helper function to create a SharedCacheLogger instance
 */
export function createLogger(
  logger?: Logger,
  minLevel: LogLevel = LogLevel.INFO
): SharedCacheLogger {
  return new SharedCacheLogger(logger, minLevel);
}
