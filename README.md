# 训录

力量训练记录与渐进超负荷建议。训练中每组只按一次"完成本组"，练完由确定性规则引擎给出每个动作的下次目标，状态下滑时提醒减载。用 uni-app 开发，先做 iOS。

## 目录

| 路径 | 内容 |
| --- | --- |
| `packages/engine` | 建议引擎：组间提示、训练后下次目标、状态与减载提醒。纯 TypeScript，不依赖界面和平台 |
| `packages/tokens` | 设计变量：颜色（浅色 / 深色）、间距、圆角、字号 |
| `docs/engine-spec.md` | 引擎规则说明 |
| `docs/design-tokens.md` | 设计变量说明 |

## 开发

需要 Node 22。

```
npm install
npm test
npm run typecheck
```

## 安全说明

训录给出的是训练参考，不构成医疗建议。训练中出现疼痛或不适，请立即停止。
