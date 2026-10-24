/**
 * 组间提示：把界面上的状态翻译成引擎要的入参，再把引擎的结果原样交回去。
 *
 * 这里一行加重减重的算法都没有 —— 全部由 @xunlu/engine 的 suggestNextSet 决定。
 * 界面只负责按 ruleId 和 kind 从词典取文案、画卡片。
 *
 * 规则 2.0.0 起：本次该动作已经加过几次重由引擎自己从 earlierSets 看实际重量算，
 * 这里不再传计数；保守模式已经取消，也没有 settings 了。
 */
import { suggestNextSet, type ExerciseConfig, type SetHint, type SetRecord } from '@xunlu/engine';
import { setsOf } from './recorder';
import type { ActiveSession, LoggedSet } from './types';

export interface HintInput {
  readonly session: ActiveSession;
  /** 刚保存的这一组所属动作的配置 */
  readonly exercise: ExerciseConfig;
  /** 刚保存的这一组（已经在 session.sets 里了） */
  readonly set: LoggedSet;
  /** 设置里关掉「RIR 显示」时传 false：不提示补填，只按次数判断 */
  readonly rirEnabled?: boolean;
}

/** 内存里的记录转成引擎的组记录 */
export function toSetRecord(set: LoggedSet): SetRecord {
  return set.tag === null
    ? { weight: set.weight, reps: set.reps, rir: set.rir }
    : { weight: set.weight, reps: set.reps, rir: set.rir, tag: set.tag };
}

/** 刚保存完一组，问引擎下一组该怎么办 */
export function hintForSet(input: HintInput): SetHint {
  const { session, exercise, set, rirEnabled } = input;
  const active = session.exercises.find((e) => e.exerciseId === exercise.id);
  const earlier = setsOf(session, exercise.id)
    .filter((s) => s.setNo < set.setNo)
    .map(toSetRecord);

  return suggestNextSet({
    exercise,
    set: toSetRecord(set),
    // 本次生效的次数区间：目标里可能是「上限 +3」延长过的
    repRange: active?.target.repRange ?? exercise.repRange,
    earlierSets: earlier,
    inDeload: session.deload,
    rirEnabled,
  });
}
