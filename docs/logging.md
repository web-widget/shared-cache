# Logging and Debugging

[← Back to README](../README.md) · [Documentation index](./README.md)

SharedCache provides a comprehensive logging system with structured output for monitoring and debugging cache operations.

## Logger Interface

```typescript
interface Logger {
  info(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  debug(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}
```

## Basic Logger Setup

```typescript
import { createLogger, LogLevel } from '@web-widget/shared-cache';

// Create a simple console logger
const logger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  debug: console.debug.bind(console),
  error: console.error.bind(console),
};

// Create SharedCache with logger
const cache = new SharedCache(storage, {
  logger,
});
```

## Log Levels

### DEBUG

- **Purpose**: Detailed operational information for development and troubleshooting
- **Content**: Cache lookups, key generation, policy decisions
- **Example Output**:
  ```
  SharedCache: Cache miss { url: 'https://api.com/data', cacheKey: 'api:data', method: 'GET' }
  SharedCache: Cache item found { url: 'https://api.com/data', cacheKey: 'api:data', method: 'GET' }
  ```

### INFO

- **Purpose**: Normal operational messages about successful operations
- **Content**: Cache hits, revalidation results, stale responses
- **Example Output**:
  ```
  SharedCache: Cache hit { url: 'https://api.com/data', cacheKey: 'api:data', cacheStatus: 'HIT' }
  SharedCache: Serving stale response - Revalidating in background { url: 'https://api.com/data', cacheKey: 'api:data', cacheStatus: 'UPDATING' }
  ```

### WARN

- **Purpose**: Potentially problematic situations that don't prevent operation
- **Content**: Network errors with fallback, deprecated usage
- **Example Output**:
  ```
  SharedCache: Revalidation network error - Using fallback 500 response { url: 'https://api.com/data', cacheKey: 'api:data', error: [NetworkError] }
  ```

### ERROR

- **Purpose**: Critical issues that prevent normal operation
- **Content**: Storage failures, revalidation failures, validation errors
- **Example Output**:
  ```
  SharedCache: Put operation failed { url: 'https://api.com/data', error: [StorageError] }
  SharedCache: Revalidation failed - Server returned 5xx status { url: 'https://api.com/data', status: 503, cacheKey: 'api:data' }
  ```

## Logger Configuration Examples

### Production Logging (INFO level)

```typescript
const productionLogger = {
  info: (msg, ctx) =>
    console.log(JSON.stringify({ level: 'INFO', message: msg, ...ctx })),
  warn: (msg, ctx) =>
    console.warn(JSON.stringify({ level: 'WARN', message: msg, ...ctx })),
  debug: () => {}, // No debug in production
  error: (msg, ctx) =>
    console.error(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
};

const cache = new SharedCache(storage, {
  logger: productionLogger,
});
```

### Development Logging (DEBUG level)

```typescript
const devLogger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  debug: console.debug.bind(console),
  error: console.error.bind(console),
};

const cache = new SharedCache(storage, {
  logger: devLogger,
});
```

### Structured Logger with Level Filtering

```typescript
import { createLogger, LogLevel } from '@web-widget/shared-cache';

class CustomLogger {
  info(message: unknown, ...params: unknown[]) {
    this.log('INFO', message, ...params);
  }

  warn(message: unknown, ...params: unknown[]) {
    this.log('WARN', message, ...params);
  }

  debug(message: unknown, ...params: unknown[]) {
    this.log('DEBUG', message, ...params);
  }

  error(message: unknown, ...params: unknown[]) {
    this.log('ERROR', message, ...params);
  }

  private log(level: string, message: unknown, ...params: unknown[]) {
    const timestamp = new Date().toISOString();
    const context = params[0] || {};
    console.log(
      JSON.stringify({
        timestamp,
        level,
        service: 'shared-cache',
        message,
        ...context,
      })
    );
  }
}

const customLogger = new CustomLogger();
const structuredLogger = createLogger(customLogger, LogLevel.DEBUG);

const cache = new SharedCache(storage, {
  logger: customLogger,
});
```

## Context Data Structure

All log messages include structured context data:

```typescript
interface CacheLogContext {
  url?: string; // Request URL
  cacheKey?: string; // Generated cache key
  status?: number; // HTTP status code
  duration?: number; // Operation duration (ms)
  error?: unknown; // Error object
  cacheStatus?: string; // Cache result status
  ttl?: number; // Time to live (seconds)
  method?: string; // HTTP method
  [key: string]: unknown; // Additional context
}
```

## Best Practices

1. **Use appropriate log levels**: Don't log normal operations at ERROR level
2. **Include relevant context**: URL, cache key, and timing information help with debugging
3. **Filter by environment**: Use DEBUG level in development, INFO+ in production
4. **Monitor error logs**: Set up alerts for ERROR level messages
5. **Structure your data**: Use consistent context object structures for easier parsing

## Performance Considerations

- **DEBUG level**: Can be verbose in high-traffic scenarios. Use sparingly in production
- **Structured data**: Context objects are not deeply cloned. Avoid modifying context after logging
- **Async operations**: Background revalidation errors are properly caught and logged without blocking responses

## Advanced Debugging Techniques

### Cache Hit Rate Monitoring

```typescript
import { createLogger, LogLevel } from '@web-widget/shared-cache';

let hitCount = 0;
let totalCount = 0;

const monitoringLogger = {
  info: (message, context) => {
    if (context?.cacheStatus) {
      totalCount++;
      if (context.cacheStatus === 'HIT') hitCount++;

      // Log hit rate every 100 requests
      if (totalCount % 100 === 0) {
        console.log(
          `Cache hit rate: ${((hitCount / totalCount) * 100).toFixed(2)}%`
        );
      }
    }
    console.log(message, context);
  },
  warn: console.warn,
  debug: console.debug,
  error: console.error,
};

const cache = new SharedCache(storage, {
  logger: createLogger(monitoringLogger, LogLevel.INFO),
});
```

### Performance Tracking

```typescript
const performanceLogger = {
  info: (message, context) => {
    if (context?.duration) {
      console.log(`${message} - Duration: ${context.duration}ms`, context);
    } else {
      console.log(message, context);
    }
  },
  warn: console.warn,
  debug: console.debug,
  error: console.error,
};
```

### Custom Alerting

```typescript
const alertingLogger = {
  info: console.log,
  warn: console.warn,
  debug: console.debug,
  error: (message, context) => {
    console.error(message, context);

    // Send alerts for critical cache errors
    if (context?.error && message.includes('Put operation failed')) {
      sendAlert(`Cache storage error: ${context.error.message}`);
    }
  },
};
```
