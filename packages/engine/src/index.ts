/**
 * @xunlu/engine —— 训录建议引擎
 *
 * 什么时候调用哪个函数：
 *   开始训练（预填之前）  adjustForLayoff     很久没练的动作先减重
 *   每组保存后            suggestNextSet      下一组提示（A）
 *   训练结束              suggestNextTarget   每个动作的下次目标（B）
 *                         detectRecords、exerciseVolume、muscleSetCounts、bestSet   总结页
 *   训练结束后            evaluateStatus      状态与减载提醒（C）
 *   采纳减载              planDeload          生成减载周目标
 */
export * from './types';
export { DEFAULT_PARAMS, RULE_VERSION, withParams, type EngineParams } from './params';
export { suggestNextSet, increaseThreshold, type IntraInput } from './intra';
export { suggestNextTarget, type PostInput } from './post';
export { adjustForLayoff, layoffCut, type LayoffInput, type LayoffResult } from './layoff';
export { evaluateStatus, trainingBlockStart, type StatusExercise, type StatusInput } from './status';
export { planDeload, isInDeload, type DeloadInput, type DeloadItem, type DeloadPlan } from './deload';
export {
  bestSet,
  detectRecords,
  estimate1RM,
  exerciseVolume,
  muscleSetCounts,
  setVolume,
  type PersonalRecords,
} from './metrics';
export {
  allRirAtLeast,
  evaluateSession,
  extendRange,
  plannedSetsFor,
  priorSessions,
  type SessionEval,
} from './evaluate';
export { bestE1rmOf, countedSets, workingWeightOf } from './sets';
export { checkSetHint, checkSuggestion, needsSpotterReminder, validateExercise } from './guardrails';
export { addDays, daysBetween, gridFloor, round2 } from './math';
