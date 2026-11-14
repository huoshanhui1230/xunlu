/**
 * 推日：本轮写死的训练数据。
 *
 * 计划页这次不做，所以训练日直接写在代码里，不建 plans 表。
 * 每个动作三件事：给引擎的配置（负重方式、增量、次数区间、加重上限）、推荐组间歇、第一次练的目标。
 * 动作名在词典里按 id 取（locale/zh-Hans.ts 的 exercise.*），这里不写中文。
 */
import type { ExerciseConfig, Target } from '@xunlu/engine';
import type { RestRange } from '@xunlu/session';

/** 器械决定界面上怎么称呼这个重量：杠铃含杆总重、哑铃单只重量 */
export type Equipment = 'barbell' | 'dumbbell' | 'cable';

export interface ExerciseMeta {
  readonly config: ExerciseConfig;
  readonly equipment: Equipment;
  /** 推荐组间歇：计时走到下限就算进入推荐区间 */
  readonly rest: RestRange;
  /** 还没有历史时用的起始目标 */
  readonly startTarget: Target;
  /** 动作缩略图：static/thumbs 下的文件名（不带扩展名），本轮一律占位图 */
  readonly thumb: string;
}

const PLACEHOLDER_THUMB = 'placeholder';

/** 重量和每组次数取自设计稿第 07 页的推日示例 */
function startTarget(weight: number, reps: readonly number[], range: { min: number; max: number }): Target {
  return { weight, sets: reps.length, reps, repRange: range, extended: false, targetRir: 2 };
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
    equipment: 'barbell',
    rest: { minSec: 120, maxSec: 180 },
    startTarget: startTarget(80, [8, 8, 8], { min: 6, max: 8 }),
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
    equipment: 'dumbbell',
    rest: { minSec: 120, maxSec: 180 },
    startTarget: startTarget(28, [12, 11, 10], { min: 8, max: 12 }),
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
    equipment: 'dumbbell',
    rest: { minSec: 120, maxSec: 180 },
    startTarget: startTarget(22, [10, 10, 9], { min: 8, max: 12 }),
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
    equipment: 'dumbbell',
    rest: { minSec: 60, maxSec: 120 },
    startTarget: startTarget(10, [15, 14, 12], { min: 12, max: 15 }),
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
    equipment: 'cable',
    rest: { minSec: 60, maxSec: 120 },
    startTarget: startTarget(35, [15, 13, 12], { min: 10, max: 15 }),
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
    equipment: 'cable',
    rest: { minSec: 60, maxSec: 120 },
    startTarget: startTarget(27.5, [12, 11], { min: 10, max: 15 }),
    thumb: PLACEHOLDER_THUMB,
  },
];

/** 6 个动作、17 个计划组，和设计稿上的数字对得上 */
export const PUSH_DAY_SETS = PUSH_DAY.reduce((sum, item) => sum + item.startTarget.sets, 0);

export function metaOf(exerciseId: string): ExerciseMeta | undefined {
  return PUSH_DAY.find((item) => item.config.id === exerciseId);
}
