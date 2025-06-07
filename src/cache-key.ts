import { sha1 } from '@web-widget/helpers/crypto';
import {
  deviceType as getDeviceType,
  RequestCookies,
} from '@web-widget/helpers/headers';
import { CACHE_STATUS_HEADERS_NAME } from './constants';

/**
 * Filter options for controlling which keys to include/exclude in cache key generation.
 * Used to fine-tune cache key granularity and avoid cache pollution.
 */
export interface FilterOptions {
  /** Array of keys to explicitly include in the cache key */
  include?: string[];
  /** Array of keys to explicitly exclude from the cache key */
  exclude?: string[];
  /** Array of keys to check for presence only (value set to empty string) */
  checkPresence?: string[];
}

/**
 * Configuration rules for generating cache keys.
 * Defines which parts of the request should contribute to the cache key.
 *
 * Each property can be:
 * - `true`: Include the part with default behavior
 * - `false`: Exclude the part entirely
 * - `FilterOptions`: Include with specific filtering rules
 */
export interface SharedCacheKeyRules {
  /** Use request cookies as part of cache key for personalization */
  cookie?: FilterOptions | boolean;
  /** Use device type detection as part of cache key for responsive content */
  device?: FilterOptions | boolean;
  /** Use request headers as part of cache key for content negotiation */
  header?: FilterOptions | boolean;
  /** Use request host as part of cache key for multi-tenant applications */
  host?: FilterOptions | boolean;
  /** Use URL pathname as part of cache key for resource identification */
  pathname?: FilterOptions | boolean;
  /** Use URL search parameters as part of cache key for dynamic content */
  search?: FilterOptions | boolean;
  /** Use custom part of cache key for application-specific logic */
  [customPart: string]: unknown | boolean | undefined;
}

/**
 * Function signature for custom cache key part definers.
 * Allows extending cache key generation with application-specific logic.
 */
export interface SharedCacheKeyPartDefiners {
  [customPart: string]: (
    request: Request,
    options?: unknown
  ) => Promise<string> | undefined;
}

/**
 * Internal type for built-in cache key part definers that accept FilterOptions.
 * @internal
 */
type BuiltInExpandedPartDefiner = (
  request: Request,
  options?: FilterOptions
) => Promise<string>;

/**
 * Internal registry of built-in cache key part definers.
 * @internal
 */
interface BuiltInExpandedCacheKeyPartDefiners {
  [part: string]: BuiltInExpandedPartDefiner | undefined;
}

/**
 * Filters an array of key-value pairs based on include/exclude rules.
 *
 * This function implements a filtering algorithm that:
 * 1. First applies exclusion rules (blacklist)
 * 2. Then applies inclusion rules (whitelist)
 * 3. Finally applies presence check rules (keys without values)
 *
 * @param array - Array of [key, value] tuples to filter
 * @param options - Filtering options
 * @returns Filtered array of [key, value] tuples
 */
export function filter(
  array: [key: string, value: string][],
  options?: FilterOptions
) {
  let result = array;
  const exclude = options?.exclude;
  const include = options?.include;
  const checkPresence = options?.checkPresence;

  // Apply exclusion filter (blacklist)
  if (exclude?.length) {
    result = result.filter(([key]) => !exclude.includes(key));
  }

  // Apply inclusion filter (whitelist)
  if (include?.length) {
    result = result.filter(([key]) => include.includes(key));
  }

  // Apply presence check filter (keys without values)
  if (checkPresence?.length) {
    result = result.map((item) =>
      checkPresence.includes(item[0]) ? [item[0], ''] : item
    );
  }

  return result;
}

/**
 * Generates a short hash (6 characters) from input data.
 * Used to create compact cache key components while maintaining uniqueness.
 *
 * @param data - Data to hash
 * @returns Promise resolving to 6-character hash string
 * @internal
 */
async function shortHash(data: Parameters<typeof sha1>[0]) {
  return (await sha1(data))?.slice(0, 6);
}

