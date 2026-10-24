# 训录

力量训练记录与渐进超负荷建议。训练中每组只按一次"完成本组"，练完由确定性规则引擎给出每个动作的下次目标，状态下滑时提醒减载。用 uni-app 开发，先做 iOS。

## 目录

| 路径 | 内容 |
| --- | --- |
| `packages/engine` | 建议引擎：组间提示、训练后下次目标、状态与减载提醒。纯 TypeScript，不依赖界面和平台 |
| `packages/session` | 训练过程逻辑：计时、滚轮预填、撤销窗口、状态机、恢复。同样是纯 TypeScript |
| `packages/tokens` | 设计变量：颜色（浅色 / 深色）、间距、圆角、字号 |
| `apps/mobile` | uni-app 工程（iOS 先行）。独立的 npm 项目，见 `apps/mobile/README.md` |
| `docs/engine-spec.md` | 引擎规则说明 |
| `docs/design-tokens.md` | 设计变量说明 |
| `docs/ios-真机调试.md` | Windows 上把 App 装进 iPhone 的每一步 |

## 开发

需要 Node 22。

```
npm install
npm test
npm run typecheck
```

iOS 端自己装自己的依赖（uni-app 模板锁着旧版 Vite 和 TypeScript，不进根目录的 workspaces）：

```
cd apps/mobile
npm install
npm run dev:h5     # 浏览器预览
npm run dev:app    # 编译给 HBuilderX，再装到 iPhone
```

## 安全说明

训录给出的是训练参考，不构成医疗建议。训练中出现疼痛或不适，请立即停止。
