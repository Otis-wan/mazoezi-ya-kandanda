import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  plugins: [swc.vite()],   // handles NestJS decorators/metadata correctly
});