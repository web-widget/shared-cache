/** @type {import('jest').Config} */
export default {
  roots: ['<rootDir>/src'],
  testMatch: ['**/(*.)+(spec|test).+(ts|tsx|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/'],
  testEnvironment: 'miniflare',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {},
};
