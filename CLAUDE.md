# 训录

给已有训练基础的人用的力量训练记录与分析 App：训练中每组只按一次"完成本组"，用滚轮确认重量、次数和还能再做几次（RIR）；练完由确定性规则引擎给出下次目标，状态下滑时提醒减载。

## 当前阶段

- 设计已定稿（Figma，见下文），建议引擎已完成（`packages/engine`，规则版本 1.0.0）。
- 下一步：在 `apps/mobile` 用 uni-app 搭 iOS 端，先做记录页和反馈面板的真机版，过第一道放行：5 名有训练基础的测试者都能在 5 秒内记下一组。

## 已确认的决定

- 技术栈：uni-app（Vue 3 + TypeScript），先做 iOS；Android 和微信小程序以后用同一套代码。
- 主题：D 浅色、E 深色两套同时做，跟随系统；训练页可固定深色（"我的"里的开关）。
- 英文界面暂缓，但所有界面文字都放进 i18n 词典，不写死在页面里。
- MVP 没有账号和服务器：数据全部存在手机本地 SQLite；每次"完成本组"、保存反馈都立即写库。
- 不做：动作教学、疼痛上报、组间歇统计与限制、热身组记录、心率与手表、饮食。
- 安全提示固定出现：开始训练时"先完成热身再开始记录，热身组不记录；训练中出现疼痛或不适，请立即停止该动作"；建议页底部"以上为训练参考，不构成医疗建议"。

## 仓库结构

```
packages/engine   建议引擎：纯 TypeScript，Vitest 测试
packages/tokens   设计变量：tokens.json 是源，tokens.css 由脚本生成
docs/             engine-spec.md（规则说明）、design-tokens.md（设计变量）
apps/mobile       uni-app 工程（下一步创建）
```

## 常用命令

```
npm install            安装依赖（Node 22）
npm test               跑全部测试
npm run typecheck      类型检查
npm run build:tokens   从 tokens.json 重新生成 tokens.css
```

## 引擎约定（必须遵守）

- 进阶逻辑只写在 `packages/engine`：页面里不自己算加重、减重或状态。
- 引擎保持纯函数：不引入 uni、plus、wx 或 DOM，不读时钟和存储，不放界面文字。日期用 `YYYY-MM-DD`，由 App 按用户时区传入；重量和增量用同一单位传入（kg 或 lb）。
- 阈值只在 `params.ts` 改。改了要升 `RULE_VERSION`、补测试、同步 `docs/engine-spec.md`。
- 任何改动后 `npm test` 必须全部通过，尤其是 `test/guardrails.property.test.ts`："超出加重上限的建议"必须始终为 0。
- 建议存进 suggestions 表时带上 `ruleVersion`、`ruleId`、`reason` 和用户决定（采纳 / 修改 / 忽略），用来回溯和调参。

## App 接入点

| 时机 | 调用 |
| --- | --- |
| 开始训练、预填之前 | `adjustForLayoff`：很久没练的动作先减重 |
| 每组保存反馈后 | `suggestNextSet`：下一组提示，点"应用"才改预填 |
| 训练结束 | `suggestNextTarget`（每个动作的下次目标）、`detectRecords`、`exerciseVolume`、`muscleSetCounts`、`bestSet` |
| 训练结束后 | `evaluateStatus`：首页状态卡与总结页顶部提醒 |
| 用户采纳减载 | `planDeload` |

建议卡片的文案按 `reason` 和 `detail` 从词典取，建议文案见 `docs/engine-spec.md`。

## App 侧约定（UI 阶段）

- 计时只存时间戳（开始记录、每组完成、结束训练），界面每秒重绘，回到前台立即重算；不倒计时，不限制组间歇。
- 记录页只有一个主按钮"完成本组"；反馈面板是重量、次数、RIR 三个滚轮，数值预填，重量按动作默认增量取值；关闭面板也保存；保存后 5 秒内可撤销。
- 颜色只用 `packages/tokens/tokens.css` 的变量：状态色只表达状态并配文字；间隔计时用 `--color-timer`，进入推荐区间变 `--color-success`。
- 字体用 `-apple-system`、`PingFang SC`；计时等跳动的数字加 `font-variant-numeric: tabular-nums`。字号、按钮高度、触控区域用 px。
- 训练中屏幕常亮、完成一组短震动；App 被系统关闭后重开提示"继续上次训练"。

## 设计稿（Figma）

文件：https://www.figma.com/design/EfIzYMgSHIXhznjWTUPGeJ

| 页面 | node id | 内容 |
| --- | --- | --- |
| 07 静态定稿 / 浅色 | 46:95 | 全部界面 79 屏 |
| 08 静态定稿 / 深色 | 46:96 | 全部界面 79 屏 |
| 09 总览与交互规范 | 46:97 | 总览、视觉与交互基础、共享组件 |
| 10 动作缩略图资源库 | 46:98 | 60 个动作缩略图 |
| 11 主流程复核与补充状态 | 83:748 | 连续主流程、原型出口、补充状态；**交互以这一页为准** |

- 变量集合「训录 / Apple」有浅色、深色两个 mode，已导出到 `packages/tokens`。
- 用 Figma MCP 读稿：先 `get_metadata` 看结构，再对具体画板 `get_design_context`；读到的代码只作参考，按本仓库的组件和变量改写。

## 相关文档

- `docs/engine-spec.md`：引擎规则、原因码与建议文案、需要确认的解释
- `docs/design-tokens.md`：颜色、间距、圆角、字体
- 方案审核与功能设计规划：https://claude.ai/artifact/JM6ecN4v6nwqjkpCc8HBoE
- 从设计到上架的流程规划：https://claude.ai/code/artifact/1cd6fa8f-d769-4865-ac63-4bbf4ce5ddd1
