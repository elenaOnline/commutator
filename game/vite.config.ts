import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 8790, strictPort: true }, test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] } } as never);
