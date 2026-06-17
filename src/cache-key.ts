import { sha1 } from './utils/crypto';
import { deviceType as getDeviceType } from './utils/user-agent';
import { CACHE_KEY_HEADER_NAME, CACHE_STATUS_HEADER_NAME } from './constants';
import { RequestCookies } from './utils/cookies';

/** Separator between named cache key fragments. */
const CACHE_KEY_FRAGMENT_SEPARATOR = '|';

/** Separator between fragment key names and the combined value digest. */
const CACHE_KEY_VALUE_DIGEST_SEPARATOR = '@';

/** Separator between key names within a fragment. */
const CACHE_KEY_INTRA_FRAGMENT_SEPARATOR = '&';

/** Separator between a base cache key and its Vary-derived suffix. @internal */
export const CACHE_KEY_VARY_SEPARATOR = '|v|';

/** Suffix used to store Vary filter metadata for a base cache key. @internal */
export const CACHE_KEY_VARY_META_SUFFIX = '|vary|';

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
 * Optional cache-key normalization beyond what the URL API already applies when
 * parsing `request.url` (scheme/host case, default ports, etc.).
 * @internal
 */
interface CacheKeyNormalizeOptions {
  /** Remove trailing slashes from pathname (except the root path `/`) */
  trailingSlash?: boolean;
  /** Lowercase pathname segments */
  pathnameLowerCase?: boolean;
  /** Remove whitespace from pathname and search parameter values */
  ignoreSpaces?: boolean;
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
  /** Use URL scheme as part of cache key (`http://`, `https://`) per RFC 9111 */
  scheme?: FilterOptions | boolean;
  /** Use request host as part of cache key for multi-tenant applications */
  host?: FilterOptions | boolean;
  /** Use URL pathname as part of cache key for resource identification */
  pathname?: FilterOptions | boolean;
  /** Use URL search parameters as part of cache key for dynamic content */
  search?: FilterOptions | boolean;
}

type RuleValue = FilterOptions | boolean | undefined;

/** Built-in URL part keys in processing order. @internal */
const URL_PART_KEYS = ['scheme', 'host', 'pathname', 'search'] as const;

/** Built-in request part keys in processing order. @internal */
const REQUEST_PART_KEYS = ['cookie', 'device', 'header'] as const;

/** @internal */
const CACHE_KEY_RULE_KEYS = new Set<string>([
  ...URL_PART_KEYS,
  ...REQUEST_PART_KEYS,
]);

type URLPartKey = (typeof URL_PART_KEYS)[number];
type RequestPartKey = (typeof REQUEST_PART_KEYS)[number];
type KeyValueSource = 'cookie' | 'header';

/** @internal */
interface CompiledFilter {
  includeOnly: boolean;
  exclude?: ReadonlySet<string>;
  include?: ReadonlySet<string>;
  /** Sorted include keys for whitelist fast paths. */
  includeList?: readonly string[];
  checkPresence?: ReadonlySet<string>;
}

/** @internal */
interface CompiledRule {
  filter?: CompiledFilter;
}

/** @internal */
interface CollectedKeyValues {
  keys: string;
  canonicalValues: string;
  displayValues: string;
}

/** @internal */
interface FragmentContribution {
  keys: string;
  canonical: string;
}

/** @internal */
interface CompiledFragment {
  name: RequestPartKey;
  filter?: CompiledFilter;
}

/** @internal */
interface CompiledCacheKeyPlan {
  url: Partial<Record<URLPartKey, CompiledRule>>;
  fragments: CompiledFragment[];
  /** True when the plan only needs synchronous URL assembly. */
  syncOnly: boolean;
}

/** Per-request cache key context that lazily parses headers and cookies once. @internal */
interface CacheKeyRequestContext {
  getHeaderEntries(): [string, string][];
  getCookieEntries(): [string, string][];
}

/** Cache key generator with an optional synchronous fast path for URL-only rules. */
export interface CacheKeyGenerator {
  (request: Request, cacheKeyRules?: SharedCacheKeyRules): Promise<string>;
  /**
   * Builds a cache key synchronously when rules only include URL parts.
   * Returns `undefined` when fragments or hashing are required.
   */
  sync: (
    request: Request,
    cacheKeyRules?: SharedCacheKeyRules
  ) => string | undefined;
}

/** @internal */
const cacheKeyContexts = new WeakMap<Request, CacheKeyRequestContext>();

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
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-datetime',
  'accept-language',
  'referer',
  'user-agent',
  'connection',
  'content-length',
  'cache-control',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
  'range',
  'upgrade',
  'cookie',
  'host',
  'vary',
  CACHE_STATUS_HEADER_NAME,
  CACHE_KEY_HEADER_NAME,
] as const;

