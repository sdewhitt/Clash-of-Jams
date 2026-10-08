import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

// Two projects so the everyday suite never needs a running emulator:
//   unit  - jsdom component and module tests colocated under src/
//   rules - Firestore security-rule tests in tests/rules/, run against the
//           emulator by `npm run test:rules`
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        projects: [
          {
            extends: true,
            test: {
              name: 'unit',
              environment: 'jsdom',
              include: ['src/**/*.test.{ts,tsx}'],
              setupFiles: ['src/test/setup.ts'],
            },
          },
          {
            extends: true,
            test: {
              name: 'rules',
              environment: 'node',
              include: ['tests/rules/**/*.test.ts'],
              // One emulator, shared state: files must not clear each other's data.
              fileParallelism: false,
              testTimeout: 15000,
              hookTimeout: 30000,
            },
          },
        ],
      },
    }),
  ),
)
