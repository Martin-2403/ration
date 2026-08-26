import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
// Left without a file extension deliberately. Vite's native config loader emits
// a warning about this, but adding `.ts` fails type-check with TS5097 unless
// allowImportingTsExtensions is turned on, which is a worse trade.
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
