import type { Options } from 'tsup';
export const tsup: Options = {
  entry: {
    'shared-cache': 'src/index.ts',
  },
  dts: true,
  target: 'es2022',
  splitting: true,
  sourcemap: false,
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  external: [],
};