/** @internal */
const FORBIDDEN_HEADERS = new Set<string>(CANNOT_INCLUDE_HEADERS);

/**
 * Returns a per-request cache key context for reusing parsed headers and cookies.
 * @internal
 */
export function getCacheKeyContext(request: Request): CacheKeyRequestContext {
  let context = cacheKeyContexts.get(request);

  if (!context) {
    let headerEntries: [string, string][] | undefined;
    let cookieEntries: [string, string][] | undefined;

    context = {
      getHeaderEntries() {
        if (!headerEntries) {
          headerEntries = Array.from(request.headers.entries()).map(
            ([key, value]) => [key.toLowerCase(), value] as [string, string]
          );
        }

        return headerEntries;
      },
      getCookieEntries() {
        if (!cookieEntries) {
          cookieEntries = new RequestCookies(request.headers)
            .getAll()
            .map(({ name, value }) => [name, value]);
        }

        return cookieEntries;
      },
    };

    cacheKeyContexts.set(request, context);
  }

  return context;
}

/**
 * Filters an array of key-value pairs based on include/exclude rules.
 *
 * @param array - Array of [key, value] tuples to filter
 * @param options - Filtering options
 * @returns Filtered array of [key, value] tuples
 */
export function filter(
  array: [key: string, value: string][],
  options?: FilterOptions
) {
  return applyCompiledFilter(array, compileFilterOptions(options));
}

/**
 * Sorts an array of key-value pairs by key name (case-sensitive).
 * @internal
 */
function sortEntries(array: [key: string, value: string][]) {
  return array.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Compiles filter options into reusable lookup structures.
 * @internal
 */
function compileFilterOptions(
  options?: FilterOptions,
  lowercaseKeys = false
): CompiledFilter | undefined {
  if (!options) {
    return undefined;
  }

  const normalize = (values?: string[]) =>
    values?.map((name) => (lowercaseKeys ? name.toLowerCase() : name));

  const include = normalize(options.include);
  const exclude = normalize(options.exclude);
  const checkPresence = normalize(options.checkPresence);
  const includeOnly = Boolean(
    include?.length && !exclude?.length && !checkPresence?.length
  );

  return {
    includeOnly,
    exclude: exclude ? new Set(exclude) : undefined,
    include: include ? new Set(include) : undefined,
    includeList: includeOnly
      ? [...include!].sort((a, b) => a.localeCompare(b))
      : undefined,
    checkPresence: checkPresence ? new Set(checkPresence) : undefined,
  };
}

/** @internal */
function compileRule(rule: RuleValue): CompiledRule | undefined {
  if (!isEnabled(rule)) {
    return undefined;
  }

  return {
    filter: rule === true ? undefined : compileFilterOptions(rule),
  };
}

/**
 * Applies compiled filter options to key/value entries.
 * @internal
 */
function applyCompiledFilter(
  entries: [string, string][],
  compiled?: CompiledFilter,
  { prefiltered = false }: { prefiltered?: boolean } = {}
) {
  if (prefiltered || compiled?.includeOnly) {
    return entries;
  }

  let result = entries;

  if (compiled?.exclude?.size) {
    result = result.filter(([key]) => !compiled.exclude!.has(key));
  }

  if (compiled?.include?.size) {
    result = result.filter(([key]) => compiled.include!.has(key));
  }

  if (compiled?.checkPresence?.size) {
    result = result.map((item) =>
      compiled.checkPresence!.has(item[0]) ? [item[0], ''] : item
    );
  }

  return sortEntries(result);
}

/**
 * Resolves normalize options for cache key generation.
 * @internal
 */
function resolveNormalizeOptions(
  normalize?: boolean | CacheKeyNormalizeOptions
): CacheKeyNormalizeOptions {
  if (normalize === false) {
    return {};
  }

  if (typeof normalize === 'object') {
    return { ...normalize };
  }

  return {};
}

/**
 * Applies optional normalization on top of the URL returned by `new URL()`.
 * @internal
 */
function normalizeUrl(url: URL, options: CacheKeyNormalizeOptions = {}): URL {
  if (
    !options.trailingSlash &&
    !options.pathnameLowerCase &&
    !options.ignoreSpaces
  ) {
    return url;
  }

  const normalized = new URL(url);
  let pathname = normalized.pathname;

  if (options.pathnameLowerCase) {
    pathname = pathname.toLowerCase();
  }

  if (options.trailingSlash && pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '') || '/';
  }

  if (options.ignoreSpaces) {
    pathname = pathname.replace(/%20/gi, '').replace(/\s+/g, '');
  }

  normalized.pathname = pathname;

  if (options.ignoreSpaces && normalized.search) {
    const params = new URLSearchParams(normalized.search);
    const canonical = new URLSearchParams();

    for (const [key, value] of params.entries()) {
      canonical.append(key, value.replace(/\s+/g, ''));
    }

    canonical.sort();
    normalized.search = canonical.toString();
  }

  return normalized;
}

