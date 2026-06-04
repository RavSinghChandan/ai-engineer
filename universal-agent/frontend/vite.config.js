import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 4204,
    proxy: {
      '/agent': 'http://localhost:8001',
      '/agents': 'http://localhost:8001',
    },
  },
});
