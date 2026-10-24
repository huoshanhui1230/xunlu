/**
 * 所有阈值集中在这里。改任何数值都要：升 RULE_VERSION、补测试、同步 docs/engine-spec.md。
 */

export const RULE_VERSION = '2.0.0';

export interface EngineParams {
  /** 规则版本：每条建议都记下它，方便回溯和调参 */
  readonly ruleVersion: string;
  /** 估算 1RM 只算这个次数及以内的组 */
  readonly e1rmMaxReps: number;
  /** 默认目标余力（还能再做几次） */
  readonly defaultTargetRir: number;
  /** 单个动作每次最多几组 */
  readonly maxSetsPerExercise: number;
  /** 最后几个工作组力竭（RIR 0）时，次数做到下限也算达标 */
  readonly relaxedLastSets: number;
  readonly intra: {
    /** 能完成的次数 ≥ ceil(次数上限 × 该倍数) 才提示加重 */
    readonly capacityFactor: number;
    /** 次数未到上限且 RIR ≥ 该值时，提示多做 1–2 次 */
    readonly moreRepsMinRir: number;
    /** 同一重量下"RIR 为 0 且次数不高于下限"的组达到这个数，不出组间加重提示 */
    readonly failureSetsAtMin: number;
    /** 同一动作每次训练最多加重几次（按实际加重计）；达到后不再提示加重 */
    readonly maxIncreasesPerSession: number;
  };
  readonly progression: {
    /** 连续几次达标可以加重 */
    readonly consecutiveHits: number;
    /** 一次达标且每组 RIR 都不低于该值也可以加重 */
    readonly singleHitMinRir: number;
    /** 一档超过加重上限时，次数上限先提高几次 */
    readonly extendRepsBy: number;
  };
  readonly layoff: {
    /** 超过这么多天没练 → 建议减 cut1；训练后从这次起重新计算 */
    readonly days1: number;
    readonly cut1: number;
    /** 超过这么多天没练 → 建议减 cut2 */
    readonly days2: number;
    readonly cut2: number;
  };
  readonly failure: {
    /** 连续第 2 次失败：重量 × (1 − cut) 后向下取整到增量，实际减 5–10% */
    readonly cut: number;
  };
  readonly plateau: {
    /** 最近几次没有提升算平台期 */
    readonly sessions: number;
  };
  readonly status: {
    /** "近 4 周" */
    readonly windowDays: number;
    /** 连续这么多天没练算中断，状态从中断后重新算 */
    readonly breakDays: number;
    readonly s1Drop: number;
    readonly s1Sessions: number;
    readonly s1MinExercises: number;
    readonly s2RirDrop: number;
    readonly s2MinExercises: number;
    readonly s3WindowDays: number;
    readonly s3MinExercises: number;
    readonly s4Days: number;
    /** 几个信号同时出现就建议减载 */
    readonly deloadSignals: number;
  };
  readonly deload: {
    /** 组数 × 该系数，向上取整 */
    readonly setFactor: number;
    /** 目标余力增加几次 */
    readonly extraRir: number;
    /** 减载周天数 */
    readonly days: number;
  };
}

export const DEFAULT_PARAMS: EngineParams = {
  ruleVersion: RULE_VERSION,
  e1rmMaxReps: 10,
  defaultTargetRir: 2,
  maxSetsPerExercise: 6,
  relaxedLastSets: 2,
  intra: { capacityFactor: 1.5, moreRepsMinRir: 3, failureSetsAtMin: 2, maxIncreasesPerSession: 1 },
  progression: { consecutiveHits: 2, singleHitMinRir: 2, extendRepsBy: 3 },
  layoff: { days1: 14, cut1: 0.1, days2: 28, cut2: 0.2 },
  failure: { cut: 0.05 },
  plateau: { sessions: 3 },
  status: {
    windowDays: 28,
    breakDays: 7,
    s1Drop: 0.05,
    s1Sessions: 2,
    s1MinExercises: 2,
    s2RirDrop: 2,
    s2MinExercises: 2,
    s3WindowDays: 7,
    s3MinExercises: 3,
    s4Days: 35,
    deloadSignals: 2,
  },
  deload: { setFactor: 0.5, extraRir: 2, days: 7 },
};

type ParamOverrides = {
  readonly [K in keyof EngineParams]?: EngineParams[K] extends object
    ? Partial<EngineParams[K]>
    : EngineParams[K];
};

/** 在默认参数上覆盖部分阈值（嵌套对象按字段合并） */
export function withParams(overrides: ParamOverrides, base: EngineParams = DEFAULT_PARAMS): EngineParams {
  const out: Record<string, unknown> = { ...base };
  const baseRecord = base as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const current = baseRecord[key];
    out[key] =
      value !== null && typeof value === 'object' && current !== null && typeof current === 'object'
        ? { ...(current as object), ...(value as object) }
        : value;
  }
  return out as unknown as EngineParams;
}
