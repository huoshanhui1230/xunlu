/**
 * 训录建议引擎 · 类型
 *
 * 单位：引擎不关心 kg 还是 lb。重量和增量用同一单位传入，结果也是这个单位。
 * 日期：一律用本地日期字符串 YYYY-MM-DD，由调用方按用户时区生成。
 * 文案：引擎只返回规则编号、原因码和数字，界面文字放在 App 的词典里（见 docs/engine-spec.md）。
 */

/** 负重方式 */
export type LoadType =
  /** 总重：杠铃按含杆总重，器械按配重 */
  | 'total'
  /** 单侧：哑铃按每只记录；容量按两侧合计 */
  | 'perSide'
  /** 自重加负重：重量 = 额外负重，可为 0（引体、双杠臂屈伸、俯卧撑等） */
  | 'bodyweightPlus'
  /** 助力：重量 = 助力，越小越难（助力引体等） */
  | 'assisted';

export interface RepRange {
  readonly min: number;
  readonly max: number;
}

/** 动作配置，来自动作库或计划 */
export interface ExerciseConfig {
  readonly id: string;
  readonly loadType: LoadType;
  /** 默认增量；0 表示只加次数、不出加重建议 */
  readonly increment: number;
  /** 推荐次数区间 */
  readonly repRange: RepRange;
  /** 加重上限档：上肢与孤立动作 0.05，下肢复合动作 0.10 */
  readonly maxIncreasePct: number;
  /** 复合动作（主项），用于保护杠提醒 */
  readonly compound?: boolean;
  /** 计划组数；不填时按本次工作组数 */
  readonly plannedSets?: number;
  /** 主动肌：每组计 1 组 */
  readonly primaryMuscles?: readonly string[];
  /** 协同肌：每组计 0.5 组 */
  readonly secondaryMuscles?: readonly string[];
}

/** V1 的组标签：带标签的组不参与加重判断 */
export type SetTag = 'drop' | 'failure';

export interface SetRecord {
  readonly weight: number;
  readonly reps: number;
  /** 还能再做几次（RIR）；null 或不填表示没填 */
  readonly rir?: number | null;
  readonly tag?: SetTag;
}

/** 某个动作在一次训练里的全部记录组 */
export interface ExerciseSession {
  /** 训练日期 YYYY-MM-DD */
  readonly date: string;
  /** 按完成顺序 */
  readonly sets: readonly SetRecord[];
  /** 减载周里的训练：不参与进阶判断和状态信号 */
  readonly deload?: boolean;
}

/** 下次目标，采纳后用于下次训练预填 */
export interface Target {
  readonly weight: number;
  readonly sets: number;
  /** 每组目标次数，长度等于 sets */
  readonly reps: readonly number[];
  /** 生效的次数区间；"上限 +3"时是延长后的区间 */
  readonly repRange: RepRange;
  /** 次数上限是否已临时提高（一档超过加重上限时） */
  readonly extended: boolean;
  /** 目标余力 */
  readonly targetRir: number;
  /** 已按长时间没练减过（adjustForLayoff 设置） */
  readonly layoffAdjusted?: boolean;
}

/** 依据：文献或规则来源，见 docs/engine-spec.md */
export type CitationKey =
  | 'ACSM2009'
  | 'ACSM2026'
  | 'Helms2016'
  | 'Zourdos2016'
  | 'Refalo2023'
  | 'Bell2023'
  | 'Rogerson2024'
  | 'engineering'
  | 'product';

export interface WeightChange {
  readonly from: number;
  readonly to: number;
  /** 相对变化；助力、自重加负重或原重量为 0 时无法计算，为 null */
  readonly pct: number | null;
}

// ---------------------------------------------------------------------------
// A. 组间提示
// ---------------------------------------------------------------------------

export type IntraRuleId = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

/**
 * need_rir：第 1 组没填 RIR，提示填写
 * increase：加一档，给具体重量（一档在加重上限内）
 * nudge：余力充足但一档超过上限或无法确认幅度，只提醒方向，不给数值
 * add_reps：重量不变，多做 1–2 次
 * decrease：减一档
 * hold：保持
 */
export type IntraKind = 'need_rir' | 'increase' | 'nudge' | 'add_reps' | 'decrease' | 'hold';

/** 能完成的次数够了却没提示加重的原因 */
export type IntraBlock = 'deload' | 'already_increased' | 'to_failure' | 'guardrail';

/** 为什么只提醒方向、不给具体数值 */
export type NudgeReason = 'step_exceeds_cap' | 'cap_unverifiable' | 'reps_only' | 'assistance_done';

/** 组间提示用的 RIR 来自哪里 */
export type RirSource = 'entered' | 'previous' | 'none';

