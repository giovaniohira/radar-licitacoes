import { Pool, types, type QueryResultRow } from "pg";

// Keep SQL `date` as "YYYY-MM-DD": the default parser builds a Date at local midnight, which shifts the day across timezones.
types.setTypeParser(1082, (v) => v);

declare global {
  var __radarPool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__radarPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não definido");
    globalThis.__radarPool = new Pool({ connectionString, max: 5 });
  }
  return globalThis.__radarPool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(sql, params);
  return res.rows;
}

export async function closePool(): Promise<void> {
  await globalThis.__radarPool?.end();
  globalThis.__radarPool = undefined;
}
