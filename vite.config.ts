import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  css: {
    preprocessorOptions: {
      scss: {
        // Inject design tokens into every SCSS module so components can
        // reference $radius, $transition, etc. without an explicit @use.
        additionalData: `@use "/src/styles/tokens" as *;`,
      },
    },
  },
});