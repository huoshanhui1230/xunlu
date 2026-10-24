/**
 * 拼 SQL 的小工具。
 *
 * plus.sqlite 只收 SQL 字符串，没有参数绑定，所以值一律走 lit() 转义后再拼进去。
 * 备注这类用户输入里可能有单引号，别图省事直接拼。
 */

export type SqlValue = string | number | boolean | null | undefined;

/** 把一个值写成 SQL 字面量 */
export function lit(value: SqlValue): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

export type Row = Record<string, SqlValue>;

/** INSERT OR REPLACE：主键一样就覆盖，省掉先查再写 */
export function insertSql(table: string, row: Row): string {
  const columns = Object.keys(row);
  const values = columns.map((c) => lit(row[c]));
  return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
}

export function updateSql(table: string, patch: Row, where: Row): string {
  const set = Object.keys(patch)
    .map((c) => `${c} = ${lit(patch[c])}`)
    .join(', ');
  return `UPDATE ${table} SET ${set} WHERE ${whereSql(where)}`;
}

export function deleteSql(table: string, where: Row): string {
  return `DELETE FROM ${table} WHERE ${whereSql(where)}`;
}

export function whereSql(where: Row): string {
  return Object.keys(where)
    .map((c) => (where[c] === null || where[c] === undefined ? `${c} IS NULL` : `${c} = ${lit(where[c])}`))
    .join(' AND ');
}

/** JSON 列：读回来坏掉了就当空，不要让一行坏数据顶掉整次训练 */
export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
