import { createLogger, LogLevel, SharedCacheLogger } from './logger';
import type { Logger } from '../types';

describe('SharedCacheLogger', () => {
  let mockLogger: Logger;
  let loggerInstance: SharedCacheLogger;
  let mockCalls: {
    [key: string]: Array<{ message: unknown; params: unknown[] }>;
  };

  beforeEach(() => {
    mockCalls = { info: [], warn: [], debug: [], error: [] };

    mockLogger = {
      info: (message: unknown, ...params: unknown[]) => {
        mockCalls.info.push({ message, params });
      },
      warn: (message: unknown, ...params: unknown[]) => {
        mockCalls.warn.push({ message, params });
      },
      debug: (message: unknown, ...params: unknown[]) => {
        mockCalls.debug.push({ message, params });
      },
      error: (message: unknown, ...params: unknown[]) => {
        mockCalls.error.push({ message, params });
      },
    };
    loggerInstance = createLogger(mockLogger, LogLevel.DEBUG);
  });

  describe('Log Level Filtering', () => {
    it('should respect minimum log level', () => {
      const infoLogger = createLogger(mockLogger, LogLevel.INFO);

      infoLogger.debug('debug message', { test: true });
      infoLogger.info('info message', { test: true });
      infoLogger.warn('warn message', { test: true });
      infoLogger.error('error message', { test: true });

      expect(mockCalls.debug).toHaveLength(0);
      expect(mockCalls.info).toEqual([
        { message: 'SharedCache: info message', params: [{ test: true }] },
      ]);
      expect(mockCalls.warn).toEqual([
        { message: 'SharedCache: warn message', params: [{ test: true }] },
      ]);
      expect(mockCalls.error).toEqual([
        { message: 'SharedCache: error message', params: [{ test: true }] },
      ]);
    });

    it('should log all levels when DEBUG level is set', () => {
      loggerInstance.debug('debug message');
      loggerInstance.info('info message');
      loggerInstance.warn('warn message');
      loggerInstance.error('error message');

      expect(mockCalls.debug).toEqual([
        { message: 'SharedCache: debug message', params: [undefined] },
      ]);
      expect(mockCalls.info).toEqual([
        { message: 'SharedCache: info message', params: [undefined] },
      ]);
      expect(mockCalls.warn).toEqual([
        { message: 'SharedCache: warn message', params: [undefined] },
      ]);
      expect(mockCalls.error).toEqual([
        { message: 'SharedCache: error message', params: [undefined] },
      ]);
    });
  });

  describe('Message Formatting', () => {
    it('should format messages with SharedCache prefix', () => {
      loggerInstance.info('test operation', { url: 'http://example.com' });

      expect(mockCalls.info).toEqual([
        {
          message: 'SharedCache: test operation',
          params: [{ url: 'http://example.com' }],
        },
      ]);
    });

    it('should include details in message when provided', () => {
      loggerInstance.warn('cache miss', { cacheKey: 'test' }, 'Key not found');

      expect(mockCalls.warn).toEqual([
        {
          message: 'SharedCache: cache miss - Key not found',
          params: [{ cacheKey: 'test' }],
        },
      ]);
    });

    it('should handle undefined context gracefully', () => {
      loggerInstance.error('operation failed');

      expect(mockCalls.error).toEqual([
        { message: 'SharedCache: operation failed', params: [undefined] },
      ]);
    });
  });

  describe('Error Handler', () => {
    it('should create error handler function', () => {
      const handler = loggerInstance.handleAsyncError('async operation', {
        url: 'test',
      });
      const testError = new Error('test error');

      handler(testError);

      expect(mockCalls.error).toEqual([
        {
          message: 'SharedCache: async operation - Promise rejected',
          params: [{ url: 'test', error: testError }],
        },
      ]);
    });
  });

  describe('Utility Methods', () => {
    it('should check if logging is available', () => {
      expect(loggerInstance.canLog(LogLevel.DEBUG)).toBe(true);
      expect(loggerInstance.canLog(LogLevel.ERROR)).toBe(true);

      const noLogger = createLogger(undefined);
      expect(noLogger.canLog(LogLevel.INFO)).toBe(false);
    });

    it('should create logger with different level', () => {
      const warnLogger = loggerInstance.withLevel(LogLevel.WARN);

      warnLogger.debug('debug message');
      warnLogger.info('info message');
      warnLogger.warn('warn message');

      expect(mockCalls.debug).toHaveLength(0);
      expect(mockCalls.info).toHaveLength(0);
      expect(mockCalls.warn).toEqual([
        { message: 'SharedCache: warn message', params: [undefined] },
      ]);
    });
  });

  describe('No Logger Provided', () => {
    it('should not crash when no logger is provided', () => {
      const noLogger = createLogger();

      expect(() => {
        noLogger.debug('test');
        noLogger.info('test');
        noLogger.warn('test');
        noLogger.error('test');
      }).not.toThrow();
    });
  });
});

describe('LogLevel enum', () => {
  it('should have correct priority order', () => {
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
  });
});
