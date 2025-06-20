import { sha1 } from './crypto';

describe('crypto', () => {
  describe('sha1', () => {
    it('should generate correct SHA-1 hash for empty string', async () => {
      const result = await sha1('');
      expect(result).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    });

    it('should generate correct SHA-1 hash for simple string', async () => {
      const result = await sha1('hello');
      expect(result).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    });

    it('should generate correct SHA-1 hash for "Hello World"', async () => {
      const result = await sha1('Hello World');
      expect(result).toBe('0a4d55a8d778e5022fab701977c5d840bbc486d0');
    });

    it('should generate correct SHA-1 hash for UTF-8 string with special characters', async () => {
      const result = await sha1('Hello, 世界!');
      expect(result).toBe('6a59e3381dc721f0bd333c55fab53cc339c626f0');
    });

    it('should generate correct SHA-1 hash for string with numbers', async () => {
      const result = await sha1('123456789');
      expect(result).toBe('f7c3bc1d808e04732adf679965ccc34ca7ae3441');
    });

    it('should generate correct SHA-1 hash for long string', async () => {
      const longString = 'a'.repeat(1000);
      const result = await sha1(longString);
      expect(result).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
    });

    it('should generate correct SHA-1 hash for string with newlines and tabs', async () => {
      const result = await sha1('line1\nline2\ttab');
      expect(result).toBe('9220d0f5064626e221c460377a228fe54728c20b');
    });

    it('should handle string with emoji', async () => {
      const result = await sha1('Hello 👋 World 🌍');
      expect(result).toBe('3a4a52bbdb382fbaea3cda5207126bab13973a5e');
    });

    it('should generate different hashes for different inputs', async () => {
      const hash1 = await sha1('test1');
      const hash2 = await sha1('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should generate consistent hashes for same input', async () => {
      const input = 'consistent test';
      const hash1 = await sha1(input);
      const hash2 = await sha1(input);
      expect(hash1).toBe(hash2);
    });

    it('should return 40-character hex string', async () => {
      const result = await sha1('test');
      expect(result).toHaveLength(40);
      expect(result).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should throw error when crypto is not available', async () => {
      // Mock crypto to be undefined
      const originalCrypto = (globalThis as { crypto?: Crypto }).crypto;
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      await expect(sha1('test')).rejects.toThrow('SHA-1 is not supported');

      // Restore original crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    });

    it('should throw error when crypto.subtle is not available', async () => {
      // Mock crypto without subtle
      const originalCrypto = (globalThis as { crypto?: Crypto }).crypto;
      Object.defineProperty(globalThis, 'crypto', {
        value: {},
        configurable: true,
      });

      await expect(sha1('test')).rejects.toThrow('SHA-1 is not supported');

      // Restore original crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    });
  });
});