/** @internal */
function isEnabled(rule: RuleValue): rule is true | FilterOptions {
  return rule !== false && rule !== undefined;
}

async function formatHashedSegment(
  keys: string,
  canonicalValues: string
): Promise<string> {
  return `${keys}${CACHE_KEY_VALUE_DIGEST_SEPARATOR}${await sha1(canonicalValues)}`;
}

/**
 * Reads whitelisted cookie or header entries without scanning all values.
 * @internal
 */
function readIncludedKeyValueEntries(
  request: Request,
  source: KeyValueSource,
  includeList: readonly string[]
): [string, string][] {
  const entries: [string, string][] = [];

  if (source === 'cookie') {
    const cookies = new RequestCookies(request.headers);

    for (const name of includeList) {
      const cookie = cookies.get(name);

      if (cookie) {
        entries.push([name, cookie.value]);
      }
    }

    return entries;
  }

  for (const name of includeList) {
    const value = request.headers.get(name);

    if (value !== null) {
      entries.push([name, value]);
    }
  }

  return entries;
}

/**
 * Reads cookie or header entries for cache key generation.
 * @internal
 */
function readKeyValueEntries(
  request: Request,
  source: KeyValueSource,
  compiled?: CompiledFilter,
  context = getCacheKeyContext(request)
): [string, string][] {
  if (compiled?.includeOnly && compiled.includeList) {
    return readIncludedKeyValueEntries(request, source, compiled.includeList);
  }

  if (source === 'cookie') {
    return context.getCookieEntries();
  }

  return context.getHeaderEntries();
}

/**
 * Collects sorted key names and canonical/display value pairs from filtered entries.
 * @internal
 */
function prepareKeyValueEntries(
  entries: [string, string][],
  compiled?: CompiledFilter,
  {
    prefiltered = false,
    forbiddenKeys,
  }: {
    prefiltered?: boolean;
    forbiddenKeys?: ReadonlySet<string>;
  } = {}
): CollectedKeyValues | undefined {
  const filtered = applyCompiledFilter(entries, compiled, { prefiltered });

  if (!filtered.length) {
    return undefined;
  }

  const keyParts: string[] = [];
  const canonicalParts: string[] = [];
  const displayParts: string[] = [];

  for (const [key, value] of filtered) {
    if (forbiddenKeys?.has(key)) {
      throw new TypeError(
        `Cannot include header "${key}" in cache key. This header is excluded to prevent cache fragmentation or conflicts with other cache features.`
      );
    }

    keyParts.push(key);
    canonicalParts.push(`${key}=${value}`);
    displayParts.push(value ? `${key}=${value}` : key);
  }

  const separator = CACHE_KEY_INTRA_FRAGMENT_SEPARATOR;

  return {
    keys: keyParts.join(separator),
    canonicalValues: canonicalParts.join(separator),
    displayValues: displayParts.join(separator),
  };
}

/**
 * Formats request key/value pairs as a hashed `keys@digest` segment.
 * @internal
 */
async function formatHashedKeyValues(
  request: Request,
  compiled: CompiledFilter | undefined,
  source: KeyValueSource,
  forbidden = false
): Promise<string> {
  const collected = prepareKeyValueEntries(
    readKeyValueEntries(request, source, compiled),
    compiled,
    {
      prefiltered: compiled?.includeOnly,
      forbiddenKeys: forbidden ? FORBIDDEN_HEADERS : undefined,
    }
  );

  if (!collected) {
    return '';
  }

  return formatHashedSegment(collected.keys, collected.canonicalValues);
}

/**
 * Applies FilterOptions to a single scalar cache key component.
 * @internal
 */
function scalarPart(value: string, compiled?: CompiledFilter) {
  if (!compiled) {
    return value;
  }

  if (compiled.includeOnly && compiled.include) {
    return compiled.include.has(value) ? value : '';
  }

  return applyCompiledFilter([[value, '']], compiled)[0]?.[0] ?? '';
}

