import { SharedCacheStatus } from './types';

export const CACHE_STATUS_HEADERS_NAME = 'x-cache-status';
export const HIT: SharedCacheStatus = 'HIT';
export const MISS: SharedCacheStatus = 'MISS';
export const EXPIRED: SharedCacheStatus = 'EXPIRED';
export const STALE: SharedCacheStatus = 'STALE';
export const BYPASS: SharedCacheStatus = 'BYPASS';
export const REVALIDATED: SharedCacheStatus = 'REVALIDATED';
export const DYNAMIC: SharedCacheStatus = 'DYNAMIC';
