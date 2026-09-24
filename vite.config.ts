import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { thirdPartyLicenses } from './vite-plugins/thirdPartyLicenses'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact(), thirdPartyLicenses()],
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