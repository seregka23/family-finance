import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function migrationSql() {
  const directory = new URL('../migrations/', import.meta.url);
  return readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()
    .map((file) => readFileSync(new URL(file, directory), 'utf8')).join('\n');
}

// SQLite executes the real migration and query text; only the D1 result envelope is adapted.
export function localD1(path = ':memory:', migrate = true) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON');
  if (migrate) sqlite.exec(migrationSql());
  const statements = [];
  const db = {
    prepare(sql) {
      const statement = (values = []) => ({
        bind(...args) { return statement(args); },
        async all() {
          statements.push({ sql, values });
          return { success: true, results: sqlite.prepare(sql).all(...values), meta: {} };
        },
        async first(column) {
          statements.push({ sql, values });
          const row = sqlite.prepare(sql).get(...values) ?? null;
          return column && row ? row[column] : row;
        },
        async run() {
          statements.push({ sql, values });
          const result = sqlite.prepare(sql).run(...values);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        }
      });
      return statement();
    },
    batch(statements) { return Promise.all(statements.map((statement) => statement.all())); }
  };
  return { db, sqlite, statements, close: () => sqlite.close() };
}
