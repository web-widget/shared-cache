import {
  CANNOT_INCLUDE_HEADERS,
  createCacheKeyGenerator,
  header,
  vary,
  type SharedCacheKeyRules,
} from './cache-key';

it('should support base: host + pathname + search', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(new Request('http://localhost/?a=1'), {
    host: true,
    pathname: true,
    search: true,
  });
  expect(key).toBe('localhost/?a=1');
});

it('should include scheme by default', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(new Request('http://localhost/?a=1'));
  expect(key).toBe('http://localhost/?a=1');
});

it('should distinguish http and https schemes', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const httpKey = await keyGenerator(new Request('http://localhost/'));
  const httpsKey = await keyGenerator(new Request('https://localhost/'));
  expect(httpKey).toBe('http://localhost/');
  expect(httpsKey).toBe('https://localhost/');
});

describe('should support scheme', () => {
  it('should work with basic functionality', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('https://localhost/api'), {
      scheme: true,
      host: true,
      pathname: true,
    });
    expect(key).toBe('https://localhost/api');
  });

  it('should allow scheme to be disabled for reverse-proxy setups', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('https://localhost/api'), {
      scheme: false,
      host: true,
      pathname: true,
    });
    expect(key).toBe('localhost/api');
  });
});

it('should support built-in rules', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(
    new Request('http://localhost/?a=1', {
      method: 'GET',
      headers: {
        cookie: 'a=1',
        'X-ID': 'abc',
        'x-a': 'a',
        'x-b': 'b',
      },
    }),
    {
      cookie: true,
      device: true,
      header: {
        include: ['x-id'],
      },
      host: true,
      pathname: true,
      search: true,
    }
  );
  expect(key).toBe(
    'localhost/?a=1#cookie:a|device|header:x-id@cb15d91aab694816b937006f086f312ba6ddcce7'
  );
});

it('should support filtering', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(
    new Request('http://localhost/?a=1&b=2', {
      headers: {
        accept: 'application/json',
        'x-id': 'abc',
      },
    }),
    {
      host: {
        include: ['localhost'],
      },
      pathname: true,
      search: { include: ['a'] },
      header: { include: ['x-id'] },
    }
  );
  expect(key).toBe(
    'localhost/?a=1#header:x-id@794bdd5e049e0f23827f2b396a5f29854697d4e7'
  );
});

it('should support presence or absence without including its actual value', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(new Request('http://localhost/?a=1&b=2'), {
    host: true,
    pathname: true,
    search: { include: ['a', 'b'], checkPresence: ['a'] },
  });
  expect(key).toBe('localhost/?a&b=2');
});

describe('should support normalize', () => {
  it('should rely on URL parsing for scheme and host normalization', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('HTTP://LOCALHOST:80/api/'), {
      scheme: true,
      host: true,
      pathname: true,
    });
    expect(key).toBe('http://localhost/api/');
  });

  it('should allow optional normalization to be disabled', async () => {
    const enabled = createCacheKeyGenerator({
      pathnameLowerCase: true,
    });
    const disabled = createCacheKeyGenerator(false);

    const request = new Request('http://localhost/API');

    expect(await enabled(request, { host: true, pathname: true })).toBe(
      'localhost/api'
    );
    expect(await disabled(request, { host: true, pathname: true })).toBe(
      'localhost/API'
    );
  });

  it('should remove trailing slashes when explicitly enabled', async () => {
    const keyGenerator = createCacheKeyGenerator({
      trailingSlash: true,
    });
    const key = await keyGenerator(new Request('http://localhost/api/'), {
      host: true,
      pathname: true,
    });
    expect(key).toBe('localhost/api');
  });

  it('should omit default ports via URL parsing', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost:80/api'), {
      host: true,
      pathname: true,
    });
    expect(key).toBe('localhost/api');
  });

  it('should strip spaces only when explicitly enabled', async () => {
    const keyGenerator = createCacheKeyGenerator({
      ignoreSpaces: true,
    });
    const key = await keyGenerator(
      new Request('http://localhost/a%20b/?q=hello%20world'),
      {
        host: true,
        pathname: true,
        search: true,
      }
    );
    expect(key).toBe('localhost/ab/?q=helloworld');
  });

  it('should merge custom normalization options', async () => {
    const keyGenerator = createCacheKeyGenerator({
      trailingSlash: true,
    });
    const key = await keyGenerator(new Request('http://localhost:80/api/'), {
      host: true,
      pathname: true,
    });
    expect(key).toBe('localhost/api');
  });
});

