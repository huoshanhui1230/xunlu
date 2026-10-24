import type { ExerciseConfig, Target } from '@xunlu/engine';
import type { ActiveExercise, ActiveSession, LoggedSet, RestRange, WheelValues } from '../src';

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

export const inclineDb: ExerciseConfig = {
  id: 'incline-dumbbell-press',
  loadType: 'perSide',
  increment: 2,
  repRange: { min: 8, max: 12 },
  maxIncreasePct: 0.05,
  plannedSets: 3,
  primaryMuscles: ['chest'],
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

export const benchRest: RestRange = { minSec: 120, maxSec: 180 };

export function target(overrides: Partial<Target> = {}): Target {
  return {
    weight: 80,
    sets: 3,
    reps: [8, 8, 8],
    repRange: { min: 6, max: 8 },
    extended: false,
    targetRir: 2,
    ...overrides,
  };
}

let counter = 0;

/** 造一条已保存的记录；时间戳不重要时用递增的假值 */
export function loggedSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  counter += 1;
  const doneAt = overrides.doneAt ?? 1_000_000 + counter * 60_000;
  const savedAt = overrides.savedAt ?? doneAt + 2_400;
  return {
    id: `set-${counter}`,
    exerciseId: bench.id,
    setNo: counter,
    weight: 80,
    reps: 8,
    rir: 2,
    tag: null,
    note: null,
    prevSetAt: null,
    doneAt,
    savedAt,
    logMs: savedAt - doneAt,
    prefill: { weight: 80, reps: 8, rir: 2 },
    closedBy: 'confirm',
    ...overrides,
  };
}

export function wheel(weight: number, reps: number, rir: number | null = 2): WheelValues {
  return { weight, reps, rir };
}

export function activeExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    exerciseId: bench.id,
    position: 0,
    target: target(),
    hint: null,
    ...overrides,
  };
}

/** 把 session 推进到「某个动作已经记了 n 组」的状态，用保存的那一刻当时间戳 */
export function withSets(session: ActiveSession, sets: readonly LoggedSet[]): ActiveSession {
  return { ...session, sets: [...session.sets, ...sets] };
}

export function activeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 'session-1',
    planId: 'push',
    date: '2026-10-17',
    startedAt: 1_000_000,
    unit: 'kg',
    deload: false,
    currentExerciseId: bench.id,
    exercises: [activeExercise()],
    sets: [],
    pending: null,
    endedAt: null,
    ...overrides,
  };
}
