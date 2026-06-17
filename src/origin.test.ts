import { invokeOrigin, toOriginFailureResponse } from './origin';
import type { CacheOriginContext, CacheOriginHandler } from './types';

const TEST_URL = 'http://localhost/';
const testRequest = new Request(TEST_URL);

function createContext(
  phase: CacheOriginContext['phase'],
  signal?: AbortSignal
): CacheOriginContext {
  return { phase, signal };
}

describe('toOriginFailureResponse', () => {
  it('should convert Error instances to 500 responses', async () => {
    const response = toOriginFailureResponse(new Error('origin failed'));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('origin failed');
  });

  it('should convert non-Error values to a generic 500 response', async () => {
    const response = toOriginFailureResponse('boom');

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
  });
});

describe('invokeOrigin', () => {
  describe('without signal', () => {
    it('should return the origin response on cache miss', async () => {
      const origin: CacheOriginHandler = () =>
        new Response('ok', { status: 200 });

      const response = await invokeOrigin(
        origin,
        testRequest,
        createContext('miss')
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
    });

    it('should propagate synchronous throws on cache miss', async () => {
      const origin: CacheOriginHandler = () => {
        throw new Error('sync miss failure');
      };

      await expect(
        invokeOrigin(origin, testRequest, createContext('miss'))
      ).rejects.toThrow('sync miss failure');
    });

    it('should propagate asynchronous rejections on cache miss', async () => {
      const origin: CacheOriginHandler = async () => {
        throw new Error('async miss failure');
      };

      await expect(
        invokeOrigin(origin, testRequest, createContext('miss'))
      ).rejects.toThrow('async miss failure');
    });

    it('should convert synchronous throws to 500 responses during revalidation', async () => {
      const origin: CacheOriginHandler = () => {
        throw new Error('sync revalidate failure');
      };

      const response = await invokeOrigin(
        origin,
        testRequest,
        createContext('revalidate')
      );

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('sync revalidate failure');
    });

    it('should convert asynchronous rejections to 500 responses during revalidation', async () => {
      const origin: CacheOriginHandler = async () => {
        throw new Error('async revalidate failure');
      };

      const response = await invokeOrigin(
        origin,
        testRequest,
        createContext('revalidate')
      );

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('async revalidate failure');
    });

    it('should pass the origin context to the handler', async () => {
      const origin: CacheOriginHandler = (_request, context) => {
        expect(context.phase).toBe('revalidate');
        expect(context.revalidationRequest).toBeInstanceOf(Request);
        return new Response('revalidated');
      };

      const revalidationRequest = new Request(TEST_URL, {
        headers: { 'if-none-match': '"v1"' },
      });

      const response = await invokeOrigin(origin, revalidationRequest, {
        phase: 'revalidate',
        revalidationRequest,
      });

      expect(await response.text()).toBe('revalidated');
    });
  });

  describe('with signal', () => {
    it('should throw on cache miss when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('already aborted'));

      await expect(
        invokeOrigin(() => new Response('ok'), testRequest, {
          phase: 'miss',
          signal: controller.signal,
        })
      ).rejects.toThrow('already aborted');
    });

    it('should return 500 during revalidation when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('already aborted'));

      const response = await invokeOrigin(
        () => new Response('ok'),
        testRequest,
        {
          phase: 'revalidate',
          signal: controller.signal,
        }
      );

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('already aborted');
    });

    it('should reject cache miss when the signal aborts before the origin settles', async () => {
      const controller = new AbortController();
      const origin: CacheOriginHandler = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(new Response('late')), 50);
        });

      const pending = invokeOrigin(origin, testRequest, {
        phase: 'miss',
        signal: controller.signal,
      });

      controller.abort(new Error('aborted while pending'));

      await expect(pending).rejects.toThrow('aborted while pending');
    });

    it('should return 500 during revalidation when the signal aborts before the origin settles', async () => {
      const controller = new AbortController();
      const origin: CacheOriginHandler = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(new Response('late')), 50);
        });

      const pending = invokeOrigin(origin, testRequest, {
        phase: 'revalidate',
        signal: controller.signal,
      });

      controller.abort(new Error('aborted while pending'));

      const response = await pending;
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('aborted while pending');
    });

    it('should use a default AbortError when abort has no reason', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        invokeOrigin(() => new Response('ok'), testRequest, {
          phase: 'miss',
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('should convert synchronous throws to 500 when a signal is present during revalidation', async () => {
      const controller = new AbortController();
      const origin: CacheOriginHandler = () => {
        throw new Error('sync with signal');
      };

      const response = await invokeOrigin(origin, testRequest, {
        phase: 'revalidate',
        signal: controller.signal,
      });

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('sync with signal');
    });

    it('should reject cache miss when the origin rejects and a signal is present', async () => {
      const controller = new AbortController();
      const origin: CacheOriginHandler = async () => {
        throw new Error('async with signal');
      };

      await expect(
        invokeOrigin(origin, testRequest, {
          phase: 'miss',
          signal: controller.signal,
        })
      ).rejects.toThrow('async with signal');
    });
  });
});
