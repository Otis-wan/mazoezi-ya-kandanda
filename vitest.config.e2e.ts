import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata', './test/setup-env.ts'],
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
