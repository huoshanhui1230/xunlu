# 训录建议引擎 · 规则说明

规则版本 **1.0.0**。对应方案第八节，代码在 `packages/engine/src`，阈值集中在 `params.ts`。
本文写清楚每条规则怎么实现、返回什么，以及实现时对方案做的解释（末节，需要教练和产品确认）。

## 什么时候调用

| 时机 | 函数 | 作用 |
| --- | --- | --- |
| 开始训练、预填之前 | `adjustForLayoff` | 很久没练的动作先减重（B2 回归） |
| 每组保存反馈后 | `suggestNextSet` | 下一组提示（A） |
| 训练结束 | `suggestNextTarget` | 每个动作的下次目标（B） |
| 训练结束 | `detectRecords`、`exerciseVolume`、`muscleSetCounts`、`bestSet` | 总结页的新纪录、容量、肌群组数、最佳组 |
| 训练结束后 | `evaluateStatus` | 状态与减载提醒（C） |
| 用户采纳减载 | `planDeload` | 生成减载周目标 |

引擎是纯函数：同样的输入永远得到同样的输出，不读时钟、不读存储、不含界面文字。

## 共用约定

- **单位**：引擎不区分 kg 和 lb。重量和增量用同一单位传入，结果也是这个单位；lb 用户传 lb 的默认增量。
- **日期**：本地日期字符串 `YYYY-MM-DD`，由 App 按用户时区生成。
- **文案**：引擎返回规则编号（如 `B4`）、原因码（如 `increase_consecutive`）和数字（`detail`），文字放在 App 的词典里，建议文案见下文。
- **记录组**：带标签的组（V1 的递减组、力竭组）不参与判断，但计入容量。
- **工作重量**：本次组数最多的重量；组数相同取更难的（助力取更小）。混合重量时，"达标"和"推进"只看工作重量下的组。
- **达标**：每个工作组都做到次数上限，且本次没有任何一组 RIR 为 0。
- **失败**：本次任一组低于次数下限，且该组 RIR 为 0 或没填。
- **离加重还差**：各工作组距生效上限的差之和。
- **估算 1RM**：Epley 公式 `w × (1 + r / 30)`，只算 1–10 次的组，只看趋势。

### 负重方式

| 负重方式 | 例子 | 加一档 | 减一档 | 能否算加重幅度 | 容量 | 估算 1RM |
| --- | --- | --- | --- | --- | --- | --- |
| `total` 总重 | 杠铃（含杆）、器械 | +增量 | −增量 | 能 | 重量 × 次数 | 算 |
| `perSide` 单侧 | 哑铃（每只） | +增量 | −增量 | 能 | 2 × 重量 × 次数 | 算 |
| `bodyweightPlus` 自重加负重 | 引体、双杠、俯卧撑 | +增量 | −增量（到 0 为止） | 不能（不用体重） | 额外负重 × 次数 | 不算 |
| `assisted` 助力 | 助力引体 | −增量助力（到 0 为止） | +增量助力 | 不能 | 不计 | 不算 |

增量为 0 的动作（俯卧撑、卷腹）只加次数，从不改重量。

## A. 组间提示 `suggestNextSet`

"能完成的次数" = 本组次数 + RIR（没填 RIR 只算次数）。门槛 = ceil(次数上限 × 1.5)，例如 6–8 次的门槛是 12。从上往下取第一条命中的：

| 规则 | 条件 | 下一组提示 |
| --- | --- | --- |
| A1 加重 | 能完成的次数 ≥ 门槛，且没有被挡住 | 加一档，次数目标回到下限 |
| A2 加次数 | 次数 < 上限，且 RIR ≥ 3 | 重量不变，多做 1–2 次（不超过上限） |
| A3 减重 | 次数 < 下限，且 RIR 为 0 或没填 | 减一档（减不了就保持） |
| A4 保持 | 其余 | 保持当前重量 |

A1 被挡住时继续往下判断，并在 `increaseBlockedBy` 写明原因：`conservative`（保守模式）、`deload`（减载周）、`limit_reached`（本次该动作已出过加重提示）、`to_failure`（同一重量已有 2 组 RIR 为 0）、`reps_only`（增量为 0）、`assistance_done`（助力已是 0）、`cap_unverifiable`（自重加负重或助力，无法确认幅度）、`step_exceeds_cap`（一档超过加重上限）。