describe('should support cookie', () => {
  it('should hash the value', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          cookie: 'a=hello',
        },
      }),
      {
        cookie: true,
      }
    );
    expect(key).toBe('#cookie:a@8d1c4eaf99062d83c7688f680ae9b16b34589a3d');
  });

  it('should be sorted', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          cookie: 'b=2;a=1;c=3',
        },
      }),
      {
        cookie: true,
      }
    );
    expect(key).toBe('#cookie:a&b&c@32e746be69da5f9de1c1a8bbb2557c0dd59e7743');
  });

  it('should support filtering', async () => {
    expect(
      await createCacheKeyGenerator()(
        new Request('http://localhost/', {
          headers: {
            cookie: 'a=1;b=2;c=3',
          },
        }),
        {
          cookie: { include: ['a'] },
        }
      )
    ).toBe('#cookie:a@5e5504de3f06749cb4b8b8a56c8bc4de901a0134');

    expect(
      await createCacheKeyGenerator()(
        new Request('http://localhost/', {
          headers: {
            cookie: 'a=1;b=2;c=3',
          },
        }),
        {
          cookie: { exclude: ['a'] },
        }
      )
    ).toBe('#cookie:b&c@cd9b0524a5caa8b5017cee14ea64c4e80cf28de3');
  });

  it('should support check presence', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          cookie: 'a=1;b=2;c=3',
        },
      }),
      {
        cookie: { include: ['a', 'b', 'c'], checkPresence: ['a'] },
      }
    );
    expect(key).toBe('#cookie:a&b&c@bda2a14e0a2ca9f346bdf2bf5db136d1b62332b5');
  });
});

describe('should support device', () => {
  it('should return default device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      device: true,
    });
    expect(key).toBe('#device@6a5bb591869b46097c846f743c03e569c344330f');
  });

  it('should detect desktop device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
      }),
      {
        device: true,
      }
    );
    expect(key).toBe('#device@6a5bb591869b46097c846f743c03e569c344330f');
  });

  it('should detect mobile device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        },
      }),
      {
        device: true,
      }
    );
    expect(key).toBe('#device@328a8d87058f2fadfad274b5f67e92e7c63c9748');
  });

  it('should detect tablet device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPad; CPU iPad OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        },
      }),
      {
        device: true,
      }
    );
    expect(key).toBe('#device@ab722fd73619a3750187f2e40468e28648d8ef0f');
  });
});

describe('should support header', () => {
  it('should hash the value', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          a: 'hello',
        },
      }),
      {
        header: true,
      }
    );
    expect(key).toBe('#header:a@5dc69cb58b513f628315466940be67a0406d7a2b');
  });

  it('should be sorted', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          b: '2',
          a: '1',
          c: '3',
        },
      }),
      {
        header: true,
      }
    );
    expect(key).toBe('#header:a&b&c@5ebeaf153d436d0fab85716878214628d574188a');
  });

  it('should support filtering', async () => {
    expect(
      await createCacheKeyGenerator()(
        new Request('http://localhost/', {
          headers: {
            a: '1',
            b: '2',
            c: '3',
          },
        }),
        {
          header: { include: ['a'] },
        }
      )
    ).toBe('#header:a@2a9c02967216f590cbea1d4d4b8bf54345411506');

    expect(
      await createCacheKeyGenerator()(
        new Request('http://localhost/', {
          headers: {
            a: '1',
            b: '2',
            c: '3',
          },
        }),
        {
          header: { exclude: ['a'] },
        }
      )
    ).toBe('#header:b&c@ed3ee26abfe1037a88b05351c87e5d139b2ee58d');
  });

  it('should support check presence', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          b: '2',
          a: '1',
          c: '3',
        },
      }),
      {
        header: { include: ['a', 'b', 'c'], checkPresence: ['a'] },
      }
    );
    expect(key).toBe('#header:a&b&c@670f9f5b3cbd9505a360703fe0467649ff8d958d');
  });

  it('should ignore case for header keys', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          a: 'application/json',
          'X-ID': 'abc',
        },
      }),
      {
        header: true,
      }
    );
    expect(key).toBe('#header:a&x-id@e8acc0884f73c5034549a7afb53bde2d7266f0f4');
  });

  it('should not allow some headers to be included', async () => {
    CANNOT_INCLUDE_HEADERS.forEach(async (key) => {
      await expect(
        createCacheKeyGenerator()(
          new Request('http://localhost/', {
            headers: {
              [key]: 'hello',
            },
          }),
          {
            header: { include: [key] },
          }
        )
      ).rejects.toThrow(
        `Cannot include header "${key}" in cache key. This header is excluded to prevent cache fragmentation or conflicts with other cache features.`
      );
    });
  });
});

