import { defineConfig } from 'vitest/config';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..').replace(/\\/g, '/');
const coreNodeModules = path.resolve(projectRoot, 'packages/core/node_modules').replace(/\\/g, '/');

export default defineConfig({
  root: projectRoot,
  test: {
    name: 'rsl-e2e',
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default'],
    alias: {
      '@rsl/core/kernel': path.resolve(projectRoot, 'packages/core/src/shared/kernel/index.ts').replace(/\\/g, '/'),
      '@rsl/core/config': path.resolve(projectRoot, 'packages/core/src/shared/config/index.ts').replace(/\\/g, '/'),
      '@rsl/core': path.resolve(projectRoot, 'packages/core/src').replace(/\\/g, '/'),
      '@libsql/client': path.resolve(coreNodeModules, '@libsql/client').replace(/\\/g, '/'),
      'ssh2': path.resolve(coreNodeModules, 'ssh2').replace(/\\/g, '/')
    }
  }
});
