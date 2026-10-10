import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      CORS_ORIGINS: 'https://tms.tisini.africa',
      TRUST_PROXY: '0',
      DOCS_ENABLED: 'true',
    },
  },
});