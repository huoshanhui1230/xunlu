/**
 * 总结页用到的计算：估算 1RM、容量、肌群组数、最佳组、新纪录。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, ExerciseSession, SetRecord } from './types';
import { bestE1rmOf, countedSets, e1rm } from './sets';
import { canMeasurePct, isHarder } from './load';
import { EPS, sameWeight } from './math';

/** Epley 估算 1RM；超过 10 次的组不算，只用来看趋势 */
export function estimate1RM(weight: number, reps: number, maxReps: number = DEFAULT_PARAMS.e1rmMaxReps): number | null {
  return e1rm(weight, reps, maxReps);
}

/** 一组的容量：哑铃按两侧合计；自重加负重只算额外负重；助力不计 */
export function setVolume(ex: ExerciseConfig, s: SetRecord): number {
  switch (ex.loadType) {
    case 'total':
    case 'bodyweightPlus':
      return s.weight * s.reps;
    case 'perSide':
      return 2 * s.weight * s.reps;
    case 'assisted':
      return 0;
  }
}

/** 一次训练里这个动作的总容量（含带标签的组） */
export function exerciseVolume(ex: ExerciseConfig, session: ExerciseSession): number {
  let total = 0;
  for (const s of session.sets) {
    if (Number.isFinite(s.weight) && Number.isFinite(s.reps)) total += setVolume(ex, s);
  }
  return total;
}

/** 肌群组数：主动肌每组计 1，协同肌每组计 0.5 */
export function muscleSetCounts(
  items: ReadonlyArray<{ readonly exercise: ExerciseConfig; readonly sets: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { exercise, sets } of items) {
    for (const m of exercise.primaryMuscles ?? []) out[m] = (out[m] ?? 0) + sets;
    for (const m of exercise.secondaryMuscles ?? []) out[m] = (out[m] ?? 0) + sets * 0.5;
  }
  return out;
}

/** 最佳组：估算 1RM 最高的组；算不了时取更难的重量，其次更多次数 */
export function bestSet(
  ex: ExerciseConfig,
  sets: readonly SetRecord[],
  maxReps: number = DEFAULT_PARAMS.e1rmMaxReps,
): SetRecord | null {
  if (sets.length === 0) return null;
  if (canMeasurePct(ex)) {
    let best: SetRecord | null = null;
    let bestValue = -Infinity;
    for (const s of sets) {
      const v = e1rm(s.weight, s.reps, maxReps);
      if (v === null) continue;
      if (v > bestValue + EPS || (Math.abs(v - bestValue) <= EPS && best !== null && s.weight > best.weight)) {
        best = s;
        bestValue = v;
      }
    }
    if (best !== null) return best;
  }
  let best = sets[0] as SetRecord;
  for (const s of sets.slice(1)) {
    if (isHarder(ex, s.weight, best.weight) || (sameWeight(s.weight, best.weight) && s.reps > best.reps)) best = s;
  }
  return best;
}

export interface PersonalRecords {
  /** 重量纪录（助力动作不计） */
  readonly weight: { readonly weight: number; readonly reps: number; readonly previous: number } | null;
  /** 同重量次数纪录 */
  readonly reps: ReadonlyArray<{ readonly weight: number; readonly reps: number; readonly previous: number }>;
  /** 估算 1RM 纪录 */
  readonly e1rm: { readonly value: number; readonly previous: number; readonly weight: number; readonly reps: number } | null;
}

/** 和此前全部记录比，找出本次的新纪录；第一次做这个动作时不算纪录 */
export function detectRecords(
  ex: ExerciseConfig,
  history: readonly ExerciseSession[],
  session: ExerciseSession,
  p: EngineParams = DEFAULT_PARAMS,
): PersonalRecords {
  const priorSets = history.flatMap((s) => countedSets(s));
  const cur = countedSets(session);
  if (priorSets.length === 0 || cur.length === 0) return { weight: null, reps: [], e1rm: null };

  let weight: PersonalRecords['weight'] = null;
  if (ex.loadType !== 'assisted') {
    const maxW = Math.max(...cur.map((s) => s.weight));
    const prevMax = Math.max(...priorSets.map((s) => s.weight));
    if (maxW > 0 && maxW > prevMax + 0.0049) {
      const reps = Math.max(...cur.filter((s) => sameWeight(s.weight, maxW)).map((s) => s.reps));
      weight = { weight: maxW, reps, previous: prevMax };
    }
  }

  const reps: Array<{ weight: number; reps: number; previous: number }> = [];
  const seen: number[] = [];
  for (const s of cur) {
    if (seen.some((w) => sameWeight(w, s.weight))) continue;
    seen.push(s.weight);
    const prior = priorSets.filter((x) => sameWeight(x.weight, s.weight));
    if (prior.length === 0) continue;
    const previous = Math.max(...prior.map((x) => x.reps));
    const best = Math.max(...cur.filter((x) => sameWeight(x.weight, s.weight)).map((x) => x.reps));
    if (best > previous) reps.push({ weight: s.weight, reps: best, previous });
  }

  let e1rmRecord: PersonalRecords['e1rm'] = null;
  const curBest = bestE1rmOf(ex, cur, p.e1rmMaxReps);
  const prevBest = bestE1rmOf(ex, priorSets, p.e1rmMaxReps);
  if (curBest !== null && prevBest !== null && curBest > prevBest + EPS) {
    const top = bestSet(ex, cur, p.e1rmMaxReps) as SetRecord;
    e1rmRecord = { value: curBest, previous: prevBest, weight: top.weight, reps: top.reps };
  }
  return { weight, reps, e1rm: e1rmRecord };
}
