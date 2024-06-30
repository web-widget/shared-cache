import { sha1 } from '@web-widget/helpers/crypto';
import {
  deviceType as getDeviceType,
  RequestCookies,
} from '@web-widget/helpers/headers';
import { CACHE_STATUS_HEADERS_NAME } from './constants';

export interface FilterOptions {
  include?: string[];
  exclude?: string[];
  checkPresence?: string[];
}

export interface SharedCacheKeyRules {
  /** Use cookie as part of cache key. */
  cookie?: FilterOptions | boolean;
  /** Use device type as part of cache key. */
  device?: FilterOptions | boolean;
  /** Use header as part of cache key. */
  header?: FilterOptions | boolean;
  /** Use host as part of cache key. */
  host?: FilterOptions | boolean;
  /** Use method as part of cache key. */
  method?: FilterOptions | boolean;
  /** Use pathname as part of cache key. */
  pathname?: FilterOptions | boolean;
  /** Use search as part of cache key. */
  search?: FilterOptions | boolean;
  /** Use custom part of cache key. */
  [customPart: string]: unknown | boolean | undefined;
}

export interface SharedCacheKeyPartDefiners {
  [customPart: string]: (
    request: Request,
    options?: unknown
  ) => Promise<string> | undefined;
}

type BuiltInExpandedPartDefiner = (
  request: Request,
  options?: FilterOptions
) => Promise<string>;

interface BuiltInExpandedCacheKeyPartDefiners {
  [part: string]: BuiltInExpandedPartDefiner | undefined;
}

export function filter(
  array: [key: string, value: string][],
  options?: FilterOptions
) {
  let result = array;
  const exclude = options?.exclude;
  const include = options?.include;
  const checkPresence = options?.checkPresence;

  if (exclude?.length) {
    result = result.filter(([key]) => !exclude.includes(key));
  }

  if (include?.length) {
    result = result.filter(([key]) => include.includes(key));
  }

  if (checkPresence?.length) {
    result = result.map((item) =>
      checkPresence.includes(item[0]) ? [item[0], ''] : item
    );
  }

  return result;
}

async function shortHash(data: Parameters<typeof sha1>[0]) {
  return (await sha1(data))?.slice(0, 6);
}

function sort(array: [key: string, value: string][]) {
  return array.sort((a, b) => a[0].localeCompare(b[0]));
}

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

export async function device(request: Request, options?: FilterOptions) {
  const device = getDeviceType(request.headers);
  return filter([[device, '']], options)
    .map(([key]) => key)
    .join('');
}

export function host(url: URL, options?: FilterOptions) {
  const host = url.host;
  return filter([[host, '']], options)
    .map(([key]) => key)
    .join('');
}

export async function method(request: Request, options?: FilterOptions) {
  const hasBody =
    request.body && ['POST', 'PATCH', 'PUT'].includes(request.method);
  return (
    await Promise.all(
      filter([[request.method, '']], options).map(async ([key]) =>
        hasBody ? `${key}=${await shortHash(request.body)}` : key
      )
    )
  ).join('');
}

export function pathname(url: URL, options?: FilterOptions) {
  const pathname = url.pathname;
  return filter([[pathname, '']], options)
    .map(([key]) => key)
    .join('');
}

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

export const CANNOT_INCLUDE_HEADERS = [
  // Headers that have high cardinality and risk sharding the cache
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-datetime',
  'accept-language',
  'referer',
  'user-agent',
  // Headers that re-implement cache or proxy features
  'connection',
  'content-length',
  'cache-control',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
  'range',
  'upgrade',
  // Headers that are covered by other cache Key features
  'cookie',
  'host',
  'vary',
  // Headers that cache status
  CACHE_STATUS_HEADERS_NAME,
];

export async function header(request: Request, options?: FilterOptions) {
  const entries = Array.from(request.headers.entries());
  return (
    await Promise.all(
      sort(filter(entries, toLowerCase(options))).map(async ([key, value]) => {
        if (CANNOT_INCLUDE_HEADERS.includes(key)) {
          throw new TypeError(`Cannot include header: ${key}`);
        }
        return value ? `${key}=${await shortHash(value)}` : key;
      })
    )
  ).join('&');
}

const BUILT_IN_URL_PART_DEFINERS: {
  [key: string]: (url: URL, options?: FilterOptions) => string;
} = {
  host,
  pathname,
  search,
};
const BUILT_IN_URL_PART_KEYS = ['host', 'pathname', 'search'];

const BUILT_IN_EXPANDED_PART_DEFINERS: BuiltInExpandedCacheKeyPartDefiners = {
  cookie,
  device,
  header,
  method,
};

export const DEFAULT_CACHE_KEY_RULES: SharedCacheKeyRules = {
  host: true,
  method: true,
  pathname: true,
  search: true,
};

export function createCacheKeyGenerator(
  cacheName?: string,
  cacheKeyPartDefiners?: SharedCacheKeyPartDefiners
) {
  return async function cacheKeyGenerator(
    request: Request,
    options: {
      cacheKeyRules?: SharedCacheKeyRules;
    } & CacheQueryOptions = {}
  ): Promise<string> {
    notImplemented(options, 'ignoreVary');
    notImplemented(options, 'ignoreSearch');

    const { cacheKeyRules = DEFAULT_CACHE_KEY_RULES } = options;
    const { host, pathname, search, ...fragmentRules } = cacheKeyRules;
    const prefix = cacheName
      ? cacheName === 'default'
        ? ''
        : `${cacheName}/`
      : '';
    const urlRules: SharedCacheKeyRules = { host, pathname, search };
    const url = new URL(request.url);

    if (options.ignoreMethod) {
      fragmentRules.method = false;
    }

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

    const fragmentPart = (
      await Promise.all(
        Object.keys(fragmentRules)
          .sort()
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

            throw TypeError(`Unknown custom part: "${name}".`);
          })
      )
    ).filter(Boolean);

    return fragmentPart.length
      ? `${prefix}${urlPart.join('')}#${fragmentPart.join(':')}`
      : `${prefix}${urlPart.join('')}`;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notImplemented(options: any, name: string) {
  if (name in options) {
    throw new Error(`Not Implemented: "${name}" option.`);
  }
}
