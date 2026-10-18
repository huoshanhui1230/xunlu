// 从 tokens.json 生成 tokens.css。用法：node build.mjs（生成）、node build.mjs --check（只检查是否最新）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const tokens = JSON.parse(readFileSync(here('tokens.json'), 'utf8'));

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const colorVars = (mode, indent) =>
  Object.entries(tokens.color)
    .filter(([name]) => name !== 'board')
    .map(([name, v]) => `${indent}--color-${kebab(name)}: ${v[mode]};`)
    .join('\n');

const css = `/* 由 build.mjs 从 tokens.json 生成，请勿手改。来源：${tokens.$source} */

:root,
page {
${colorVars('light', '  ')}
${tokens.space.map((n) => `  --space-${n}: ${n}px;`).join('\n')}
${tokens.radius.map((n) => `  --radius-${n}: ${n}px;`).join('\n')}
  --font-family: ${tokens.font.family};
${tokens.font.sizes.map((n) => `  --font-${n}: ${n}px;`).join('\n')}
${Object.entries(tokens.font.weights).map(([k, n]) => `  --weight-${k}: ${n};`).join('\n')}
  color-scheme: light dark;
}

/* 跟随系统深色（App 端需在 manifest.json 开启 darkmode） */
@media (prefers-color-scheme: dark) {
  :root,
  page {
${colorVars('dark', '    ')}
  }
}

/* 局部固定主题：训练页可加 .theme-dark 固定深色 */
.theme-light {
${colorVars('light', '  ')}
  color-scheme: light;
}

.theme-dark {
${colorVars('dark', '  ')}
  color-scheme: dark;
}
`;

const out = here('tokens.css');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    // 文件不存在时按"不是最新"处理
  }
  if (current !== css) {
    console.error('tokens.css 不是最新的：请运行 npm run build:tokens');
    process.exit(1);
  }
  console.log('tokens.css 是最新的');
} else {
  writeFileSync(out, css);
  console.log('已生成 tokens.css');
}