建议文案：A1"余力充足，下一组试试 {weight} × {reps.low}"；A2"重量不变，下一组争取 {reps.low}–{reps.high} 次"；A3"这组没做到下限，下一组减到 {weight}"；A4"下一组保持 {weight}"。

## B. 训练后下次目标 `suggestNextTarget`

按顺序判断，命中即停；B6 叠加在结果上。输入 `currentTarget` 是这次在用的目标，用来延续"上限 +3"和回归减重的状态。

| 规则 | 条件 | 下次目标 |
| --- | --- | --- |
| B1 基线 | 第一次记录该动作 | 维持重量，先重复本次表现；提示每组留 2 次左右余力 |
| B2 回归 | 距上次超过 14 天（超过 28 天），且本次没按减过的重量练 | 减 10%（20%），向下取整到增量；次数沿用本次 |
| B3 失败 | 本次失败 | 第 1 次：维持重量，每组先做到下限；连续第 2 次：减 5%，向下取整到增量（实际 5–10%），次数回到下限 |
| B4 加重 | 达标，且"上一次也在同一重量达标"或"本次每组 RIR ≥ 2"（保守模式只认前者） | 加一档，次数回到下限 |
| B5 推进 | 其余 | 维持重量；未到上限的组 +1 次 |
| B6 平台期 | 重量连续 4 次不变，最近 3 次的平均估算 1RM 都没超过同重量下此前最佳 | 目标不变，附三个选项：换次数区间、换变式、这个动作先减量一次（组数减半、重量不变） |
| DL 减载 | 当前处于减载周 | 原样返回减载前的目标，暂停加重 |

加重幅度：一档不超过上限（上肢与孤立 5%，下肢复合 10%；保守模式一律 5%）。一档超过上限、或负重方式无法确认幅度时，先把次数上限提高 3 次（`extend_reps`），在延长后的上限再次满足加重条件才换重（`increase_after_extension`，这时允许超过上限，保守模式除外）。

### 原因码与建议文案

| 原因码 | 规则 | 类型 | 建议文案（示例） | `detail` |
| --- | --- | --- | --- | --- |
| `baseline` | B1 | hold | 先保持 {weight}，重复本次表现 | — |
| `layoff` | B2 | reduce | 距上次 {gapDays} 天，下次 {weight}（{pct}），重新爬升 | gapDays、cut |
| `failure_first` | B3 | hold | {weight}，先让每组都做到 {min} 次 | min |
| `failure_repeat` | B3 | reduce | 下次 {weight}（{pct}），重新爬升 | min |
| `cannot_reduce` | B3 | hold | 重量已无法再减，先换个更容易的变式 | min |
| `increase_consecutive` | B4 | increase | 下次 {weight}（+{pct}），每组从 {min} 次起。原因：已连续 2 次训练每组都做到上限 | step |
| `increase_rir` | B4 | increase | 同上。原因：本次每组都做到上限，且都还能再做 2 次以上 | step |
| `increase_after_extension` | B4 | increase | 下次换 {weight}，每组从 {min} 次起。原因：已做满延长后的上限 | step、cap、stepPct |
| `extend_reps` | B4 | add_reps | 一档 {step} 约 +{stepPct}，超过 {cap} 上限：先把次数做到 {newMax} 次再加重 | step、cap、stepPct、newMax |
| `step_exceeds_conservative_cap` | B4 | hold | 保守模式下一档超过 5%：换更小的增量或关闭保守模式后才会加重 | step、cap、stepPct |
| `reps_only` | B4 | add_reps | 自重动作不加重，下次每组 +1 次 | — |
| `assistance_done` | B4 | add_reps | 已经不需要助力，可以改记为自重动作 | — |
| `confirm_once_more` | B5 | hold | 保持 {weight}，再达标一次就加重 | max |
| `at_max_with_failure` | B5 | hold | 保持 {weight}，每组都到上限了，下次留 1–2 次余力再达标 | max |
| `progress_reps` | B5 | add_reps | 保持 {weight}，争取每组 {reps}（离加重还差 {gapToIncrease} 次） | max |
| `plateau` | B6 | plateau | 最近 3 次没有提升：换个次数区间、换变式，或这个动作先减量一次 | sessions |
| `deload_pause` | DL | deload | 减载周：保持目标，暂停加重 | — |
| `guardrail_blocked` | — | hold | 不应出现；出现说明规则有错误，需要上报 | — |

