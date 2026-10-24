import { fileURLToPath } from 'node:url';
import uni from '@dcloudio/vite-plugin-uni';
import { defineConfig } from 'vite';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// 仓库根目录：dev server 要能读到 apps/mobile 外面的 packages/*
const repoRoot = here('../../');

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': here('./src'),
      // 引擎和过程逻辑都是纯 TypeScript 源码包，直接按路径别名引用，不走 node_modules
      '@xunlu/engine': here('../../packages/engine/src/index.ts'),
      '@xunlu/session': here('../../packages/session/src/index.ts'),
      '@xunlu/tokens/tokens.css': here('../../packages/tokens/tokens.css'),
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
