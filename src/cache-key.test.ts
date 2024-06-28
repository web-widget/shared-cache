import {
  CANNOT_INCLUDE_HEADERS,
  createCacheKeyGenerator,
  header,
  vary,
} from './cache-key';

test('base: host + pathname + search', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(new Request('http://localhost/?a=1'), {
    cacheKeyRules: {
      host: true,
      pathname: true,
      search: true,
    },
  });
  expect(key).toBe('localhost/?a=1');
});

test('should support built-in rules', async () => {
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
      cacheKeyRules: {
        cookie: true,
        device: true,
        header: {
          include: ['x-id'],
        },
        host: true,
        method: true,
        pathname: true,
        search: true,
      },
    }
  );
  expect(key).toBe('localhost/?a=1#a=356a19:desktop:x-id=a9993e:GET');
});

test('should support filtering', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(
    new Request('http://localhost/?a=1&b=2', {
      headers: {
        accept: 'application/json',
        'x-id': 'abc',
      },
    }),
    {
      cacheKeyRules: {
        host: {
          include: ['localhost'],
        },
        pathname: true,
        search: { include: ['a'] },
        header: { include: ['x-id'] },
      },
    }
  );
  expect(key).toBe('localhost/?a=1#x-id=a9993e');
});

test('should support presence or absence without including its actual value', async () => {
  const keyGenerator = createCacheKeyGenerator();
  const key = await keyGenerator(new Request('http://localhost/?a=1&b=2'), {
    cacheKeyRules: {
      host: true,
      pathname: true,
      search: { include: ['a', 'b'], checkPresence: ['a'] },
    },
  });
  expect(key).toBe('localhost/?a&b=2');
});

describe('should support cacheName', () => {
  test('"default" value should be overridden to empty', async () => {
    const keyGenerator = createCacheKeyGenerator('default');
    const key = await keyGenerator(new Request('http://localhost/?a=1&b=2'), {
      cacheKeyRules: {
        host: true,
        pathname: true,
        search: { include: ['a', 'b'], checkPresence: ['a'] },
      },
    });
    expect(key).toBe('localhost/?a&b=2');
  });

  test('cacheName should appear in the prefix', async () => {
    const keyGenerator = createCacheKeyGenerator('custom');
    const key = await keyGenerator(new Request('http://localhost/?a=1&b=2'), {
      cacheKeyRules: {
        host: true,
        pathname: true,
        search: { include: ['a', 'b'], checkPresence: ['a'] },
      },
    });
    expect(key).toBe('custom/localhost/?a&b=2');
  });
});

describe('should support cookie', () => {
  test('the value should be hashed', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          cookie: 'a=hello',
        },
      }),
      {
        cacheKeyRules: {
          cookie: true,
        },
      }
    );
    expect(key).toBe('#a=aaf4c6');
  });

  test('should be sorted', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          cookie: 'b=2;a=1;c=3',
        },
      }),
      {
        cacheKeyRules: {
          cookie: true,
        },
      }
    );
    expect(key).toBe('#a=356a19&b=da4b92&c=77de68');
  });

  test('should support filtering', async () => {
    expect(
      await createCacheKeyGenerator()(
        new Request('http://localhost/', {
          headers: {
            cookie: 'a=1;b=2;c=3',
          },
        }),
        {
          cacheKeyRules: {
            cookie: { include: ['a'] },
          },
        }
      )
    ).toBe('#a=356a19');

    expect(
      await createCacheKeyGenerator()(
        new Request('http://localhost/', {
          headers: {
            cookie: 'a=1;b=2;c=3',
          },
        }),
        {
          cacheKeyRules: {
            cookie: { exclude: ['a'] },
          },
        }
      )
    ).toBe('#b=da4b92&c=77de68');
  });

  test('should support check presence', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          cookie: 'a=1;b=2;c=3',
        },
      }),
      {
        cacheKeyRules: {
          cookie: { include: ['a', 'b', 'c'], checkPresence: ['a'] },
        },
      }
    );
    expect(key).toBe('#a&b=da4b92&c=77de68');
  });
});

describe('should support device', () => {
  test('default device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      cacheKeyRules: {
        device: true,
      },
    });
    expect(key).toBe('#desktop');
  });

  test('desktop device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
      }),
      {
        cacheKeyRules: {
          device: true,
        },
      }
    );
    expect(key).toBe('#desktop');
  });

  test('mobile device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        },
      }),
      {
        cacheKeyRules: {
          device: true,
        },
      }
    );
    expect(key).toBe('#mobile');
  });

  test('tablet device type', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPad; CPU iPad OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        },
      }),
      {
        cacheKeyRules: {
          device: true,
        },
      }
    );
    expect(key).toBe('#tablet');
  });
});

