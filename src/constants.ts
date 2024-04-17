import { CacheStatus } from './types';

export const CACHE_STATUS_HEADERS_NAME = 'x-cache-status';
export const HIT: CacheStatus = 'HIT';
export const MISS: CacheStatus = 'MISS';
export const EXPIRED: CacheStatus = 'EXPIRED';
export const STALE: CacheStatus = 'STALE';
export const BYPASS: CacheStatus = 'BYPASS';
export const REVALIDATED: CacheStatus = 'REVALIDATED';
export const DYNAMIC: CacheStatus = 'DYNAMIC';
