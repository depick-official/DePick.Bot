import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  const allowAllHosts = env.VITE_ALLOW_ALL_HOSTS === 'true';

  return {
    plugins: [react()],
    base: '/',
    server: {
      host: '0.0.0.0',
      port: 8080,
      allowedHosts: allowAllHosts ? true : allowedHosts,
    },
  };
})