`stepPct` 只在负重方式能算幅度时出现。提示码 `notes`：`leave_2_rir`（每组留 2 次左右余力）、`use_spotter`（主项目标 RIR ≤ 1 时提醒保护杠或保护者）、`try_easier_variation`（换更容易的变式）、`switch_to_bodyweight`（改记为自重动作）。

## C. 状态与减载 `evaluateStatus`

| 信号 | 判断 |
| --- | --- |
| S1 表现下滑 | 2 个及以上动作：最近 2 次的最佳估算 1RM 都比近 4 周最佳低 5% 以上 |
| S2 同重量更吃力 | 2 个及以上动作：最近一次里同重量、同次数的组，RIR 平均比此前低 2 或更多 |
| S3 多个动作停滞 | 最近 7 天内 3 个及以上动作命中失败（B3）或平台期（B6） |
| S4 连续训练时间 | 当前训练段已满 35 天 |

0 个信号为正常，1 个为关注，2 个及以上为建议减载。用户选"推迟一周"后传 `snoozedUntil`，期间建议减载降为关注。减载周内不计算信号（`inDeload: true`）。

`planDeload`：组数 × 0.5 向上取整（3→2、4→2、5→3），重量不变，次数取区间下限，目标 RIR +2，持续 7 天。

## 护栏

`guardrails.ts` 在 A、B 的结果出来后独立复核一遍，不通过就退回"保持"并带上 `violations`。`test/guardrails.property.test.ts` 用随机输入（含偏离建议、递减组、减载、长时间没练）各跑几百到几千次，另写一套独立判断，保证下面每条都成立：

1. 加重一次只加一档。
2. 加重时机：连续 2 次达标，或一次达标且每组 RIR ≥ 2；保守模式只认前者。
3. 加重幅度不超过上限；只有做满"上限 +3"后才可超过；保守模式一律 ≤ 5%。
4. 同一重量下 RIR 为 0 的组达到 2 组时不加重。
5. 加重时不同时加组，也不提高次数目标。
6. 单个动作最多 6 组。
7. 减载期间不出加重建议。
8. 组间提示只建议一档，能完成的次数达到门槛才提示加重，同一动作每次训练最多提示一次，保守模式不提示。

## 参数（`DEFAULT_PARAMS`）

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `e1rmMaxReps` | 10 | 估算 1RM 只算这个次数及以内的组 |
| `defaultTargetRir` | 2 | 默认目标余力 |
| `maxSetsPerExercise` | 6 | 单个动作每次最多几组 |
| `conservativeMaxIncreasePct` | 0.05 | 保守模式加重上限 |
| `maxFailureSets` | 2 | 同一重量下 RIR 为 0 的组达到这个数不加重 |
| `intra.capacityFactor` | 1.5 | 组间加重门槛倍数 |
| `intra.moreRepsMinRir` | 3 | 组间"多做 1–2 次"的 RIR 门槛 |
| `intra.maxIncreaseHints` | 1 | 每个动作每次训练最多几次组间加重提示 |
| `progression.consecutiveHits` | 2 | 连续几次达标可加重 |
| `progression.singleHitMinRir` | 2 | 一次达标时每组 RIR 下限 |
| `progression.extendRepsBy` | 3 | 一档超过上限时次数上限提高几次 |
| `layoff` | 14 天 −10%，28 天 −20% | 回归减重 |
| `failure.cut` | 0.05 | 连续失败减重比例（向下取整后为 5–10%） |
| `plateau.sessions` | 3 | 平台期看最近几次 |
| `status.windowDays` | 28 | "近 4 周" |
| `status.breakDays` | 7 | 连续几天没练算中断 |
| `status.s4Days` | 35 | 连续训练满 5 周 |
| `deload` | 组数 × 0.5、RIR +2、7 天 | 减载周 |

