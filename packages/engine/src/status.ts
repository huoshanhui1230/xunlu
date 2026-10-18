/**
 * C. 状态与减载提醒（跨训练）
 *
 * 每次训练结束后把最近几周的记录合起来看 4 个信号：
 *   S1 表现下滑：2 个及以上动作，连续 2 次估算 1RM 比近 4 周最佳低 5% 以上
 *   S2 同重量更吃力：2 个及以上动作，同重量、同次数时 RIR 比近 4 周低 2 或更多
 *   S3 多个动作停滞：一周内 3 个及以上动作命中失败（B3）或平台期（B6）
 *   S4 连续训练时间：距上次减载（或开始训练）满 5 周
 * 0 个信号 → 正常；1 个 → 关注；2 个及以上 → 建议减载。
 * 时间窗从"当前训练段"算起：连续 7 天以上没练、上次减载结束、开始使用，三者取最晚。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, ExerciseSession, Settings, StatusLevel, StatusResult, StatusSignal } from './types';
import { bestE1rmOf, countedSets } from './sets';
import { canMeasurePct } from './load';
import { addDays, daysBetween, EPS, laterDate, mean, sameWeight } from './math';
import { suggestNextTarget } from './post';
import { isInDeload } from './deload';

export interface StatusExercise {
  readonly exercise: ExerciseConfig;
  /** 该动作的训练记录（建议最近 8 周），可以含减载周 */
  readonly sessions: readonly ExerciseSession[];
}

export interface StatusInput {
  readonly today: string;
  readonly exercises: readonly StatusExercise[];
  readonly settings: Settings;
  /** 开始使用的日期 */
  readonly firstUseDate: string;
  /** 上次减载的最后一天 */
  readonly lastDeloadEnd?: string | null;
  /** 正在进行的减载周 */
  readonly activeDeload?: { readonly start: string; readonly end: string } | null;
  /** 用户选了"推迟一周"：在这天之前，建议减载降为关注 */
  readonly snoozedUntil?: string | null;
  readonly params?: EngineParams;
}

export function evaluateStatus(input: StatusInput): StatusResult {
  const p = input.params ?? DEFAULT_PARAMS;
  const today = input.today;
  const blockStart = trainingBlockStart(input, p);
  const base = { blockStart, ruleVersion: p.ruleVersion };
  if (isInDeload(input.activeDeload, today)) {
    return { ...base, level: 'normal', signals: [], inDeload: true, snoozed: false };
  }

  const windowStart = laterDate(addDays(today, -(p.status.windowDays - 1)), blockStart);
  const s1: string[] = [];
  const s2: string[] = [];
  const s3: string[] = [];
  for (const item of input.exercises) {
    const usable = sortByDate(item.sessions).filter(
      (s) => s.deload !== true && s.date <= today && countedSets(s).length > 0,
    );
    const inWindow = usable.filter((s) => s.date >= windowStart);
    if (performanceDrop(item.exercise, inWindow, p)) s1.push(item.exercise.id);
    if (harderAtSameLoad(inWindow, p)) s2.push(item.exercise.id);
    if (recentFailureOrPlateau(item.exercise, usable, input, p)) s3.push(item.exercise.id);
  }

  const signals: StatusSignal[] = [];
  if (s1.length >= p.status.s1MinExercises) signals.push({ id: 'S1', exerciseIds: s1 });
  if (s2.length >= p.status.s2MinExercises) signals.push({ id: 'S2', exerciseIds: s2 });
  if (s3.length >= p.status.s3MinExercises) signals.push({ id: 'S3', exerciseIds: s3 });
  const days = daysBetween(blockStart, today);
  if (days >= p.status.s4Days) signals.push({ id: 'S4', exerciseIds: [], days });

  let level: StatusLevel =
    signals.length >= p.status.deloadSignals ? 'deload_suggested' : signals.length > 0 ? 'watch' : 'normal';
  let snoozed = false;
  if (level === 'deload_suggested' && input.snoozedUntil && today < input.snoozedUntil) {
    level = 'watch';
    snoozed = true;
  }
  return { ...base, level, signals, inDeload: false, snoozed };
}

/** 当前训练段的第一天；还没开始训练或已中断时返回今天 */
export function trainingBlockStart(
  input: Pick<StatusInput, 'today' | 'exercises' | 'firstUseDate' | 'lastDeloadEnd'>,
  p: EngineParams = DEFAULT_PARAMS,
): string {
  const today = input.today;
  let start = input.firstUseDate;
  if (input.lastDeloadEnd && input.lastDeloadEnd > start) start = input.lastDeloadEnd;
  const dates = Array.from(
    new Set(
      input.exercises.flatMap((e) =>
        e.sessions.filter((s) => s.date <= today && countedSets(s).length > 0).map((s) => s.date),
      ),
    ),
  ).sort();
  if (dates.length === 0) return today;
  const last = dates[dates.length - 1] as string;
  if (daysBetween(last, today) - 1 >= p.status.breakDays) return today;
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1] as string;
    const b = dates[i] as string;
    if (daysBetween(a, b) - 1 >= p.status.breakDays && b > start) start = b;
  }
  return dates.find((d) => d >= start) ?? today;
}

/** S1：最近 2 次的最佳估算 1RM 都比窗口内最佳低 5% 以上 */
function performanceDrop(ex: ExerciseConfig, sessions: readonly ExerciseSession[], p: EngineParams): boolean {
  if (!canMeasurePct(ex)) return false;
  const scores = sessions
    .map((s) => bestE1rmOf(ex, countedSets(s), p.e1rmMaxReps))
    .filter((x): x is number => x !== null);
  const k = p.status.s1Sessions;
  if (scores.length <= k) return false;
  const best = Math.max(...scores);
  return scores.slice(-k).every((x) => x < best * (1 - p.status.s1Drop) - EPS);
}

/** S2：最近一次里能对上"同重量、同次数"的组，RIR 平均比此前低 2 或更多 */
function harderAtSameLoad(sessions: readonly ExerciseSession[], p: EngineParams): boolean {
  if (sessions.length < 2) return false;
  const latest = countedSets(sessions[sessions.length - 1] as ExerciseSession);
  const earlier = sessions
    .slice(0, -1)
    .flatMap((s) => countedSets(s))
    .filter((s) => s.rir !== null && s.rir !== undefined);
  const deltas: number[] = [];
  for (const s of latest) {
    if (s.rir === null || s.rir === undefined) continue;
    const refs = earlier.filter((e) => sameWeight(e.weight, s.weight) && e.reps === s.reps);
    if (refs.length === 0) continue;
    deltas.push(mean(refs.map((r) => r.rir as number)) - s.rir);
  }
  return deltas.length > 0 && mean(deltas) >= p.status.s2RirDrop - EPS;
}

/** S3：最近 7 天内有一次训练命中失败或平台期 */
function recentFailureOrPlateau(
  ex: ExerciseConfig,
  usable: readonly ExerciseSession[],
  input: StatusInput,
  p: EngineParams,
): boolean {
  const from = addDays(input.today, -(p.status.s3WindowDays - 1));
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i] as ExerciseSession;
    if (s.date < from) continue;
    const r = suggestNextTarget({ exercise: ex, history: usable.slice(0, i), session: s, settings: input.settings, params: p });
    if (
      r &&
      (r.ruleId === 'B6' || r.reason === 'failure_first' || r.reason === 'failure_repeat' || r.reason === 'cannot_reduce')
    ) {
      return true;
    }
  }
  return false;
}

function sortByDate(sessions: readonly ExerciseSession[]): ExerciseSession[] {
  return [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
