import { vary } from './vary';

describe('vary(res, field)', function () {
  describe('arguments', function () {
    describe('res', function () {
      it('should be required', function () {
        expect(() => {
          // @ts-expect-error - headers argument is required
          vary();
        }).toThrow('headers argument is required');
      });

      it('should not allow non-res-like objects', function () {
        expect(() => {
          // @ts-expect-error - headers argument is required
          vary(null, {});
        }).toThrow('headers argument is required');
      });
    });
  });

  describe('when no Vary', function () {
    it('should set value', function () {
      const headers = new Headers();
      vary(headers, 'Origin');
      expect(headers.get('Vary')).toBe('Origin');
    });

    it('should set value with multiple calls', function () {
      const headers = new Headers();
      vary(headers, ['Origin', 'User-Agent']);
      expect(headers.get('Vary')).toBe('Origin, User-Agent');
    });

    it('should preserve case', function () {
      const headers = new Headers();
      vary(headers, ['ORIGIN', 'user-agent', 'AccepT']);
      expect(headers.get('Vary')).toBe('ORIGIN, user-agent, AccepT');
    });

    it('should not set Vary on empty array', function () {
      const headers = new Headers();
      vary(headers, []);
      expect(headers.get('Vary')).toBe(null);
    });
  });

  describe('when existing Vary', function () {
    it('should set value', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept');
      vary(headers, 'Origin');
      expect(headers.get('Vary')).toBe('Accept, Origin');
    });

    it('should set value with multiple calls', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept');
      vary(headers, 'Origin');
      vary(headers, 'User-Agent');
      expect(headers.get('Vary')).toBe('Accept, Origin, User-Agent');
    });

    it('should not duplicate existing value', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept');
      vary(headers, 'Accept');
      expect(headers.get('Vary')).toBe('Accept');
    });

    it('should compare case-insensitive', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept');
      vary(headers, 'accEPT');
      expect(headers.get('Vary')).toBe('Accept');
    });

    it('should preserve case', function () {
      const headers = new Headers();
      headers.set('Vary', 'AccepT');
      vary(headers, ['accEPT', 'ORIGIN']);
      expect(headers.get('Vary')).toBe('AccepT, ORIGIN');
    });
  });

  describe('when existing Vary as array', function () {
    it('should set value', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept, Accept-Encoding');
      vary(headers, 'Origin');
      expect(headers.get('Vary')).toBe('Accept, Accept-Encoding, Origin');
    });

    it('should not duplicate existing value', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept, Accept-Encoding');
      vary(headers, 'Accept');
      expect(headers.get('Vary')).toBe('Accept, Accept-Encoding');
    });
  });

  describe('when Vary: *', function () {
    it('should set value', function () {
      const headers = new Headers();
      headers.set('Vary', '*');
      vary(headers, 'Origin');
      expect(headers.get('Vary')).toBe('*');
    });

    it('should act as if all values already set', function () {
      const headers = new Headers();
      headers.set('Vary', '*');
      vary(headers, 'Origin');
      vary(headers, 'User-Agent');
      expect(headers.get('Vary')).toBe('*');
    });

    it('should eradicate existing values', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept, Accept-Encoding');
      vary(headers, '*');
      expect(headers.get('Vary')).toBe('*');
    });

    it('should update bad existing header', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept, Accept-Encoding, *');
      vary(headers, 'Origin');
      expect(headers.get('Vary')).toBe('*');
    });
  });

  describe('when field is string', function () {
    it('should set value', function () {
      const headers = new Headers();
      vary(headers, 'Accept');
      expect(headers.get('Vary')).toBe('Accept');
    });

    it('should set value when vary header', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept, Accept-Encoding');
      vary(headers, 'Origin');
      expect(headers.get('Vary')).toBe('Accept, Accept-Encoding, Origin');
    });

    it('should accept LWS', function () {
      const headers = new Headers();
      vary(headers, '  Accept     ,     Origin    ');
      expect(headers.get('Vary')).toBe('Accept, Origin');
    });

    it('should handle contained *', function () {
      const headers = new Headers();
      vary(headers, 'Accept,*');
      expect(headers.get('Vary')).toBe('*');
    });
  });

  describe('when field is array', function () {
    it('should set value', function () {
      const headers = new Headers();
      vary(headers, ['Accept', 'Accept-Language']);
      expect(headers.get('Vary')).toBe('Accept, Accept-Language');
    });

    it('should ignore double-entries', function () {
      const headers = new Headers();
      vary(headers, ['Accept', 'Accept']);
      expect(headers.get('Vary')).toBe('Accept');
    });

    it('should be case-insensitive', function () {
      const headers = new Headers();
      vary(headers, ['Accept', 'ACCEPT']);
      expect(headers.get('Vary')).toBe('Accept');
    });

    it('should handle contained *', function () {
      const headers = new Headers();
      vary(headers, ['Origin', 'User-Agent', '*', 'Accept']);
      expect(headers.get('Vary')).toBe('*');
    });

    it('should handle existing values', function () {
      const headers = new Headers();
      headers.set('Vary', 'Accept, Accept-Encoding');
      vary(headers, ['origin', 'accept', 'accept-charset']);
      expect(headers.get('Vary')).toBe(
        'Accept, Accept-Encoding, origin, accept-charset'
      );
    });
  });
});
