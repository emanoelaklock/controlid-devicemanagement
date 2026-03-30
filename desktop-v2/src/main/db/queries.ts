import { getDb, saveDb } from './database';

/** Get current local time as ISO string for SQLite storage */
export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Run SELECT, return array of row objects */
export function query(sql: string, params: any[] = []): any[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

/** Run SELECT, return first row or null */
export function queryOne(sql: string, params: any[] = []): any | null {
  const rows = query(sql, params);
  return rows[0] ?? null;
}

/** Run INSERT/UPDATE/DELETE, auto-save */
export function run(sql: string, params: any[] = []): void {
  getDb().run(sql, params);
  saveDb();
}

/** Get count from a query */
export function count(sql: string, params: any[] = []): number {
  const row = queryOne(sql, params);
  if (!row) return 0;
  return row[Object.keys(row)[0]] || 0;
}

/** Insert and return the inserted row */
export function insertAndReturn(table: string, data: Record<string, any>): any {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(',');
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
  run(sql, keys.map(k => data[k]));
  return queryOne(`SELECT * FROM ${table} WHERE id = ?`, [data.id]);
}
