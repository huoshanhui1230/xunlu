# 训录 · iOS 端（uni-app）

记录页和反馈面板的真机版。这一轮只做主流程的前半段：
开始训练 → 完成本组 → 三个滚轮确认 → 保存 → 看到下一组提示 → 应用。

首页、计划、总结不做；训练数据写死推日 6 个动作；动作缩略图用占位图。

## 为什么是独立的 npm 项目

`apps/mobile` **不在**根目录的 `workspaces` 里。uni-app 的模板把 Vite 锁在 5.2.8、
TypeScript 是 4.9，和根目录的 vitest 5 / TypeScript 6 对不上，混在一起装会互相顶掉。
所以这里自己装自己的依赖，引擎和设计变量用路径别名引用源码：

| 别名 | 指向 |
| --- | --- |
| `@` | `apps/mobile/src` |
| `@xunlu/engine` | `packages/engine/src/index.ts` |
| `@xunlu/session` | `packages/session/src/index.ts` |
| `@xunlu/tokens/tokens.css` | `packages/tokens/tokens.css` |

别名在 `vite.config.ts` 和 `tsconfig.json` 两处，改一个记得改另一个。

## 在浏览器里预览

```bash
cd apps/mobile
npm install
npm run dev:h5
```

打开终端里给出的地址（默认 <http://localhost:5173>），用浏览器的手机模拟（375 × 812）看。
切系统深浅色能看到 D / E 两套主题；控制台会打出每组的用时：

```
[训录] barbell-bench-press 第 1 组 用时 2.4 秒（confirm，直接确认）
```

这就是第一道放行要看的数 —— 从点「完成本组」到保存用了多久。同一个数也写进库里的
`sets.log_ms`，可以事后导出来统计。

H5 端的存储是**内存实现**，刷新页面就清空。「App 杀掉后重开继续」只有真机上才看得到，
那部分逻辑由 `packages/session` 的单元测试覆盖。

首次启动会灌一条 5 天前的推日记录，好让「上次同组对照」有东西可比。
不想要就把 `src/data/demo-history.ts` 里的 `SEED_DEMO_HISTORY` 改成 `false`。

## 装到 iPhone 上

见 [`docs/ios-真机调试.md`](../../docs/ios-真机调试.md)。

```bash
npm run dev:app      # 持续编译到 dist/dev/app，HBuilderX 导入这个目录
npm run build:app    # 一次性编译到 dist/build/app
```

## 其他命令

```bash
npm run typecheck    # vue-tsc，连带检查引擎和过程逻辑的源码
npm run build:h5     # 打 H5 产物
npm run sync:tokens  # 退路：把 tokens.css 复制进 src/styles（见下）
```

`sync:tokens` 平时用不上。App.vue 直接 `@import '@xunlu/tokens/tokens.css'`，
H5 和 App 两端都编得过（已验证）。万一以后某个平台的编译器不认工程目录外的 `@import`，
跑一次这个脚本，把 App.vue 里的路径换成 `./styles/tokens.generated.css` 即可。

## 代码怎么分

```
src/
  pages/start      MF02 开始训练弹层（背后只有训练日那张卡，首页不做）
  pages/workout    MF03 记录页 / MF04 反馈面板 / MF05 下一组提示 / MF05a 已应用
  components/      按画板切的组件：按钮、弹层、滚轮、提示卡、已保存卡
  storage/         Store 接口 + SQLite（App）+ 内存（H5）两套实现，表结构在 schema.ts
  services/        只碰平台的薄封装：每秒重绘、屏幕常亮、短震动
  data/            推日 6 个动作、演示用的上次训练
  locale/          界面文字；页面里不写死中文
  styles/          全局基础样式；颜色只用 tokens 变量
  utils/           日期、排版、建议卡文案
```

算法不在这里：加重、减重、下一组提示一律问 `@xunlu/engine`；
计时、预填、撤销窗口、状态机、恢复在 `@xunlu/session`，两个包都是纯函数、有单元测试。
