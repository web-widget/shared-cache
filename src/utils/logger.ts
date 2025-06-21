/**
 * Generic logger interface for any logging implementation.
 * Provides standardized logging methods compatible with console, winston, pino, etc.
 */
export interface Logger {
  /**
   * Log informational messages about normal operations.
   */
  info(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Log warning messages about potentially problematic situations.
   */
  warn(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Log detailed debugging information.
   */
  debug(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Log error messages about failed operations.
   */
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

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
 * Creates a standardized log message with configurable prefix
 */
function createLogMessage(
  operation: string,
  prefix?: string,
  details?: string
): string {
  const baseMessage = prefix ? `${prefix}: ${operation}` : operation;
  return details ? `${baseMessage} - ${details}` : baseMessage;
}

/**
 * Structured logger utility class that provides consistent logging format and optional level filtering
 * @template TContext - The log context type structure, defaults to a flexible object type
 */
export class StructuredLogger<TContext = Record<string, unknown>> {
  private logger?: Logger;
  private minLevel: LogLevel;
  private prefix?: string;

  constructor(
    logger?: Logger,
    minLevel: LogLevel = LogLevel.INFO,
    prefix?: string
  ) {
    this.logger = logger;
    this.minLevel = minLevel;
    this.prefix = prefix;
  }

  /**
   * Log debug information about operations
   */
  debug(operation: string, context?: TContext, details?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const message = createLogMessage(operation, this.prefix, details);
      this.logger?.debug(message, context);
    }
  }

  /**
   * Log informational messages about successful operations
   */
  info(operation: string, context?: TContext, details?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const message = createLogMessage(operation, this.prefix, details);
      this.logger?.info(message, context);
    }
  }

  /**
   * Log warning messages about potentially problematic situations
   */
  warn(operation: string, context?: TContext, details?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const message = createLogMessage(operation, this.prefix, details);
      this.logger?.warn(message, context);
    }
  }

  /**
   * Log error messages about failed operations
   */
  error(operation: string, context?: TContext, details?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const message = createLogMessage(operation, this.prefix, details);
      this.logger?.error(message, context);
    }
  }

  /**
   * Handle promise rejections with proper error logging
   */
  handleAsyncError = (operation: string, context?: TContext) => {
    return (error: unknown) => {
      this.error(
        operation,
        { ...context, error } as TContext,
        'Promise rejected'
      );
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
  withLevel(minLevel: LogLevel): StructuredLogger<TContext> {
    return new StructuredLogger<TContext>(this.logger, minLevel, this.prefix);
  }

  /**
   * Create a new logger instance with a different prefix
   */
  withPrefix(prefix: string): StructuredLogger<TContext> {
    return new StructuredLogger<TContext>(this.logger, this.minLevel, prefix);
  }

  /**
   * Check if logger is available and can log at the specified level
   */
  canLog(level: LogLevel): boolean {
    return this.shouldLog(level);
  }
}

/**
 * Helper function to create a structured logger instance
 * @template TContext - The log context type structure
 */
export function createLogger<TContext = Record<string, unknown>>(
  logger?: Logger,
  minLevel: LogLevel = LogLevel.INFO,
  prefix?: string
): StructuredLogger<TContext> {
  return new StructuredLogger<TContext>(logger, minLevel, prefix);
}

/**
 * Helper function to create a SharedCache-specific logger instance
 * @deprecated Use createLogger with prefix parameter instead
 */
export function createSharedCacheLogger<TContext = Record<string, unknown>>(
  logger?: Logger,
  minLevel: LogLevel = LogLevel.INFO
): StructuredLogger<TContext> {
  return new StructuredLogger<TContext>(logger, minLevel, 'SharedCache');
}

// For backward compatibility
export const SharedCacheLogger = StructuredLogger;
