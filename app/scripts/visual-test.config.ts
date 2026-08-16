import { defineConfig } from 'vite';
import path from 'node:path';
import os from 'node:os';

// 视觉引擎单测打包配置：scripts/visual-test.js 触发
const OUT = process.env.VISUAL_TEST_OUT || path.join(os.tmpdir(), 'aurora-visual-test');

export default defineConfig({
  build: {
    outDir: OUT,
    emptyOutDir: true,
    lib: {
      entry: path.join(__dirname, 'visual-test-entry.ts'),
      formats: ['cjs'],
      fileName: () => 'visual-test.cjs',
    },
    minify: false,
  },
});
