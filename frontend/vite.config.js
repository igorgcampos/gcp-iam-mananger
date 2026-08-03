import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Rotas de login/logout/callback do SSO (Entra ID) — precisam do
      // mesmo proxy para que o cookie de sessão seja tratado como same-site
      // pelo navegador em dev, igual ao comportamento do nginx em produção
      // (ver frontend/nginx/default.conf.template).
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
});
