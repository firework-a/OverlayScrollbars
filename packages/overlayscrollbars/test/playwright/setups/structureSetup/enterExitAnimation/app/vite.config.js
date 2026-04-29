import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  resolve: {
    alias: [{ find: 'overlayscrollbars', replacement: '~/overlayscrollbars' }],
  },
  build: {
    outDir: '.build',
    minify: false,
    lib: {
      entry: './index.ts',
      formats: ['es'],
      fileName: 'app',
    },
    rolldownOptions: {
      external: ['~/index.scss', '~/overlayscrollbars'],
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [vue()],
});
