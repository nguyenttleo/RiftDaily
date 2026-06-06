import { config } from "dotenv";
import { Pool } from "pg";

import { abilities, champions } from "../src/game/data/champions";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or SUPABASE_DB_URL is required.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  max: 3
});

async function main() {
  try {
    for (const champion of champions) {
      await pool.query(
        `insert into champions (
          id,
          riot_key,
          name,
          title,
          roles,
          region,
          resource,
          gender,
          release_year,
          metadata,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
        on conflict (id)
        do update set
          riot_key = excluded.riot_key,
          name = excluded.name,
          title = excluded.title,
          roles = excluded.roles,
          region = excluded.region,
          resource = excluded.resource,
          gender = excluded.gender,
          release_year = excluded.release_year,
          metadata = champions.metadata || excluded.metadata,
          updated_at = now()`,
        [
          champion.id,
          champion.key,
          champion.name,
          champion.title,
          champion.roles,
          champion.region,
          champion.resource,
          champion.gender,
          champion.releaseYear,
          JSON.stringify({ source: "seed" })
        ]
      );
    }

    for (const ability of abilities) {
      await pool.query(
        `insert into abilities (
          id,
          champion_id,
          slot,
          name,
          description,
          damage_type,
          metadata,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
        on conflict (id)
        do update set
          name = excluded.name,
          description = excluded.description,
          damage_type = excluded.damage_type,
          metadata = abilities.metadata || excluded.metadata,
          updated_at = now()`,
        [
          ability.id,
          ability.championId,
          ability.slot,
          ability.name,
          ability.clue,
          ability.damageType,
          JSON.stringify({ source: "seed" })
        ]
      );
    }

    console.log(`Seeded ${champions.length} champions and ${abilities.length} ability clues.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:");
  console.error(error);
  process.exit(1);
});
