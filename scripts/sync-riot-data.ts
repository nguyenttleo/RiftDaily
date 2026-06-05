import { config } from "dotenv";
import { Pool } from "pg";

import { champions } from "../src/game/data/champions";
import { fetchRiotChampionPayload, getLatestDataDragonVersion } from "../src/lib/riot/data-dragon";

config({ path: ".env.local" });
config();

const slotOrder = ["Q", "W", "E", "R"] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or SUPABASE_DB_URL is required.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
    max: 3
  });

  let syncedChampions = 0;
  let syncedAbilities = 0;
  let skippedChampions = 0;
  let skippedPassives = 0;
  let skippedSpells = 0;

  try {
    const version = await getLatestDataDragonVersion();
    const payload = await fetchRiotChampionPayload(version);

    for (const champion of champions) {
      const riotChampion = payload.data[champion.id];

      if (!riotChampion) {
        skippedChampions += 1;
        console.warn(`Skipping ${champion.id}: not found in Riot Data Dragon payload.`);
        continue;
      }

      await pool.query(
        `update champions
         set
           riot_key = $2,
           name = $3,
           title = $4,
           roles = $5,
           resource = $6,
           metadata = metadata || $7::jsonb,
           updated_at = now()
         where id = $1`,
        [
          champion.id,
          Number(riotChampion.key),
          riotChampion.name,
          riotChampion.title,
          riotChampion.tags,
          riotChampion.partype || "None",
          JSON.stringify({
            dataDragonVersion: payload.version,
            image: riotChampion.image
          })
        ]
      );
      syncedChampions += 1;

      const staticPassive = champion.abilities.find((ability) => ability.slot === "P");
      const riotPassive = riotChampion.passive;

      if (staticPassive && riotPassive) {
        await pool.query(
          `update abilities
           set name = $2, description = $3, metadata = metadata || $4::jsonb, updated_at = now()
           where id = $1`,
          [
            staticPassive.id,
            riotPassive.name,
            stripHtml(riotPassive.description ?? ""),
            JSON.stringify({ dataDragonVersion: payload.version })
          ]
        );
        syncedAbilities += 1;
      } else if (staticPassive && !riotPassive) {
        skippedPassives += 1;
        console.warn(`Skipping passive for ${champion.id}: passive missing from Riot Data Dragon payload.`);
      }

      const riotSpells = Array.isArray(riotChampion.spells) ? riotChampion.spells : [];

      for (const [index, slot] of slotOrder.entries()) {
        const staticAbility = champion.abilities.find((ability) => ability.slot === slot);
        const riotSpell = riotSpells[index];

        if (!staticAbility) {
          continue;
        }

        if (!riotSpell) {
          skippedSpells += 1;
          console.warn(`Skipping ${champion.id} ${slot}: spell missing from Riot Data Dragon payload.`);
          continue;
        }

        await pool.query(
          `update abilities
           set name = $2, description = $3, metadata = metadata || $4::jsonb, updated_at = now()
           where id = $1`,
          [
            staticAbility.id,
            riotSpell.name,
            stripHtml(riotSpell.description ?? ""),
            JSON.stringify({ dataDragonVersion: payload.version, riotSpellId: riotSpell.id })
          ]
        );
        syncedAbilities += 1;
      }
    }

    console.log(`Synced Riot Data Dragon ${version}.`);
    console.log(`Champions synced: ${syncedChampions}`);
    console.log(`Abilities synced: ${syncedAbilities}`);
    console.log(`Champions skipped: ${skippedChampions}`);
    console.log(`Passives skipped: ${skippedPassives}`);
    console.log(`Spells skipped: ${skippedSpells}`);
  } finally {
    await pool.end();
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

main().catch((error) => {
  console.error("Riot sync failed:");
  console.error(error);
  process.exit(1);
});
