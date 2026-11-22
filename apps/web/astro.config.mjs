import process from 'node:process';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Public website: static pages (fast, indexable), live club data loaded from the public API.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  server: { port: 4321 },
  vite: { plugins: [tailwindcss()] },
  build: { inlineStylesheets: 'auto' },
});
