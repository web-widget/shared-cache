import {
  createLogger,
  LogLevel,
  StructuredLogger,
  createSharedCacheLogger,
  Logger,
} from './logger';
import type { SharedCacheLogContext } from '../types';

describe('StructuredLogger', () => {
  let mockLogger: Logger;
  let loggerInstance: StructuredLogger<SharedCacheLogContext>;
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
    loggerInstance = createLogger<SharedCacheLogContext>(
      mockLogger,
      LogLevel.DEBUG,
      'SharedCache'
    );
  });

  describe('Log Level Filtering', () => {
    it('should respect minimum log level', () => {
      const infoLogger = createLogger(mockLogger, LogLevel.INFO, 'SharedCache');

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

    it('should format messages with custom prefix when provided', () => {
      const prefixedLogger = createLogger(mockLogger, LogLevel.DEBUG, 'MyApp');
      prefixedLogger.info('test operation', { url: 'http://example.com' });

      expect(mockCalls.info).toEqual([
        {
          message: 'MyApp: test operation',
          params: [{ url: 'http://example.com' }],
        },
      ]);
    });

    it('should include details in message when provided', () => {
      const prefixedLogger = createLogger(
        mockLogger,
        LogLevel.DEBUG,
        'TestApp'
      );
      prefixedLogger.warn('cache miss', { cacheKey: 'test' }, 'Key not found');

      expect(mockCalls.warn).toEqual([
        {
          message: 'TestApp: cache miss - Key not found',
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
      const prefixedLogger = createLogger(
        mockLogger,
        LogLevel.DEBUG,
        'ErrorTest'
      );
      const handler = prefixedLogger.handleAsyncError('async operation', {
        url: 'test',
      });
      const testError = new Error('test error');

      handler(testError);

      expect(mockCalls.error).toEqual([
        {
          message: 'ErrorTest: async operation - Promise rejected',
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

    it('should create logger with different prefix', () => {
      const originalLogger = createLogger(
        mockLogger,
        LogLevel.DEBUG,
        'Original'
      );
      const newPrefixLogger = originalLogger.withPrefix('NewPrefix');

      newPrefixLogger.info('test message');

      expect(mockCalls.info).toEqual([
        { message: 'NewPrefix: test message', params: [undefined] },
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

describe('SharedCache Backward Compatibility', () => {
  let mockLogger: Logger;
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
  });

  it('should maintain SharedCache prefix compatibility with createSharedCacheLogger', () => {
    const sharedCacheLogger = createSharedCacheLogger(
      mockLogger,
      LogLevel.DEBUG
    );

    sharedCacheLogger.info('test operation', { url: 'http://example.com' });

    expect(mockCalls.info).toEqual([
      {
        message: 'SharedCache: test operation',
        params: [{ url: 'http://example.com' }],
      },
    ]);
  });

  it('should allow creating SharedCache logger using createLogger with prefix', () => {
    const sharedCacheLogger = createLogger(
      mockLogger,
      LogLevel.DEBUG,
      'SharedCache'
    );

    sharedCacheLogger.warn('cache miss', { cacheKey: 'test' }, 'Key not found');

    expect(mockCalls.warn).toEqual([
      {
        message: 'SharedCache: cache miss - Key not found',
        params: [{ cacheKey: 'test' }],
      },
    ]);
  });
});

describe('Generic Context Types', () => {
  interface CustomLogContext {
    userId: string;
    action: string;
    timestamp: number;
  }

  let mockLogger: Logger;
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
  });

  it('should work with custom context types', () => {
    const typedLogger = createLogger<CustomLogContext>(
      mockLogger,
      LogLevel.INFO,
      'CustomApp'
    );

    const context: CustomLogContext = {
      userId: 'user123',
      action: 'login',
      timestamp: Date.now(),
    };

    typedLogger.info('user action', context, 'successful login');

    expect(mockCalls.info).toEqual([
      {
        message: 'CustomApp: user action - successful login',
        params: [context],
      },
    ]);
  });

  it('should work with default generic type', () => {
    const defaultLogger = createLogger(mockLogger, LogLevel.INFO, 'DefaultApp');

    defaultLogger.info('operation', { key: 'value', count: 42 });

    expect(mockCalls.info).toEqual([
      {
        message: 'DefaultApp: operation',
        params: [{ key: 'value', count: 42 }],
      },
    ]);
  });
});

describe('LogLevel enum', () => {
  it('should have correct priority order', () => {
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
  });
});
