import { modifyResponseHeaders, setResponseHeader } from './response';

describe('Response Utils', () => {
  describe('modifyResponseHeaders', () => {
    it('should modify headers directly when they are mutable', () => {
      const originalBody = 'test content';
      const originalResponse = new Response(originalBody, {
        status: 200,
        headers: {
          'content-type': 'text/plain',
        },
      });

      // When headers are mutable, should return the same response object
      const modifiedResponse = modifyResponseHeaders(originalResponse, (headers) => {
        headers.set('x-test', 'value');
      });

      // Should be the same object reference (no cloning)
      expect(modifiedResponse).toBe(originalResponse);
      expect(modifiedResponse.headers.get('x-test')).toBe('value');
      expect(modifiedResponse.headers.get('content-type')).toBe('text/plain');
    });

    it('should create new Response when modification fails', () => {
      const originalBody = 'test content';
      const originalResponse = new Response(originalBody, {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'application/json',
          'etag': '"abc123"',
        },
      });

      // Mock headers.set to throw an error (simulating readonly headers)
      const originalSet = originalResponse.headers.set.bind(originalResponse.headers);
      originalResponse.headers.set = () => {
        throw new Error('Cannot modify readonly headers');
      };

      const modifiedResponse = modifyResponseHeaders(originalResponse, (headers) => {
        headers.set('x-test', 'value');
      });

      // Should be different object when modification fails
      expect(modifiedResponse).not.toBe(originalResponse);
      expect(modifiedResponse.headers.get('x-test')).toBe('value');
      expect(modifiedResponse.headers.get('content-type')).toBe('application/json');
      expect(modifiedResponse.headers.get('etag')).toBe('"abc123"');
      expect(modifiedResponse.status).toBe(201);
      expect(modifiedResponse.statusText).toBe('Created');

      // Restore original method
      originalResponse.headers.set = originalSet;
    });

    it('should preserve all response properties when creating new Response', async () => {
      const originalBody = 'test content with unicode: 测试内容';
      const originalResponse = new Response(originalBody, {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': originalBody.length.toString(),
          'etag': '"abc123"',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      });

      // Mock to force fallback to new Response creation
      originalResponse.headers.set = () => {
        throw new Error('Headers are readonly');
      };

      const modifiedResponse = modifyResponseHeaders(originalResponse, (headers) => {
        headers.set('x-modified', 'true');
        headers.set('x-timestamp', Date.now().toString());
      });

      // Verify all properties are preserved
      expect(modifiedResponse.status).toBe(201);
      expect(modifiedResponse.statusText).toBe('Created');
      expect(modifiedResponse.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(modifiedResponse.headers.get('content-length')).toBe(originalBody.length.toString());
      expect(modifiedResponse.headers.get('etag')).toBe('"abc123"');
      expect(modifiedResponse.headers.get('last-modified')).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
      expect(modifiedResponse.headers.get('x-modified')).toBe('true');
      expect(modifiedResponse.headers.has('x-timestamp')).toBe(true);
      expect(await modifiedResponse.text()).toBe(originalBody);
    });

    it('should handle multiple header modifications', () => {
      const originalResponse = new Response('test', {
        headers: { 'content-type': 'text/plain' },
      });

      const modifiedResponse = modifyResponseHeaders(originalResponse, (headers) => {
        headers.set('x-cache', 'miss');
        headers.set('x-served-by', 'shared-cache');
        headers.append('vary', 'accept-encoding');
        headers.delete('content-type');
      });

      expect(modifiedResponse.headers.get('x-cache')).toBe('miss');
      expect(modifiedResponse.headers.get('x-served-by')).toBe('shared-cache');
      expect(modifiedResponse.headers.get('vary')).toBe('accept-encoding');
      expect(modifiedResponse.headers.has('content-type')).toBe(false);
    });

    it('should handle error-prone headers modification gracefully', () => {
      const originalResponse = new Response('test', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });

      // Simulate headers that throw an error on modification
      originalResponse.headers.set = () => {
        throw new Error('Headers modification not allowed');
      };

      const modifiedResponse = modifyResponseHeaders(originalResponse, (headers) => {
        headers.set('x-error-test', 'true');
      });

      // Should create new response when modification fails
      expect(modifiedResponse).not.toBe(originalResponse);
      expect(modifiedResponse.headers.get('x-error-test')).toBe('true');
      expect(modifiedResponse.headers.get('content-type')).toBe('text/plain');
    });
  });

  describe('setResponseHeader', () => {
    it('should set single header on mutable headers', () => {
      const originalResponse = new Response('test', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });

      const modifiedResponse = setResponseHeader(originalResponse, 'x-cache', 'hit');

      // Should be the same object when headers are mutable
      expect(modifiedResponse).toBe(originalResponse);
      expect(modifiedResponse.headers.get('x-cache')).toBe('hit');
      expect(modifiedResponse.headers.get('content-type')).toBe('text/plain');
    });

    it('should create new Response when headers are readonly', () => {
      const originalResponse = new Response('test', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'text/plain' },
      });

      // Mock to simulate readonly headers
      originalResponse.headers.set = () => {
        throw new Error('Cannot set readonly header');
      };

      const modifiedResponse = setResponseHeader(originalResponse, 'x-cache', 'miss');

      // Should be different objects when headers are readonly
      expect(modifiedResponse).not.toBe(originalResponse);
      expect(modifiedResponse.headers.get('x-cache')).toBe('miss');
      expect(modifiedResponse.headers.get('content-type')).toBe('text/plain');
      expect(modifiedResponse.status).toBe(404);
      expect(modifiedResponse.statusText).toBe('Not Found');
    });

    it('should handle special header values', () => {
      const originalResponse = new Response('test', {
        headers: { 'content-type': 'application/json' },
      });

      const testCases = [
        ['x-empty', ''],
        ['x-ascii-only', 'ascii content only'],
        ['x-special-chars', 'value with spaces, commas, and "quotes"'],
        ['x-numeric', '12345'],
        ['x-boolean', 'true'],
      ];

      let response = originalResponse;
      for (const [name, value] of testCases) {
        response = setResponseHeader(response, name, value);
        expect(response.headers.get(name)).toBe(value);
      }

      // All headers should be present
      for (const [name, value] of testCases) {
        expect(response.headers.get(name)).toBe(value);
      }
    });
  });

  describe('Performance considerations', () => {
    it('should not create unnecessary Response objects', () => {
      const originalResponse = new Response('performance test', {
        headers: { 'content-type': 'text/plain' },
      });

      // Multiple modifications on the same response should not create multiple objects
      // when headers are mutable
      const step1 = setResponseHeader(originalResponse, 'x-step', '1');
      const step2 = setResponseHeader(step1, 'x-step', '2');
      const step3 = modifyResponseHeaders(step2, (headers) => {
        headers.set('x-step', '3');
      });

      // All should be the same object reference
      expect(step1).toBe(originalResponse);
      expect(step2).toBe(originalResponse);
      expect(step3).toBe(originalResponse);
      expect(step3.headers.get('x-step')).toBe('3');
    });

    it('should preserve body stream when creating new Response', async () => {
      const bodyContent = 'stream test content';
      const originalResponse = new Response(bodyContent, {
        headers: { 'content-type': 'text/plain' },
      });

      // Force new Response creation
      originalResponse.headers.set = () => {
        throw new Error('Readonly headers');
      };

      const modifiedResponse = modifyResponseHeaders(originalResponse, (headers) => {
        headers.set('x-stream-test', 'true');
      });

      // Body should still be readable
      expect(await modifiedResponse.text()).toBe(bodyContent);
      expect(modifiedResponse.headers.get('x-stream-test')).toBe('true');
    });
  });
});