describe('should support host', () => {
  it('should work with basic functionality', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      host: true,
    });
    expect(key).toBe('localhost');
  });

  it('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost:8080/'), {
      host: { include: ['localhost'] },
    });
    expect(key).toBe('');
  });
});

describe('should support pathname', () => {
  it('should work with basic functionality', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/a/b/c'), {
      pathname: true,
    });
    expect(key).toBe('/a/b/c');
  });

  it('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost:8080/a/b/c'), {
      pathname: { include: ['/a/b/c'] },
    });
    expect(key).toBe('/a/b/c');
  });
});

describe('should support search', () => {
  it('should be sorted', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/?b=2&a=1&c=3'),
      {
        search: true,
      }
    );
    expect(key).toBe('?a=1&b=2&c=3');
  });

  it('should not generate question marks if there are no query parameters', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      search: true,
    });
    expect(key).toBe('');
  });

  it('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/?a=1&b=2&c=3'),
      {
        search: { include: ['a'] },
      }
    );
    expect(key).toBe('?a=1');
  });

  it('should support check presence', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/?a=1&b=2&c=3'),
      {
        search: { include: ['a', 'b', 'c'], checkPresence: ['a'] },
      }
    );
    expect(key).toBe('?a&b=2&c=3');
  });
});

describe('should reject unknown cache key parts', () => {
  it('should throw for unsupported rule names', async () => {
    const keyGenerator = createCacheKeyGenerator();

    await expect(() =>
      keyGenerator(new Request('http://localhost/'), {
        foo: true,
      } as SharedCacheKeyRules)
    ).rejects.toThrow(
      'Unknown cache key part: "foo". Use built-in parts (scheme, host, pathname, search, cookie, device, header).'
    );
  });
});

describe('get header part', () => {
  it('should include all', async () => {
    const key = await header(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      })
    );
    expect(key).toBe('a&b&c@147cb5937edc2fa8cb06a802bf0d64e0419a0fb1');
  });

  it('should include some', async () => {
    const key = await header(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      }),
      {
        include: ['a', 'b'],
      }
    );
    expect(key).toBe('a&b@d53cf64e768f4ef09c806bbe12258c78211b2690');
  });

  it('should ignore case when filtering', async () => {
    const key = await header(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      }),
      {
        include: ['A', 'B'],
      }
    );
    expect(key).toBe('a&b@d53cf64e768f4ef09c806bbe12258c78211b2690');
  });
});

describe('get vary part', () => {
  it('should include all', async () => {
    const key = await vary(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      })
    );
    expect(key).toBe('a&b&c@147cb5937edc2fa8cb06a802bf0d64e0419a0fb1');
  });

  it('should include some', async () => {
    const key = await vary(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      }),
      {
        include: ['a', 'b'],
      }
    );
    expect(key).toBe('a&b@d53cf64e768f4ef09c806bbe12258c78211b2690');
  });

  it('should ignore case when filtering', async () => {
    const key = await vary(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      }),
      {
        include: ['A', 'B'],
      }
    );
    expect(key).toBe('a&b@d53cf64e768f4ef09c806bbe12258c78211b2690');
  });
});

describe('sync cache key generator', () => {
  it('should build default URL keys synchronously', () => {
    const generator = createCacheKeyGenerator();
    const request = new Request('http://localhost/?a=1');

    expect(generator.sync(request)).toBe('http://localhost/?a=1');
  });

  it('should return undefined when fragments are required', () => {
    const generator = createCacheKeyGenerator();
    const request = new Request('http://localhost/', {
      headers: { cookie: 'a=1' },
    });

    expect(generator.sync(request, { cookie: true })).toBeUndefined();
  });

  it('should treat normalize true the same as the default generator', async () => {
    const defaultGenerator = createCacheKeyGenerator();
    const explicitGenerator = createCacheKeyGenerator(true);
    const request = new Request('http://localhost/API');

    expect(
      await explicitGenerator(request, { host: true, pathname: true })
    ).toBe(await defaultGenerator(request, { host: true, pathname: true }));
  });

  it('should omit fragments when whitelisted headers are absent', async () => {
    const generator = createCacheKeyGenerator();
    const key = await generator(new Request('http://localhost/'), {
      host: true,
      pathname: true,
      header: { include: ['x-missing'] },
    });

    expect(key).toBe('localhost/');
  });
});
