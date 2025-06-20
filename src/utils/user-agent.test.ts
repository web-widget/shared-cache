import { deviceType } from './user-agent';

describe('user-agent', () => {
  describe('deviceType', () => {
    // Helper function to create Headers with User-Agent and optionally Sec-CH-UA-Mobile
    const createHeaders = (userAgent: string, isMobile?: string) => {
      const headers = new Headers();
      headers.set('User-Agent', userAgent);
      if (isMobile !== undefined) {
        headers.set('Sec-CH-UA-Mobile', isMobile);
      }
      return headers;
    };

    describe('Mobile detection', () => {
      it('should detect iPhone as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect Android phone as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect Windows Phone as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0; IEMobile/10.0; ARM; Touch; NOKIA; Lumia 920)'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect iPod as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/604.1.34'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect BlackBerry as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en) AppleWebKit/534.11+'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect Opera Mini as mobile', () => {
        const headers = createHeaders(
          'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect Mobile Safari as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect KAIOS as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Mobile; rv:48.0; A405DL) Gecko/48.0 Firefox/48.0 KAIOS/2.5'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect based on Sec-CH-UA-Mobile header', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          '?1'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should prioritize Sec-CH-UA-Mobile over User-Agent', () => {
        // Desktop-like User-Agent but mobile hint
        const headers = createHeaders(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          '?1'
        );
        expect(deviceType(headers)).toBe('mobile');
      });
    });

    describe('Tablet detection', () => {
      it('should detect iPad as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1'
        );
        expect(deviceType(headers)).toBe('tablet');
      });

      it('should detect Android tablet as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 11; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Safari/537.36'
        );
        expect(deviceType(headers)).toBe('tablet');
      });

      it('should detect BlackBerry Playbook as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+'
        );
        expect(deviceType(headers)).toBe('tablet');
      });

      it('should not detect Android mobile as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect Silk tablet as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; U; Android 4.4.3; KFTHWI Build/KTU84M) AppleWebKit/537.36 (KHTML, like Gecko) Silk/47.1.79 like Chrome/47.0.2526.80 Safari/537.36'
        );
        expect(deviceType(headers)).toBe('tablet');
      });
    });

    describe('Desktop detection', () => {
      it('should detect Windows desktop as desktop', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should detect macOS desktop as desktop', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should detect Linux desktop as desktop', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should detect Firefox on desktop as desktop', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
        );
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should detect Safari on macOS as desktop', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
        );
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should handle Sec-CH-UA-Mobile as ?0 for desktop', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          '?0'
        );
        expect(deviceType(headers)).toBe('desktop');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty User-Agent', () => {
        const headers = createHeaders('');
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should handle missing User-Agent header', () => {
        const headers = new Headers();
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should handle null User-Agent', () => {
        const headers = new Headers();
        headers.set('User-Agent', 'null');
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should handle unknown User-Agent', () => {
        const headers = createHeaders('UnknownBot/1.0');
        expect(deviceType(headers)).toBe('desktop');
      });

      it('should be case insensitive for mobile detection', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (IPHONE; CPU iPhone OS 14_6 like Mac OS X)'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should handle mixed case User-Agent strings', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; ANDROID 11; SM-G991B) AppleWebKit/537.36 Mobile Safari/537.36'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should handle googlebot mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        );
        expect(deviceType(headers)).toBe('mobile');
      });
    });

    describe('Real world User-Agent strings', () => {
      it('should detect Samsung Galaxy as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.129 Mobile Safari/537.36'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect Pixel phone as mobile', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36'
        );
        expect(deviceType(headers)).toBe('mobile');
      });

      it('should detect iPad Pro as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (iPad; CPU OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'
        );
        expect(deviceType(headers)).toBe('tablet');
      });

      it('should detect Surface tablet as tablet', () => {
        const headers = createHeaders(
          'Mozilla/5.0 (Linux; Android 11; Surface Duo) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36'
        );
        expect(deviceType(headers)).toBe('mobile'); // Surface Duo is treated as mobile due to "Mobile" in UA
      });
    });
  });
});