export interface SetHint {
  readonly ruleId: IntraRuleId;
  readonly kind: IntraKind;
  /** 下一组预填重量：只有 increase、decrease 会改变，其余等于本组重量 */
  readonly weight: number;
  /** 下一组目标次数；need_rir、nudge 没有（不给具体数值） */
  readonly reps?: { readonly low: number; readonly high: number };
  /** nudge：可以提醒的方向 */
  readonly nudge?: readonly ('weight' | 'reps')[];
  readonly nudgeReason?: NudgeReason;
  /** 能完成的次数 = 本组次数 + RIR；RIR 未知时只算次数 */
  readonly capacity: number;
  /** 提示加重的门槛 = ceil(次数上限 × 1.5) */
  readonly threshold: number;
  /** 本组填写 / 沿用本次该动作上一组 / 未知 */
  readonly rirSource: RirSource;
  readonly change: WeightChange;
  readonly increaseBlockedBy?: IntraBlock;
  readonly basis: readonly CitationKey[];
  readonly ruleVersion: string;
}

// ---------------------------------------------------------------------------
// B. 训练后下次目标
// ---------------------------------------------------------------------------

export type PostRuleId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'DL';
export type SuggestionKind = 'increase' | 'add_reps' | 'hold' | 'reduce' | 'plateau' | 'deload';

export type PostReason =
  /** B1 第一次记录该动作 */
  | 'baseline'
  /** B2 很久没练后的第一次：以这次表现为新基准，保持重量 */
  | 'return_baseline'
  /** B3 第一次失败：维持重量，先做到下限 */
  | 'failure_first'
  /** B3 连续第 2 次失败：减重 5–10% */
  | 'failure_repeat'
  /** B3 连续第 2 次失败，但重量已无法再减 */
  | 'cannot_reduce'
  /** B4 连续 2 次达标 */
  | 'increase_consecutive'
  /** B4 一次达标且每组 RIR ≥ 2 */
  | 'increase_rir'
  /** B4 做满"上限 +3"后换重 */
  | 'increase_after_extension'
  /** B4 一档超过上限或无法确认幅度：先把次数上限提高 3 次 */
  | 'extend_reps'
  /** B4 增量为 0 的动作：只加次数 */
  | 'reps_only'
  /** B4 助力已减到 0：只加次数 */
  | 'assistance_done'
  /** B5 第一次达标，再确认一次 */
  | 'confirm_once_more'
  /** B5 每组都到上限，但有组做到力竭 */
  | 'at_max_with_failure'
  /** B5 维持重量、加次数 */
  | 'progress_reps'
  /** B6 平台期 */
  | 'plateau'
  /** 减载期间：暂停进阶，沿用减载前目标 */
  | 'deload_pause'
  /** 护栏拦下（正常不会出现） */
  | 'guardrail_blocked';

export type NoteCode = 'leave_2_rir' | 'use_spotter' | 'try_easier_variation' | 'switch_to_bodyweight';

export interface PlateauOption {
  readonly kind: 'change_rep_range' | 'change_variation' | 'reduce_once';
  readonly target?: Target;
}

export interface Suggestion {
  readonly ruleId: PostRuleId;
  readonly kind: SuggestionKind;
  readonly reason: PostReason;
  readonly target: Target;
  readonly change: WeightChange;
  /** 离加重还差几次（各工作组距生效上限的差之和）；换了重量时为 null */
  readonly gapToIncrease: number | null;
  readonly basis: readonly CitationKey[];
  readonly notes: readonly NoteCode[];
  /** 文案用到的数字，如 gapDays、cut、min、max、step */
  readonly detail: Readonly<Record<string, number>>;
  readonly plateauOptions?: readonly PlateauOption[];
  /** 只在被护栏拦下时出现 */
  readonly violations?: readonly string[];
  readonly ruleVersion: string;
}

// ---------------------------------------------------------------------------
// C. 状态与减载
// ---------------------------------------------------------------------------

export type SignalId = 'S1' | 'S2' | 'S3' | 'S4';

export interface StatusSignal {
  readonly id: SignalId;
  readonly exerciseIds: readonly string[];
  /** S4：已连续训练的天数 */
  readonly days?: number;
}

export type StatusLevel = 'normal' | 'watch' | 'deload_suggested';

export interface StatusResult {
  readonly level: StatusLevel;
  readonly signals: readonly StatusSignal[];
  readonly inDeload: boolean;
  /** 建议减载被"推迟一周"暂时降为关注 */
  readonly snoozed: boolean;
  /** 当前训练段的起点（状态信号从这天算起） */
  readonly blockStart: string;
  readonly ruleVersion: string;
}
