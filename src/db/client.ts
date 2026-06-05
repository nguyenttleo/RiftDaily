import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { env, isDatabaseConfigured } from "@/lib/env";

const globalForPg = globalThis as unknown as {
  riftDailyPool?: Pool;
};

function getPool(): Pool {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalForPg.riftDailyPool) {
    globalForPg.riftDailyPool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
      max: 5
    });
  }

  return globalForPg.riftDailyPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
