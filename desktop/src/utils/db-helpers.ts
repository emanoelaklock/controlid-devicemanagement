import { getDb, saveDb } from '../database';

/** Run a SELECT query and return array of row objects */
export function query(sql: string, params: any[] = []): any[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/** Run a SELECT query and return first row or null */
export function queryOne(sql: string, params: any[] = []): any | null {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and save to disk */
export function run(sql: string, params: any[] = []): void {
  const db = getDb();
  db.run(sql, params);
  saveDb();
}

/** Get a single count value */
export function count(sql: string, params: any[] = []): number {
  const row = queryOne(sql, params);
  if (!row) return 0;
  const keys = Object.keys(row);
  return row[keys[0]] || 0;
}
