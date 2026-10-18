/**
 * 记录组的基础计算：哪些组算数、工作重量、估算 1RM。
 */
import type { ExerciseConfig, ExerciseSession, SetRecord } from './types';
import { canMeasurePct, isHarder } from './load';

/** 参与判断的组：去掉带标签的组和无效数据 */
export function countedSets(session: ExerciseSession): SetRecord[] {
  return session.sets.filter(
    (s) => !s.tag && Number.isFinite(s.weight) && Number.isFinite(s.reps) && s.weight >= 0 && s.reps >= 0,
  );
}

/**
 * 工作重量：组数最多的重量；组数相同时取更难的（助力取更小）。
 * 用来处理一次训练里用过多个重量的情况（组间提示加重、递减、单独一组试重等）。
 */
export function workingWeightOf(ex: ExerciseConfig, sets: readonly SetRecord[]): number | null {
  const counts = new Map<number, number>();
  for (const s of sets) {
    const key = Math.round(s.weight * 100);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    const w = key / 100;
    if (best === null || count > bestCount || (count === bestCount && isHarder(ex, w, best))) {
      best = w;
      bestCount = count;
    }
  }
  return best;
}

/** Epley 公式：e1RM = w × (1 + r / 30)，只算 1 ≤ r ≤ maxReps 的组 */
export function e1rm(weight: number, reps: number, maxReps: number): number | null {
  if (!(weight > 0) || !(reps >= 1) || reps > maxReps) return null;
  return weight * (1 + reps / 30);
}

/** 一组记录里最高的估算 1RM；无法计算幅度的负重方式返回 null */
export function bestE1rmOf(ex: ExerciseConfig, sets: readonly SetRecord[], maxReps: number): number | null {
  if (!canMeasurePct(ex)) return null;
  let best: number | null = null;
  for (const s of sets) {
    const v = e1rm(s.weight, s.reps, maxReps);
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
}

/** 一组记录的平均估算 1RM（平台期判断用） */
export function meanE1rmOf(ex: ExerciseConfig, sets: readonly SetRecord[], maxReps: number): number | null {
  if (!canMeasurePct(ex)) return null;
  let sum = 0;
  let n = 0;
  for (const s of sets) {
    const v = e1rm(s.weight, s.reps, maxReps);
    if (v !== null) {
      sum += v;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}