/** @internal */
function validateCacheKeyRules(rules: SharedCacheKeyRules) {
  for (const key of Object.keys(rules)) {
    if (!CACHE_KEY_RULE_KEYS.has(key)) {
      throw new TypeError(
        `Unknown cache key part: "${key}". Use built-in parts (${[...CACHE_KEY_RULE_KEYS].join(', ')}).`
      );
    }
  }
}

/** @internal */
function compileCacheKeyPlan(rules: SharedCacheKeyRules): CompiledCacheKeyPlan {
  validateCacheKeyRules(rules);

  const { scheme, host, pathname, search, cookie, device, header } = rules;
  const fragments: CompiledFragment[] = [];

  for (const name of REQUEST_PART_KEYS) {
    const rule = { cookie, device, header }[name];

    if (!isEnabled(rule)) {
      continue;
    }

    fragments.push({
      name,
      filter:
        name === 'header'
          ? compileFilterOptions(rule === true ? undefined : rule, true)
          : compileFilterOptions(rule === true ? undefined : rule),
    });
  }

  return {
    url: {
      scheme: compileRule(scheme),
      host: compileRule(host),
      pathname: compileRule(pathname),
      search: compileRule(search),
    },
    fragments,
    syncOnly: fragments.length === 0,
  };
}

/**
 * Generates a cache key component based on the URL scheme.
 * @internal
 */
export function scheme(url: URL, compiled?: CompiledRule) {
  return scalarPart(`${url.protocol}//`, compiled?.filter);
}

/**
 * Generates a cache key component based on the request host.
 * @internal
 */
export function host(url: URL, compiled?: CompiledRule) {
  return scalarPart(url.host, compiled?.filter);
}

/**
 * Generates a cache key component based on the URL pathname.
 * @internal
 */
export function pathname(url: URL, compiled?: CompiledRule) {
  return scalarPart(url.pathname, compiled?.filter);
}

/**
 * Generates a cache key component based on URL search parameters.
 * @internal
 */
export function search(url: URL, compiled?: CompiledRule) {
  const searchParams = new URLSearchParams(url.search);
  const filter = compiled?.filter;
  let entries: [string, string][];

  if (filter?.includeOnly && filter.includeList) {
    entries = [];

    for (const key of filter.includeList) {
      const value = searchParams.get(key);

      if (value !== null) {
        entries.push([key, value]);
      }
    }
  } else {
    searchParams.sort();
    entries = Array.from(searchParams.entries());
  }

  const collected = prepareKeyValueEntries(entries, filter, {
    prefiltered: filter?.includeOnly,
  });

  return collected ? `?${collected.displayValues}` : '';
}

/**
 * Generates a cache key component based on request cookies.
 * @internal
 */
export function cookie(request: Request, options?: FilterOptions) {
  return formatHashedKeyValues(
    request,
    compileFilterOptions(options),
    'cookie'
  );
}

/**
 * Generates a cache key component based on device type detection.
 * @internal
 */
export function device(request: Request, options?: FilterOptions) {
  return scalarPart(
    getDeviceType(request.headers),
    compileFilterOptions(options)
  );
}

/**
 * Generates a cache key component based on request headers.
 * @internal
 */
export function header(request: Request, options?: FilterOptions) {
  return formatHashedKeyValues(
    request,
    compileFilterOptions(options, true),
    'header',
    true
  );
}

/**
 * Generates a cache key component based on HTTP Vary header processing.
 * @internal
 */
export function vary(request: Request, options?: FilterOptions) {
  return formatHashedKeyValues(
    request,
    compileFilterOptions(options, true),
    'header'
  );
}

/**
 * Default cache key generation rules.
 */
export const DEFAULT_CACHE_KEY_RULES: SharedCacheKeyRules = {
  scheme: true,
  host: true,
  pathname: true,
  search: true,
};

/**
 * Builds the URL portion of a cache key from enabled URL rules.
 * @internal
 */
function buildUrlSegment(url: URL, urlRules: CompiledCacheKeyPlan['url']) {
  const segments: string[] = [];

  for (const name of URL_PART_KEYS) {
    const rule = urlRules[name];
    if (!rule) {
      continue;
    }

    switch (name) {
      case 'scheme':
        segments.push(scheme(url, rule));
        break;
      case 'host':
        segments.push(host(url, rule));
        break;
      case 'pathname':
        segments.push(pathname(url, rule));
        break;
      case 'search':
        segments.push(search(url, rule));
        break;
    }
  }

  return segments.join('');
}

