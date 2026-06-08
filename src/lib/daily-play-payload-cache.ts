import { query } from "@/db/client";
import { isDatabaseConfigured } from "@/lib/env";

type DailyPlayPayloadProduct = "lol" | "tft";

let ensureDailyPlayPayloadCacheTablePromise: Promise<void> | null = null;

export async function readDailyPlayPayload<T>(cacheKey: string): Promise<T | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  try {
    await ensureDailyPlayPayloadCacheTable();
    const result = await query<{ payload: T }>(
      `select payload
      from daily_play_payload_cache
      where cache_key = $1
        and expires_at > now()
      limit 1`,
      [cacheKey]
    );

    return result.rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

export async function writeDailyPlayPayload({
  cacheKey,
  product,
  date,
  profile,
  dataDragonVersion,
  payload,
  expiresAt
}: {
  cacheKey: string;
  product: DailyPlayPayloadProduct;
  date: string;
  profile: string;
  dataDragonVersion: string;
  payload: unknown;
  expiresAt: string;
}) {
  if (!isDatabaseConfigured()) {
    return false;
  }

  try {
    await ensureDailyPlayPayloadCacheTable();
    await query(
      `insert into daily_play_payload_cache (
        cache_key,
        product,
        date,
        profile,
        data_dragon_version,
        payload,
        payload_bytes,
        generated_at,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, pg_column_size($6::jsonb), now(), $7)
      on conflict (cache_key) do update set
        product = excluded.product,
        date = excluded.date,
        profile = excluded.profile,
        data_dragon_version = excluded.data_dragon_version,
        payload = excluded.payload,
        payload_bytes = excluded.payload_bytes,
        generated_at = excluded.generated_at,
        expires_at = excluded.expires_at`,
      [cacheKey, product, date, profile, dataDragonVersion, JSON.stringify(payload), expiresAt]
    );

    return true;
  } catch {
    return false;
  }
}

export async function pruneExpiredDailyPlayPayloads() {
  if (!isDatabaseConfigured()) {
    return 0;
  }

  try {
    await ensureDailyPlayPayloadCacheTable();
    const result = await query<{ deleted_count: string | number }>(
      `with deleted as (
        delete from daily_play_payload_cache
        where expires_at < now() - interval '1 day'
        returning 1
      )
      select count(*)::int as deleted_count
      from deleted`
    );

    return Number(result.rows[0]?.deleted_count ?? 0);
  } catch {
    return 0;
  }
}

async function ensureDailyPlayPayloadCacheTable() {
  if (!ensureDailyPlayPayloadCacheTablePromise) {
    ensureDailyPlayPayloadCacheTablePromise = (async () => {
      await query(`create table if not exists daily_play_payload_cache (
        cache_key text primary key,
        product text not null,
        date text not null,
        profile text not null,
        data_dragon_version text not null,
        payload jsonb not null,
        payload_bytes integer not null default 0,
        generated_at timestamptz not null default now(),
        expires_at timestamptz not null
      )`);
      await query("create index if not exists daily_play_payload_cache_product_date_idx on daily_play_payload_cache (product, date, profile)");
      await query("create index if not exists daily_play_payload_cache_expires_idx on daily_play_payload_cache (expires_at desc)");
    })();
  }

  return ensureDailyPlayPayloadCacheTablePromise;
}
