/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