/**
 * Collects a named key/value fragment contribution.
 * @internal
 */
function collectNamedKeyValuesFragment(
  name: KeyValueSource,
  request: Request,
  compiled?: CompiledFilter
): FragmentContribution | undefined {
  const collected = prepareKeyValueEntries(
    readKeyValueEntries(request, name, compiled),
    compiled,
    {
      prefiltered: compiled?.includeOnly,
      forbiddenKeys: name === 'header' ? FORBIDDEN_HEADERS : undefined,
    }
  );

  if (!collected) {
    return undefined;
  }

  return {
    keys: `${name}:${collected.keys}`,
    canonical: `${name}:${collected.canonicalValues}`,
  };
}

/**
 * Collects a scalar fragment contribution.
 * @internal
 */
function collectScalarFragment(
  name: string,
  value: string,
  compiled?: CompiledFilter
): FragmentContribution | undefined {
  if (!scalarPart(value, compiled)) {
    return undefined;
  }

  return {
    keys: name,
    canonical: `${name}:${value}`,
  };
}

/**
 * Builds a named fragment segment for request-based cache key parts.
 * @internal
 */
function buildFragmentContribution(
  fragment: CompiledFragment,
  request: Request
): FragmentContribution | undefined {
  if (fragment.name === 'device') {
    return collectScalarFragment(
      fragment.name,
      getDeviceType(request.headers),
      fragment.filter
    );
  }

  return collectNamedKeyValuesFragment(fragment.name, request, fragment.filter);
}

/**
 * Builds the fragment suffix with visible key names and one combined digest.
 * @internal
 */
async function buildFragmentSuffix(
  contributions: FragmentContribution[]
): Promise<string> {
  const keys = contributions
    .map((part) => part.keys)
    .join(CACHE_KEY_FRAGMENT_SEPARATOR);
  const canonical = contributions
    .map((part) => part.canonical)
    .join(CACHE_KEY_FRAGMENT_SEPARATOR);

  return `${keys}${CACHE_KEY_VALUE_DIGEST_SEPARATOR}${await sha1(canonical)}`;
}

/**
 * Builds a cache key synchronously when only URL parts are enabled.
 * @internal
 */
function buildCacheKeySync(
  request: Request,
  cacheKeyRules: SharedCacheKeyRules,
  resolvedNormalize: CacheKeyNormalizeOptions
): string | undefined {
  const plan = compileCacheKeyPlan(cacheKeyRules);

  if (!plan.syncOnly) {
    return undefined;
  }

  const url = normalizeUrl(new URL(request.url), resolvedNormalize);
  return buildUrlSegment(url, plan.url);
}

/**
 * Builds a cache key, using the synchronous fast path when possible.
 * @internal
 */
async function buildCacheKey(
  request: Request,
  cacheKeyRules: SharedCacheKeyRules,
  resolvedNormalize: CacheKeyNormalizeOptions
): Promise<string> {
  const plan = compileCacheKeyPlan(cacheKeyRules);
  const url = normalizeUrl(new URL(request.url), resolvedNormalize);
  const baseKey = buildUrlSegment(url, plan.url);

  if (plan.syncOnly) {
    return baseKey;
  }

  getCacheKeyContext(request);

  const contributions: FragmentContribution[] = [];

  for (const fragment of plan.fragments) {
    const contribution = buildFragmentContribution(fragment, request);

    if (contribution) {
      contributions.push(contribution);
    }
  }

  return contributions.length
    ? `${baseKey}#${await buildFragmentSuffix(contributions)}`
    : baseKey;
}

/**
 * Creates a cache key generator function with customizable rules.
 */
export function createCacheKeyGenerator(
  cacheKeyNormalize?: boolean | CacheKeyNormalizeOptions
): CacheKeyGenerator {
  const resolvedNormalize = resolveNormalizeOptions(cacheKeyNormalize);

  const cacheKeyGenerator = async function cacheKeyGenerator(
    request: Request,
    cacheKeyRules: SharedCacheKeyRules = DEFAULT_CACHE_KEY_RULES
  ): Promise<string> {
    return buildCacheKey(request, cacheKeyRules, resolvedNormalize);
  };

  cacheKeyGenerator.sync = function cacheKeyGeneratorSync(
    request: Request,
    cacheKeyRules: SharedCacheKeyRules = DEFAULT_CACHE_KEY_RULES
  ) {
    return buildCacheKeySync(request, cacheKeyRules, resolvedNormalize);
  };

  return cacheKeyGenerator;
}
