/**
 * apps/mobile 自己不装 Vitest（模板锁着旧版 Vite），这份配置由根目录的 Vitest 读取：
 * 根目录 npm test 会带上它。只放不依赖 uni 的存储测试。
 *
 * tsconfig 单独指一份：工程的 tsconfig.json 继承 @vue/tsconfig，那是 apps/mobile 自己的依赖，
 * 没在这里 npm install 时找不到，转译就报错。根目录 npm test 不该要求先装 apps/mobile。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  tsconfig: here('./test/tsconfig.json'),
  resolve: {
    alias: {
      '@': here('./src'),
      '@xunlu/engine': here('../../packages/engine/src/index.ts'),
      '@xunlu/session': here('../../packages/session/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
