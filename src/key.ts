import { sha1 } from './utils/crypto';
import { deviceType as getDeviceType } from './utils/user-agent';
import { CACHE_KEY_HEADER_NAME, CACHE_STATUS_HEADER_NAME } from './constants';
import { RequestCookies } from './utils/cookies';
import type {
  CacheKeyGenerator,
  KeyFilterOptions,
  KVStorage,
  CacheKeyRules,
} from './types';

/** Separator between named cache key fragments. */
const CACHE_KEY_FRAGMENT_SEPARATOR = '|';

/** Separator between fragment key names and the combined value digest. */
const CACHE_KEY_VALUE_DIGEST_SEPARATOR = '@';

/** Separator between key names within a fragment. */
const CACHE_KEY_INTRA_FRAGMENT_SEPARATOR = '&';

/** Separator between a base cache key and its Vary-derived suffix. */
const CACHE_KEY_VARY_SEPARATOR = '|v|';

/** Suffix used to store Vary filter metadata for a base cache key. */
const CACHE_KEY_VARY_META_SUFFIX = '|vary|';

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

type RuleValue = KeyFilterOptions | boolean | undefined;

/**  Built-in URL part keys in processing order. */
const URL_PART_KEYS = ['scheme', 'host', 'pathname', 'search'] as const;

/**  Built-in request part keys in processing order. */
const REQUEST_PART_KEYS = ['cookie', 'device', 'header'] as const;
const CACHE_KEY_RULE_KEYS = new Set<string>([
  ...URL_PART_KEYS,
  ...REQUEST_PART_KEYS,
]);

type URLPartKey = (typeof URL_PART_KEYS)[number];
type RequestPartKey = (typeof REQUEST_PART_KEYS)[number];
type KeyValueSource = 'cookie' | 'header';
interface CompiledFilter {
  includeOnly: boolean;
  exclude?: ReadonlySet<string>;
  include?: ReadonlySet<string>;
  /** Sorted include keys for whitelist fast paths. */
  includeList?: readonly string[];
  checkPresence?: ReadonlySet<string>;
}
interface CompiledRule {
  filter?: CompiledFilter;
}
interface CollectedKeyValues {
  keys: string;
  canonicalValues: string;
  displayValues: string;
}
interface FragmentContribution {
  keys: string;
  canonical: string;
}
interface CompiledFragment {
  name: RequestPartKey;
  filter?: CompiledFilter;
}
interface CompiledCacheKeyPlan {
  url: Partial<Record<URLPartKey, CompiledRule>>;
  fragments: CompiledFragment[];
  /** True when the plan only needs synchronous URL assembly. */
  syncOnly: boolean;
}

/**  Per-request cache key context that lazily parses headers and cookies once. */
interface CacheKeyRequestContext {
  getHeaderEntries(): [string, string][];
  getCookieEntries(): [string, string][];
}
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
const FORBIDDEN_HEADERS = new Set<string>(CANNOT_INCLUDE_HEADERS);

/**
 * Returns a per-request cache key context for reusing parsed headers and cookies.
 */
