# 设计变量

数值来自 Figma 文件 `EfIzYMgSHIXhznjWTUPGeJ` 的变量集合「训录 / Apple」（浅色 = D，深色 = E）和「训录 / Geometry」，2026-10-18 导出。
**以 `packages/tokens/tokens.json` 为准**；`tokens.css` 由 `npm run build:tokens` 生成，请勿手改。Figma 变量改了，就同步改 `tokens.json` 再生成。

## 在 uni-app 里使用

1. 在 `App.vue` 的样式里引入 `packages/tokens/tokens.css`（变量同时声明在 `:root` 和 `page` 上）。
2. 在 `manifest.json` 开启 darkmode，页面才会跟随系统深浅色（参考 DCloud 的 DarkMode 适配指南）。
3. 训练页要固定深色时，给页面根节点加 `class="theme-dark"`，对应"我的"里的"训练页固定深色"。
4. 颜色一律用变量，例如 `color: var(--color-ink)`，不要在页面里写色值。

## 颜色

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--color-ink` | #1c1c1e | #f5f5f7 | 主要文字 |
| `--color-muted` | #727277 | #a3a3a8 | 次要文字、说明 |
| `--color-line` | #e5e5ea | #38383a | 分隔线、弹层把手 |
| `--color-accent` | #007aff | #c5f451 | 主色：主按钮、文字按钮、选中态 |
| `--color-on-accent` | #ffffff | #142000 | 主按钮上的文字 |
| `--color-soft` | #eaf2ff | #29331a | 主色浅底：选中的标签、下一组提示、说明卡片 |
| `--color-success` | #248a3d | #5bdd79 | 状态正常、进入推荐区间、已采纳、加重幅度 |
| `--color-sheet` | #ffffff | #1c1c1e | 底部弹层、反馈面板、确认弹窗 |
| `--color-inactive` | #f2f2f7 | #2c2c2e | 未选中、次要按钮底色、滚轮选中带 |
| `--color-warning` | #98630b | #ffbf55 | 状态关注、热身提醒文字 |
| `--color-warning-soft` | #fff2d9 | #392d14 | 状态关注、热身提醒的浅底 |
| `--color-danger` | #d12f35 | #ff6970 | 建议减载、删除等不可撤销操作 |
| `--color-danger-soft` | #fdecec | #3b1d22 | 建议减载的浅底 |
| `--color-on-danger` | #ffffff | #ffffff | 危险按钮上的文字 |
| `--color-bg` | #f2f2f7 | #000000 | 页面背景 |
| `--color-surface` | #ffffff | #1c1c1e | 卡片、分组列表 |
| `--color-timer` | #1c1c1e | #f5f5f7 | 间隔计时（进入推荐区间前）；进入区间后用 `--color-success` |

Figma 里还有 `color/board`（#e9ebf0 / #232326），只用作画板底色，App 里不用，没有导出。

规则：状态色（success、warning、danger）只表达状态，同时配文字，不只靠颜色；间隔计时不倒计时、不用主色。

## 间距与圆角

- 间距：`--space-0`、`4`、`8`、`12`、`16`、`20`、`24`、`28`、`32`、`40`、`48`、`64`（单位 px）。
- 圆角：`--radius-0`、`8`、`12`、`16`、`18`、`20`、`24`、`28`、`32`、`36`、`40`、`44`，`--radius-999` 用于胶囊形。

Figma 画板宽 390，与 iPhone 的点（pt）一致，所以直接用 px。uni-app 的 rpx 以 750 为满宽，大屏手机上会把字和按钮一起放大；字号、按钮高度、触控区域建议用 px，只有需要随屏宽伸缩的布局宽度才用 rpx。

## 字体

- iOS 用系统字体：`--font-family` 依次是 `-apple-system`、`SF Pro Text`、`PingFang SC`。Figma 里中文用 Noto Sans SC 代替苹方，拉丁字母和数字用 SF Pro。
- 设计稿里用到的字号：11、12、13、15、17、20、22、24、28、32、34、56、96（`--font-11` … `--font-96`）；96 是间隔计时的大号数字。
- 字重：Regular 400、Medium 500（中文）、Semibold 600（SF Pro）。
- 计时和重量等跳动的数字加 `font-variant-numeric: tabular-nums`，避免抖动。
- SF Pro 不能打包进 App，Android 版要另选可商用字体（见流程规划第六节）。

## Figma 里 iOS 套件的颜色

部分系统控件直接用了 Apple iOS 26 UI Kit 的库变量，仿制控件时参考：

| 库变量 | 浅色 | 深色 | 用在 |
| --- | --- | --- | --- |
| Labels/Primary | #000000 | #ffffff | 状态栏时间等系统文字 |
| Labels/Tertiary | #3c3c43 30% | #ebebf5 30% | 开关（关闭时） |
| Fills/Tertiary | #767680 12% | #767680 24% | 分段控件底色 |
| Miscellaneous/Segmented Control - Selected Fill | #ffffff | #ffffff 27% | 分段控件选中块 |
| Accents/Green | #34c759 | #30d158 | 开关打开 |
| Separators/Vibrant | #e6e6e6 | #1a1a1a | 系统控件里的分隔线描边 |

标签栏的 Liquid Glass 效果参数（Figma）：Depth 16、Frost 7、Splay 6、Refraction 100、Dispersion 0、Light Angle −45°。uni-app 里用 `backdrop-filter: blur()` 加半透明底色近似。
