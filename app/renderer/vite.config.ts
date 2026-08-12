import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 渲染层由 Electron 以 file:// 加载,必须相对路径 base
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
