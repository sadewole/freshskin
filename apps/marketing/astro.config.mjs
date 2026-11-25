import { defineConfig } from 'astro/config';

// Marketing is fully static: no runtime, no server, no framework hydration.
// The only JavaScript on the page is the scan demo island.
export default defineConfig({
  site: 'https://freshskin.com',
  output: 'static',
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    // Small stylesheets inline; the rest stays a single external file.
    inlineStylesheets: 'auto',
  },
});
