import type { ExerciseConfig, ExerciseSession, SetRecord } from '../src';

type Row = readonly [weight: number, reps: number, rir?: number | null];

/** [重量, 次数, RIR]；RIR 不写表示没填 */
export function sets(rows: readonly Row[]): SetRecord[] {
  return rows.map(([weight, reps, rir]) => ({ weight, reps, rir: rir === undefined ? null : rir }));
}

export function session(date: string, rows: readonly Row[], extra: Partial<ExerciseSession> = {}): ExerciseSession {
  return { date, sets: sets(rows), ...extra };
}

/** 同一重量、同一 RIR 的若干组 */
export function same(date: string, weight: number, reps: readonly number[], rir: number | null = 1): ExerciseSession {
  return session(
    date,
    reps.map((r) => [weight, r, rir] as const),
  );
}

export const bench: ExerciseConfig = {
  id: 'barbell-bench-press',
  loadType: 'total',
  increment: 2.5,
  repRange: { min: 6, max: 8 },
  maxIncreasePct: 0.05,
  compound: true,
  plannedSets: 3,
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'front-delts'],
};

export const squat: ExerciseConfig = {
  id: 'barbell-back-squat',
  loadType: 'total',
  increment: 5,
  repRange: { min: 5, max: 8 },
  maxIncreasePct: 0.1,
  compound: true,
  plannedSets: 3,
  primaryMuscles: ['quads', 'glutes'],
};

export const inclineDb: ExerciseConfig = {
  id: 'incline-dumbbell-press',
  loadType: 'perSide',
  increment: 2,
  repRange: { min: 8, max: 12 },
  maxIncreasePct: 0.05,
  plannedSets: 3,
  primaryMuscles: ['chest'],
  secondaryMuscles: ['front-delts', 'triceps'],
};

export const lateralRaise: ExerciseConfig = {
  id: 'dumbbell-lateral-raise',
  loadType: 'perSide',
  increment: 1,
  repRange: { min: 12, max: 15 },
  maxIncreasePct: 0.05,
  plannedSets: 3,
  primaryMuscles: ['side-delts'],
};

export const pullUp: ExerciseConfig = {
  id: 'pull-up',
  loadType: 'bodyweightPlus',
  increment: 2.5,
  repRange: { min: 6, max: 10 },
  maxIncreasePct: 0.05,
  compound: true,
  plannedSets: 3,
};

export const pushUp: ExerciseConfig = {
  id: 'push-up',
  loadType: 'bodyweightPlus',
  increment: 0,
  repRange: { min: 10, max: 20 },
  maxIncreasePct: 0.05,
  plannedSets: 3,
};

export const assistedPullUp: ExerciseConfig = {
  id: 'assisted-pull-up',
  loadType: 'assisted',
  increment: 5,
  repRange: { min: 8, max: 12 },
  maxIncreasePct: 0.05,
  plannedSets: 3,
};
