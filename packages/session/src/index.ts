/**
 * @xunlu/session —— 训录训练过程逻辑
 *
 * 管一次训练正在进行时的事：计时、滚轮预填、撤销窗口、状态机、App 重开后的恢复。
 * 纯函数，不碰 uni / plus / DOM，也不自己算加重减重（那是 @xunlu/engine 的事）。
 */
export * from './types';
export { elapsedSince, formatElapsed, inRestRange, restPhase, type RestPhase } from './clock';
export {
  differsFromPrefill,
  optionIndex,
  prefillFor,
  repOptions,
  rirOptions,
  targetRepsFor,
  weightOptions,
  type PrefillInput,
} from './prefill';
export { UNDO_WINDOW_MS, canUndo, undoRemainingMs, undoRemainingSeconds } from './undo';
export {
  appliedHintOf,
  applyHint,
  beginSet,
  clearHint,
  decideHint,
  endSession,
  findExercise,
  lastSetOf,
  nextSetNo,
  recordHintShown,
  saveSet,
  setsOf,
  startSession,
  switchExercise,
  undoLastSet,
  updateSet,
  type BeginSetInput,
  type RecordHintInput,
  type SaveSetInput,
  type StartSessionInput,
  type UpdateSetInput,
} from './recorder';
export { hintForSet, toSetRecord, type HintInput } from './hint';
export { restoreSession, type RestoreInput } from './restore';
