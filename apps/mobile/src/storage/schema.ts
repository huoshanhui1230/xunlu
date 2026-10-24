/**
 * 建表语句与动作库的初始数据。
 *
 * 表结构的意思：
 *   exercises           动作库。本轮只有推日的 6 个动作，启动时补齐
 *   sessions            一次训练。ended_at 为空就是进行中，重开 App 时按它恢复
 *   session_exercises   本次每个动作的目标（已过 adjustForLayoff）与提示状态
 *   pending_sets        点了「完成本组」、还没保存的那一组。立刻写，所以这时被杀掉也不丢
 *   sets                每一条记录。log_ms 是从点完成本组到保存用了多久，第一道放行看它
 *   suggestions         显示过的每一条建议，带规则版本、规则号和用户的决定，用来回溯和调参
 */
export const SCHEMA_VERSION = 1;

export const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS exercises (
     id TEXT PRIMARY KEY,
     load_type TEXT NOT NULL,
     increment REAL NOT NULL,
     rep_min INTEGER NOT NULL,
     rep_max INTEGER NOT NULL,
     max_increase_pct REAL NOT NULL,
     compound INTEGER NOT NULL DEFAULT 0,
     planned_sets INTEGER,
     primary_muscles TEXT,
     secondary_muscles TEXT,
     rest_min_sec INTEGER NOT NULL,
     rest_max_sec INTEGER NOT NULL,
     thumb TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     plan_id TEXT,
     date TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     status TEXT NOT NULL,
     current_exercise_id TEXT,
     unit TEXT NOT NULL DEFAULT 'kg',
     deload INTEGER NOT NULL DEFAULT 0,
     rule_version TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS session_exercises (
     session_id TEXT NOT NULL,
     exercise_id TEXT NOT NULL,
     position INTEGER NOT NULL,
     target_weight REAL NOT NULL,
     target_sets INTEGER NOT NULL,
     target_reps TEXT NOT NULL,
     rep_min INTEGER NOT NULL,
     rep_max INTEGER NOT NULL,
     extended INTEGER NOT NULL DEFAULT 0,
     target_rir INTEGER NOT NULL,
     layoff_adjusted INTEGER NOT NULL DEFAULT 0,
     increase_hint_set_ids TEXT NOT NULL DEFAULT '[]',
     hint TEXT,
     PRIMARY KEY (session_id, exercise_id)
   )`,

  `CREATE TABLE IF NOT EXISTS pending_sets (
     session_id TEXT PRIMARY KEY,
     exercise_id TEXT NOT NULL,
     set_no INTEGER NOT NULL,
     done_at INTEGER NOT NULL,
     prefill_weight REAL NOT NULL,
     prefill_reps INTEGER NOT NULL,
     prefill_rir INTEGER
   )`,

  `CREATE TABLE IF NOT EXISTS sets (
     id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     exercise_id TEXT NOT NULL,
     set_no INTEGER NOT NULL,
     weight REAL NOT NULL,
     reps INTEGER NOT NULL,
     rir INTEGER,
     tag TEXT,
     note TEXT,
     prev_set_at INTEGER,
     done_at INTEGER NOT NULL,
     saved_at INTEGER NOT NULL,
     log_ms INTEGER NOT NULL,
     prefill_weight REAL NOT NULL,
     prefill_reps INTEGER NOT NULL,
     prefill_rir INTEGER,
     closed_by TEXT NOT NULL,
     undone INTEGER NOT NULL DEFAULT 0,
     rule_version TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS suggestions (
     id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     exercise_id TEXT NOT NULL,
     scope TEXT NOT NULL,
     set_id TEXT,
     rule_version TEXT NOT NULL,
     rule_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     reason TEXT,
     blocked_by TEXT,
     payload TEXT NOT NULL,
     decision TEXT NOT NULL DEFAULT 'shown',
     decided_at INTEGER,
     created_at INTEGER NOT NULL
   )`,

  `CREATE INDEX IF NOT EXISTS idx_sets_session ON sets (session_id, saved_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets (exercise_id, saved_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_session ON suggestions (session_id, created_at)`,
];