改任何阈值：升 `RULE_VERSION`、补测试、同步本文。

## 依据

| 键 | 文献 |
| --- | --- |
| `ACSM2009` | Ratamess NA, et al. Progression Models in Resistance Training for Healthy Adults. Med Sci Sports Exerc. 2009;41(3):687–708. |
| `ACSM2026` | Currier BS, et al. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Med Sci Sports Exerc. 2026;58(4):851–872. |
| `Helms2016` | Helms ER, et al. Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training. Strength Cond J. 2016;38(4):42–49. |
| `Zourdos2016` | Zourdos MC, et al. Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve. J Strength Cond Res. 2016;30(1):267–275. |
| `Refalo2023` | Refalo MC, et al. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy. Sports Med. 2023;53(3):649–665. |
| `Bell2023` | Bell L, et al. Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach. Sports Med Open. 2023;9:87. |
| `Rogerson2024` | Rogerson D, et al. Deloading Practices in Strength and Physique Sports: A Cross-sectional Survey. Sports Med Open. 2024;10:26. |
| `engineering` | 保守的工程规则，上线后按采纳率和反馈调整 |
| `product` | 产品规则，没有现成的文献数值 |

## 需要确认的解释

方案没写到或写得不够细的地方，实现时按"更保守、少误判"的方向处理。请教练和产品逐条确认：

1. **工作重量**：一次训练用过多个重量时，按组数最多的重量判断达标和推进；组数相同取更难的。
2. **达标与失败看全部组**：只要本次有任一组 RIR 为 0 就不算达标；工作重量以外的组（如中途减重后的组）低于下限且力竭，也算失败。
3. **组间提示没填 RIR**：低于下限时视同力竭，提示减一档，与训练后第 3 条一致。
4. **组间提示的加重上限**：一档超过上限、或自重加负重和助力动作无法确认幅度时，不出加重提示，改按后续规则给"多做 1–2 次"或"保持"。
5. **组间提示的力竭护栏**：同一重量下已有 2 组 RIR 为 0 时，不出加重提示。
6. **组间提示"最多一次"怎么数**：`increaseHintsUsed` 建议按已显示的加重提示计，用户忽略了也算。
7. **回归拆成两处**：开始训练时用 `adjustForLayoff` 先减，让回归后的第一次训练就变轻；训练后第 2 条只在本次比减后的重量还重时才触发，避免重复减。
8. **减重向下取整**：保证减得不少于标称比例。小重量时可能多减，例如 20 kg 连续失败减到 17.5 kg（−12.5%）；80 kg 回归减 10% 得 70 kg（−12.5%）。
9. **连续 2 次达标要同一重量**：换过重量的两次不算连续。
10. **自重加负重与助力**：个人档案不参与计算，无法确认加重幅度，一律先走"上限 +3"再加一档；助力动作"加重" = 减一档助力；两者都不算估算 1RM，自重加负重的容量只算额外负重，助力不计容量。
11. **保守模式与"上限 +3"**：保守模式加重一律不超过 5%，一档超过 5% 时做满上限 +3 次后也保持，提示换更小的增量或关闭保守模式。
12. **平台期**：只在工作重量连续 4 次不变时判断，用工作组的平均估算 1RM 与同重量下此前的最佳比较；只叠加在"推进""保持（力竭）""第一次失败"三种结果上。原因：按最佳组比较，会把"后几组还在加次数"或"减重后重新爬升"误判为平台期。
13. **状态的时间窗**：从当前训练段算起，即最近一次连续 7 天以上没练之后、上次减载结束、开始使用三者中最晚的一天。中途停练一周以上视为已经休整，S4 重新计时。
14. **S2 怎么比**：最近一次里能对上"同重量、同次数"的组，用此前这些组 RIR 的平均值比较，匹配到的组平均低 2 或更多才算。
15. **减载期间**：不计算状态信号，首页显示减载周；训练后原样返回减载前的目标。
16. **减载组数**：减半向上取整（3→2、4→2、5→3），落在方案"减约 1/3 到 1/2"的范围内。
17. **增量为 0 的动作**：达标后每组 +1 次，次数可以超过区间上限；回归时次数按比例减。