describe('should support header', () => {
  test('the value should be hashed', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          a: 'hello',
        },
      }),
      {
        cacheKeyRules: {
          header: true,
        },
      }
    );
    expect(key).toBe('#a=aaf4c6');
  });

  test('should be sorted', async () => {
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
        cacheKeyRules: {
          header: true,
        },
      }
    );
    expect(key).toBe('#a=356a19&b=da4b92&c=77de68');
  });

  test('should support filtering', async () => {
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
          cacheKeyRules: {
            header: { include: ['a'] },
          },
        }
      )
    ).toBe('#a=356a19');

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
          cacheKeyRules: {
            header: { exclude: ['a'] },
          },
        }
      )
    ).toBe('#b=da4b92&c=77de68');
  });

  test('should support check presence', async () => {
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
        cacheKeyRules: {
          header: { include: ['a', 'b', 'c'], checkPresence: ['a'] },
        },
      }
    );
    expect(key).toBe('#a&b=da4b92&c=77de68');
  });

  test('header key should ignore case', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          a: 'application/json',
          'X-ID': 'abc',
        },
      }),
      {
        cacheKeyRules: {
          header: true,
        },
      }
    );
    expect(key).toBe('#a=ca9fd0&x-id=a9993e');
  });

  test('some headers are not allowed to be included', async () => {
    CANNOT_INCLUDE_HEADERS.forEach(async (key) => {
      await expect(
        createCacheKeyGenerator()(
          new Request('http://localhost/', {
            headers: {
              [key]: 'hello',
            },
          }),
          {
            cacheKeyRules: {
              header: { include: [key] },
            },
          }
        )
      ).rejects.toThrow(`Cannot include header: ${key}`);
    });
  });
});

describe('should support host', () => {
  test('basic', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      cacheKeyRules: {
        host: true,
      },
    });
    expect(key).toBe('localhost');
  });

  test('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost:8080/'), {
      cacheKeyRules: {
        host: { include: ['localhost'] },
      },
    });
    expect(key).toBe('');
  });
});

describe('should support method', () => {
  test('basic', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      cacheKeyRules: {
        method: true,
      },
    });
    expect(key).toBe('#GET');
  });

  test('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/', { method: 'POST' }),
      {
        cacheKeyRules: {
          method: { include: ['GET'] },
        },
      }
    );
    expect(key).toBe('#');
  });

  test('the body of the POST, PATCH and PUT methods should be used as part of the key', async () => {
    await Promise.all(
      ['POST', 'PATCH', 'PUT'].map(async (method) => {
        const keyGenerator = createCacheKeyGenerator();
        const key = await keyGenerator(
          new Request('http://localhost/', {
            method,
            body: 'hello',
          }),
          {
            cacheKeyRules: {
              method: true,
            },
          }
        );
        expect(key).toBe(`#${method}=aaf4c6`);
      })
    );
  });
});

describe('should support pathname', () => {
  test('basic', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/a/b/c'), {
      cacheKeyRules: {
        pathname: true,
      },
    });
    expect(key).toBe('/a/b/c');
  });

  test('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost:8080/a/b/c'), {
      cacheKeyRules: {
        pathname: { include: ['/a/b/c'] },
      },
    });
    expect(key).toBe('/a/b/c');
  });
});

describe('should support search', () => {
  test('should be sorted', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/?b=2&a=1&c=3'),
      {
        cacheKeyRules: {
          search: true,
        },
      }
    );
    expect(key).toBe('?a=1&b=2&c=3');
  });

  test('question marks should not be generated if there are no query parameters', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(new Request('http://localhost/'), {
      cacheKeyRules: {
        search: true,
      },
    });
    expect(key).toBe('');
  });

  test('should support filtering', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/?a=1&b=2&c=3'),
      {
        cacheKeyRules: {
          search: { include: ['a'] },
        },
      }
    );
    expect(key).toBe('?a=1');
  });

  test('should support check presence', async () => {
    const keyGenerator = createCacheKeyGenerator();
    const key = await keyGenerator(
      new Request('http://localhost/?a=1&b=2&c=3'),
      {
        cacheKeyRules: {
          search: { include: ['a', 'b', 'c'], checkPresence: ['a'] },
        },
      }
    );
    expect(key).toBe('?a&b=2&c=3');
  });
});

describe('should support custom key', () => {
  test('extract the contents of the header into a variable', async () => {
    const keyGenerator = createCacheKeyGenerator(undefined, {
      foo: async (request) => request.headers.get('x-id') || '',
    });
    const key = await keyGenerator(
      new Request('http://localhost/', {
        headers: {
          'x-id': 'custom',
        },
      }),
      {
        cacheKeyRules: {
          foo: true,
        },
      }
    );
    expect(key).toBe('#custom');
  });

  test('custom part must exist', async () => {
    const keyGenerator = createCacheKeyGenerator();
    await expect(() =>
      keyGenerator(new Request('http://localhost/'), {
        cacheKeyRules: {
          foo: true,
        },
      })
    ).rejects.toThrow('Unknown custom part: "foo".');
  });
});

describe('get header part', () => {
  test('should include all', async () => {
    const key = await header(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      })
    );
    expect(key).toBe('a=356a19&b=da4b92&c=77de68');
  });

  test('should include some', async () => {
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
    expect(key).toBe('a=356a19&b=da4b92');
  });

  test('filter should ignore case', async () => {
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
    expect(key).toBe('a=356a19&b=da4b92');
  });
});

describe('get vary part', () => {
  test('should include all', async () => {
    const key = await vary(
      new Request('http://localhost/?a=1', {
        headers: {
          a: '1',
          b: '2',
          c: '3',
        },
      })
    );
    expect(key).toBe('a=356a19&b=da4b92&c=77de68');
  });

  test('should include some', async () => {
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
    expect(key).toBe('a=356a19&b=da4b92');
  });

  test('filter should ignore case', async () => {
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
    expect(key).toBe('a=356a19&b=da4b92');
  });
});
