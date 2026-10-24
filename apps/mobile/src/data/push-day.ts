/**
 * 推日：本轮写死的训练数据。
 *
 * 计划页这次不做，所以训练日直接写在代码里，不建 plans 表。
 * 每个动作三件事：给引擎的配置（负重方式、增量、次数区间、加重上限）、推荐组间歇、第一次练的目标。
 * 动作名在词典里按 id 取（locale/zh-Hans.ts 的 exercise.*），这里不写中文。
 */
import type { ExerciseConfig, Target } from '@xunlu/engine';
import type { RestRange } from '@xunlu/session';

export interface ExerciseMeta {
  readonly config: ExerciseConfig;
  /** 推荐组间歇：计时走到下限就算进入推荐区间 */
  readonly rest: RestRange;
  /** 还没有历史时用的起始目标 */
  readonly startTarget: Target;
  /** 动作缩略图，本轮一律占位图 */
  readonly thumb: string;
}

const PLACEHOLDER_THUMB = 'placeholder';

function startTarget(weight: number, sets: number, reps: number, range: { min: number; max: number }): Target {
  return {
    weight,
    sets,
    reps: Array.from({ length: sets }, () => reps),
    repRange: range,
    extended: false,
    targetRir: 2,
  };
}

export const PUSH_DAY_ID = 'push';

export const PUSH_DAY: readonly ExerciseMeta[] = [
  {
    config: {
      id: 'barbell-bench-press',
      loadType: 'total',
      increment: 2.5,
      repRange: { min: 6, max: 8 },
      maxIncreasePct: 0.05,
      compound: true,
      plannedSets: 3,
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'front-delts'],
    },
    rest: { minSec: 120, maxSec: 180 },
    startTarget: startTarget(80, 3, 8, { min: 6, max: 8 }),
    thumb: PLACEHOLDER_THUMB,
  },
  {
    config: {
      id: 'incline-dumbbell-press',
      loadType: 'perSide',
      increment: 2,
      repRange: { min: 8, max: 12 },
      maxIncreasePct: 0.05,
      compound: true,
      plannedSets: 3,
      primaryMuscles: ['chest'],
      secondaryMuscles: ['front-delts', 'triceps'],
    },
    rest: { minSec: 120, maxSec: 180 },
    startTarget: startTarget(24, 3, 10, { min: 8, max: 12 }),
    thumb: PLACEHOLDER_THUMB,
  },
  {
    config: {
      id: 'seated-dumbbell-shoulder-press',
      loadType: 'perSide',
      increment: 2,
      repRange: { min: 8, max: 12 },
      maxIncreasePct: 0.05,
      compound: true,
      plannedSets: 3,
      primaryMuscles: ['front-delts'],
      secondaryMuscles: ['triceps'],
    },
    rest: { minSec: 120, maxSec: 180 },
    startTarget: startTarget(18, 3, 10, { min: 8, max: 12 }),
    thumb: PLACEHOLDER_THUMB,
  },
  {
    config: {
      id: 'dumbbell-lateral-raise',
      loadType: 'perSide',
      increment: 1,
      repRange: { min: 12, max: 15 },
      maxIncreasePct: 0.05,
      plannedSets: 3,
      primaryMuscles: ['side-delts'],
    },
    rest: { minSec: 60, maxSec: 120 },
    startTarget: startTarget(8, 3, 13, { min: 12, max: 15 }),
    thumb: PLACEHOLDER_THUMB,
  },
  {
    config: {
      id: 'cable-triceps-pushdown',
      loadType: 'total',
      increment: 2.5,
      repRange: { min: 10, max: 15 },
      maxIncreasePct: 0.05,
      plannedSets: 3,
      primaryMuscles: ['triceps'],
    },
    rest: { minSec: 60, maxSec: 120 },
    startTarget: startTarget(25, 3, 12, { min: 10, max: 15 }),
    thumb: PLACEHOLDER_THUMB,
  },
  {
    config: {
      id: 'cable-overhead-triceps-extension',
      loadType: 'total',
      increment: 2.5,
      repRange: { min: 10, max: 15 },
      maxIncreasePct: 0.05,
      plannedSets: 2,
      primaryMuscles: ['triceps'],
    },
    rest: { minSec: 60, maxSec: 120 },
    startTarget: startTarget(20, 2, 12, { min: 10, max: 15 }),
    thumb: PLACEHOLDER_THUMB,
  },
];

/** 6 个动作、17 个计划组，和设计稿上的数字对得上 */
export const PUSH_DAY_SETS = PUSH_DAY.reduce((sum, item) => sum + item.startTarget.sets, 0);

export function metaOf(exerciseId: string): ExerciseMeta | undefined {
  return PUSH_DAY.find((item) => item.config.id === exerciseId);
}

export function configOf(exerciseId: string): ExerciseConfig | undefined {
  return metaOf(exerciseId)?.config;
}
