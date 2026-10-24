/**
 * 退路：把 packages/tokens/tokens.css 复制到 src/styles/tokens.generated.css。
 *
 * 正常情况下 App.vue 直接 @import '@xunlu/tokens/tokens.css'（别名在 vite.config.ts 里）。
 * 如果某个平台的编译器不认工程目录外的 @import，就跑一次 `npm run sync:tokens`，
 * 把 App.vue 里的 @import 换成 './styles/tokens.generated.css'。
 *
 * 生成的文件别手改，改 packages/tokens/tokens.json 再 npm run build:tokens。
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../packages/tokens/tokens.css');
const target = resolve(here, '../src/styles/tokens.generated.css');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`tokens.css → ${target}`);
