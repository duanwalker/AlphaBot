import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { transformWithOxc } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'treat-js-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.match(/tests\/.*\.js$/)) return;
        return transformWithOxc(code, id, {
          lang: 'jsx',
          jsx: { runtime: 'automatic', importSource: 'react' },
        });
      },
    },
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'recharts'],
  },
});