function getCacheKeyContext(request: Request): CacheKeyRequestContext {
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
 * Sorts an array of key-value pairs by key name (case-sensitive).
 */
function sortEntries(array: [key: string, value: string][]) {
  return array.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Compiles filter options into reusable lookup structures.
 */
function compileFilterOptions(
  options?: KeyFilterOptions,
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
function isEnabled(rule: RuleValue): rule is true | KeyFilterOptions {
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
const URL_PART_RENDERERS: Record<
  URLPartKey,
  (url: URL, rule: CompiledRule) => string
> = {
  scheme: (url, rule) => scalarPart(`${url.protocol}//`, rule.filter),
  host: (url, rule) => scalarPart(url.host, rule.filter),
  pathname: (url, rule) => scalarPart(url.pathname, rule.filter),
  search: (url, rule) => renderSearchPart(url, rule),
};
function renderSearchPart(url: URL, rule: CompiledRule): string {
  const searchParams = new URLSearchParams(url.search);
  const filter = rule.filter;
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
 * Collects key/value material for hashing, optionally prefixed for fragments.
 */
function collectKeyValueMaterial(
  request: Request,
  source: KeyValueSource,
  compiled: CompiledFilter | undefined,
  {
    prefix,
    forbiddenHeaders = false,
  }: { prefix?: string; forbiddenHeaders?: boolean } = {}
): FragmentContribution | undefined {
  const collected = prepareKeyValueEntries(
    readKeyValueEntries(request, source, compiled),
    compiled,
    {
      prefiltered: compiled?.includeOnly,
      forbiddenKeys: forbiddenHeaders ? FORBIDDEN_HEADERS : undefined,
    }
  );

  if (!collected) {
    return undefined;
  }

  const keys = prefix ? `${prefix}:${collected.keys}` : collected.keys;
  const canonical = prefix
    ? `${prefix}:${collected.canonicalValues}`
    : collected.canonicalValues;

  return { keys, canonical };
}

async function formatHashedKeyValues(
  request: Request,
  compiled: CompiledFilter | undefined,
  source: KeyValueSource,
  forbidden = false
): Promise<string> {
  const material = collectKeyValueMaterial(request, source, compiled, {
    forbiddenHeaders: forbidden,
  });

  if (!material) {
    return '';
  }

  return formatHashedSegment(material.keys, material.canonical);
}

/**
 * Applies KeyFilterOptions to a single scalar cache key component.
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
function validateCacheKeyRules(rules: CacheKeyRules) {
  for (const key of Object.keys(rules)) {
    if (!CACHE_KEY_RULE_KEYS.has(key)) {
      throw new TypeError(
        `Unknown cache key part: "${key}". Use built-in parts (${[...CACHE_KEY_RULE_KEYS].join(', ')}).`
      );
    }
  }
}
function compileCacheKeyPlan(rules: CacheKeyRules): CompiledCacheKeyPlan {
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
 * Default cache key generation rules.
 */
export const DEFAULT_CACHE_KEY_RULES: CacheKeyRules = {
  scheme: true,
  host: true,
  pathname: true,
  search: true,
};

/**
 * Builds the URL portion of a cache key from enabled URL rules.
 */
function buildUrlSegment(url: URL, urlRules: CompiledCacheKeyPlan['url']) {
  const segments: string[] = [];

  for (const name of URL_PART_KEYS) {
    const rule = urlRules[name];
    if (rule) {
      segments.push(URL_PART_RENDERERS[name](url, rule));
    }
  }

  return segments.join('');
}

function hashVaryKeyPart(request: Request, options?: KeyFilterOptions) {
  return formatHashedKeyValues(
    request,
    compileFilterOptions(options, true),
    'header'
  );
}

/**
 * Collects a scalar fragment contribution.
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

  return collectKeyValueMaterial(request, fragment.name, fragment.filter, {
    prefix: fragment.name,
    forbiddenHeaders: fragment.name === 'header',
  });
}

/**
 * Builds the fragment suffix with visible key names and one combined digest.
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
 */
function buildCacheKeySync(
  request: Request,
  cacheKeyRules: CacheKeyRules,
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
 */
async function buildCacheKey(
  request: Request,
  cacheKeyRules: CacheKeyRules,
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
    cacheKeyRules: CacheKeyRules = DEFAULT_CACHE_KEY_RULES
  ): Promise<string> {
    return buildCacheKey(request, cacheKeyRules, resolvedNormalize);
  };

  cacheKeyGenerator.sync = function cacheKeyGeneratorSync(
    request: Request,
    cacheKeyRules: CacheKeyRules = DEFAULT_CACHE_KEY_RULES
  ) {
    return buildCacheKeySync(request, cacheKeyRules, resolvedNormalize);
  };

  return cacheKeyGenerator;
}

/** Parses a comma-separated Vary header into filter options. */
export function parseVaryHeader(vary: string): KeyFilterOptions {
  return {
    include: vary
      .split(',')
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean),
  };
}

/** Appends a Vary-derived suffix to a base cache key. */
export async function appendVaryKeySuffix(
  request: Request,
  baseKey: string,
  varyFilter?: KeyFilterOptions
): Promise<string> {
  if (!varyFilter?.include?.length) {
    return baseKey;
  }

  getCacheKeyContext(request);
  const part = await hashVaryKeyPart(request, varyFilter);
  return part ? `${baseKey}${CACHE_KEY_VARY_SEPARATOR}${part}` : baseKey;
}

export async function readStoredVaryFilter(
  storage: KVStorage,
  baseKey: string
): Promise<KeyFilterOptions | undefined> {
  return (await storage.get(`${baseKey}${CACHE_KEY_VARY_META_SUFFIX}`)) as
    | KeyFilterOptions
    | undefined;
}

export async function writeStoredVaryFilter(
  storage: KVStorage,
  baseKey: string,
  ttl: number,
  varyHeader: string | null
): Promise<KeyFilterOptions | undefined> {
  if (!varyHeader || varyHeader === '*') {
    return undefined;
  }

  const filter = parseVaryHeader(varyHeader);
  await storage.set(`${baseKey}${CACHE_KEY_VARY_META_SUFFIX}`, filter, ttl);
  return filter;
}