/**
 * Sorts an array of key-value pairs by key name (case-sensitive).
 * Ensures consistent cache key generation regardless of input order.
 *
 * @param array - Array of [key, value] tuples to sort
 * @returns Sorted array of [key, value] tuples
 * @internal
 */
function sort(array: [key: string, value: string][]) {
  return array.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Converts FilterOptions string arrays to lowercase for case-insensitive matching.
 * Used for HTTP headers which are case-insensitive per RFC 7230.
 *
 * @param options - Filter options to convert
 * @returns New FilterOptions with lowercase strings
 * @internal
 */
function toLowerCase(options?: FilterOptions) {
  if (typeof options === 'object') {
    const newOptions: FilterOptions = {
      include: options.include?.map((name) => name.toLowerCase()),
      exclude: options.exclude?.map((name) => name.toLowerCase()),
      checkPresence: options.checkPresence?.map((name) => name.toLowerCase()),
    };
    return newOptions;
  }
  return options;
}

/**
 * Generates a cache key component based on request cookies.
 *
 * This function creates a deterministic cache key part from HTTP cookies,
 * which is useful for personalized content caching. Cookie values are hashed
 * to protect sensitive information while maintaining cache effectiveness.
 *
 * @param request - The HTTP request containing cookies
 * @param options - Optional filtering rules for cookie selection
 * @returns Promise resolving to cookie-based cache key component (format: "name1=hash1&name2=hash2")
 */
export async function cookie(request: Request, options?: FilterOptions) {
  const cookie = new RequestCookies(request.headers);
  const entries: [string, string][] = cookie
    .getAll()
    .map(({ name, value }) => [name, value]);

  return (
    await Promise.all(
      sort(filter(entries, options)).map(async ([key, value]) =>
        value ? `${key}=${await shortHash(value)}` : key
      )
    )
  ).join('&');
}

/**
 * Generates a cache key component based on device type detection.
 *
 * This function identifies the device type from User-Agent headers
 * and includes it in the cache key for responsive content delivery.
 * Useful for serving different content to mobile, tablet, and desktop devices.
 *
 * @param request - The HTTP request containing User-Agent header
 * @param options - Optional filtering rules for device type
 * @returns Promise resolving to device-based cache key component
 */
export async function device(request: Request, options?: FilterOptions) {
  const device = getDeviceType(request.headers);
  return filter([[device, '']], options)
    .map(([key]) => key)
    .join('');
}

/**
 * Generates a cache key component based on the request host.
 *
 * This function extracts the host from the URL for multi-tenant applications
 * where different hosts serve different content.
 *
 * @param url - The request URL containing the host
 * @param options - Optional filtering rules for host inclusion
 * @returns Host-based cache key component
 */
export function host(url: URL, options?: FilterOptions) {
  const host = url.host;
  return filter([[host, '']], options)
    .map(([key]) => key)
    .join('');
}

/**
 * Generates a cache key component based on the URL pathname.
 *
 * This function extracts the pathname for resource-based cache differentiation.
 * Essential for most caching scenarios as different paths represent different resources.
 *
 * @param url - The request URL containing the pathname
 * @param options - Optional filtering rules for pathname inclusion
 * @returns Pathname-based cache key component
 */
export function pathname(url: URL, options?: FilterOptions) {
  const pathname = url.pathname;
  return filter([[pathname, '']], options)
    .map(([key]) => key)
    .join('');
}

/**
 * Generates a cache key component based on URL search parameters.
 *
 * This function extracts and sorts query parameters to create consistent
 * cache keys for dynamic content. Parameters are sorted alphabetically
 * to ensure consistent key generation regardless of parameter order.
 *
 * @param url - The request URL containing search parameters
 * @param options - Optional filtering rules for parameter selection
 * @returns Search parameter-based cache key component (format: "?param1=value1&param2=value2")
 */
export function search(url: URL, options?: FilterOptions) {
  const { searchParams } = url;
  searchParams.sort();

  const entries = Array.from(searchParams.entries());
  const search = filter(entries, options)
    .map(([key, value]) => {
      return value ? `${key}=${value}` : key;
    })
    .join('&');
  return search ? `?${search}` : '';
}

/**
 * Generates a cache key component based on HTTP Vary header processing.
 *
 * This function implements the HTTP Vary header semantics as defined in RFC 7231.
 * It creates cache key components from request headers that are listed in the
 * response's Vary header, enabling proper content negotiation caching.
 *
 * Header names are converted to lowercase for case-insensitive comparison
 * as per HTTP specification (RFC 7230 Section 3.2).
 *
 * @param request - The HTTP request containing headers to process
 * @param options - Optional filtering rules for header selection
 * @returns Promise resolving to vary-based cache key component (format: "header1=hash1&header2=hash2")
 */
export async function vary(request: Request, options?: FilterOptions) {
  const entries = Array.from(request.headers.entries());
  return (
    await Promise.all(
      sort(filter(entries, toLowerCase(options))).map(
        async ([key, value]) => `${key}=${await shortHash(value)}`
      )
    )
  ).join('&');
}

/**
 * List of HTTP headers that should not be included in cache keys.
 *
 * These headers are excluded for the following reasons:
 * - High cardinality: Risk of cache fragmentation (Accept-*, User-Agent, Referer)
 * - Cache/proxy features: Would interfere with caching logic (Cache-Control, If-*)
 * - Covered by other features: Handled by dedicated cache key components (Cookie, Host)
 * - Implementation details: Not relevant for cache key generation (Content-Length, Connection)
 *
 * Based on best practices from CDN implementations and HTTP caching specifications.
 */
export const CANNOT_INCLUDE_HEADERS = [
  // Headers that have high cardinality and risk cache fragmentation
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-datetime',
  'accept-language',
  'referer',
  'user-agent',
  // Headers that implement cache or proxy features
  'connection',
  'content-length',
  'cache-control',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
  'range',
  'upgrade',
  // Headers that are covered by other cache key features
  'cookie',
  'host',
  'vary',
  // Headers that contain cache status information
  CACHE_STATUS_HEADERS_NAME,
] as const;

/**
 * Generates a cache key component based on request headers.
 *
 * This function creates cache key components from HTTP request headers,
 * useful for content negotiation and custom header-based caching.
 * Header values are hashed to keep cache keys compact while preventing
 * cache pollution from high-cardinality headers.
 *
 * Certain headers are automatically excluded to prevent cache fragmentation
 * and conflicts with other cache features.
 *
 * @param request - The HTTP request containing headers to process
 * @param options - Optional filtering rules for header selection
 * @returns Promise resolving to header-based cache key component
 * @throws {TypeError} When attempting to include a forbidden header
 */
export async function header(request: Request, options?: FilterOptions) {
  const entries = Array.from(request.headers.entries());
  return (
    await Promise.all(
      sort(filter(entries, toLowerCase(options))).map(async ([key, value]) => {
        if ((CANNOT_INCLUDE_HEADERS as readonly string[]).includes(key)) {
          throw new TypeError(
            `Cannot include header "${key}" in cache key. This header is excluded to prevent cache fragmentation or conflicts with other cache features.`
          );
        }
        return value ? `${key}=${await shortHash(value)}` : key;
      })
    )
  ).join('&');
}

/**
 * Registry of built-in URL-based cache key part definers.
 * These functions operate on URL components and don't require async operations.
 * @internal
 */
const BUILT_IN_URL_PART_DEFINERS: {
  [key: string]: (url: URL, options?: FilterOptions) => string;
} = {
  host,
  pathname,
  search,
};

/**
 * List of built-in URL part keys in processing order.
 * @internal
 */
const BUILT_IN_URL_PART_KEYS = ['host', 'pathname', 'search'];

/**
 * Registry of built-in expanded cache key part definers.
 * These functions require async operations and work with request data.
 * @internal
 */
const BUILT_IN_EXPANDED_PART_DEFINERS: BuiltInExpandedCacheKeyPartDefiners = {
  cookie,
  device,
  header,
};

/**
 * Default cache key generation rules.
 *
 * Includes the most common cache key components that work for most HTTP caching scenarios:
 * - host: Enables multi-tenant caching
 * - pathname: Differentiates resources
 * - search: Handles query parameters
 *
 * These defaults provide a good balance between cache effectiveness and key uniqueness.
 */
export const DEFAULT_CACHE_KEY_RULES: SharedCacheKeyRules = {
  host: true,
  pathname: true,
  search: true,
};

/**
 * Creates a cache key generator function with customizable rules and part definers.
 *
 * This factory function creates a highly configurable cache key generator that can
 * be tailored for specific application needs. The generated function follows a
 * consistent key format: `[cacheName/]host+pathname+search[#fragment1:fragment2:...]`
 *
 * Cache key structure:
 * - Base URL parts (host, pathname, search) are concatenated directly
 * - Fragment parts (cookie, device, header, custom) are hashed and joined with ":"
 * - Fragments are appended after "#" if any exist
 * - Cache name prefix is added if specified (except for "default")
 *
 * @param cacheName - Optional cache namespace (omitted if "default")
 * @param cacheKeyPartDefiners - Optional custom part definers for extending functionality
 * @returns A cache key generator function that accepts requests and rules
 *
 * @example
 * ```typescript
 * const generator = createCacheKeyGenerator('api-cache');
 * const key = await generator(request, { host: true, pathname: true, cookie: true });
 * // Result: "api-cache/example.com/api/users?limit=10#cookie=abc123"
 * ```
 */
export function createCacheKeyGenerator(
  cacheName?: string,
  cacheKeyPartDefiners?: SharedCacheKeyPartDefiners
) {
  return async function cacheKeyGenerator(
    request: Request,
    cacheKeyRules: SharedCacheKeyRules = DEFAULT_CACHE_KEY_RULES
  ): Promise<string> {
    // Separate URL parts from fragment parts for different processing
    const { host, pathname, search, ...fragmentRules } = cacheKeyRules;

    // Generate cache name prefix (empty for "default" cache)
    const prefix = cacheName
      ? cacheName === 'default'
        ? ''
        : `${cacheName}/`
      : '';

    const urlRules: SharedCacheKeyRules = { host, pathname, search };
    const url = new URL(request.url);

    // Process URL-based parts (synchronous, concatenated directly)
    const urlPart: string[] = BUILT_IN_URL_PART_KEYS.filter(
      (name) => urlRules[name]
    ).map((name) => {
      const urlPartDefiner = BUILT_IN_URL_PART_DEFINERS[name];
      const options = cacheKeyRules[name];

      if (options === true) {
        return urlPartDefiner(url);
      } else if (options === false) {
        return '';
      } else {
        return urlPartDefiner(url, options as FilterOptions);
      }
    });

    // Process fragment parts (asynchronous, hashed and joined with ":")
    const fragmentPart = (
      await Promise.all(
        Object.keys(fragmentRules)
          .sort() // Ensure consistent ordering
          .map((name) => {
            const expandedCacheKeyPartDefiners =
              BUILT_IN_EXPANDED_PART_DEFINERS[name] ??
              cacheKeyPartDefiners?.[name];

            if (expandedCacheKeyPartDefiners) {
              const options = cacheKeyRules[name];

              if (options === true) {
                return expandedCacheKeyPartDefiners(request);
              } else if (options === false) {
                return '';
              } else {
                return expandedCacheKeyPartDefiners(
                  request,
                  options as FilterOptions
                );
              }
            }

            throw new TypeError(
              `Unknown cache key part: "${name}". Register a custom part definer or use a built-in part (${Object.keys(BUILT_IN_EXPANDED_PART_DEFINERS).join(', ')}).`
            );
          })
      )
    ).filter(Boolean); // Remove empty parts

    // Combine URL parts and fragment parts into final cache key
    return fragmentPart.length
      ? `${prefix}${urlPart.join('')}#${fragmentPart.join(':')}`
      : `${prefix}${urlPart.join('')}`;
  };
}
