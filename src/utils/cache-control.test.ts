import { cacheControl } from './cache-control';

it('should append cache control headers', () => {
  const headers = new Headers();
  cacheControl(headers, 'public, max-age=31536000');
  expect(headers.get('cache-control')).toBe('public, max-age=31536000');
});

it('should not duplicate existing cache control directives', () => {
  const headers = new Headers();
  headers.append('cache-control', 'public');
  cacheControl(headers, 'public, max-age=31536000');
  expect(headers.get('cache-control')).toBe('public, max-age=31536000');
});

it('should not duplicate existing cache control directives with different casing', () => {
  const headers = new Headers();
  headers.append('cache-control', 'public, max-age=1');
  cacheControl(headers, 'Public, max-age=31536000');
  expect(headers.get('cache-control')).toBe('public, max-age=1');
});

it('should append multiple cache control headers', () => {
  const headers = new Headers();
  cacheControl(headers, ['public', 'max-age=31536000']);
  expect(headers.get('cache-control')).toBe('public, max-age=31536000');
});
