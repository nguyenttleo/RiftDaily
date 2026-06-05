import { config } from "dotenv";
import { Pool } from "pg";

import { abilities, champions } from "../src/game/data/champions";
import { fetchRiotChampionPayload, getLatestDataDragonVersion } from "../src/lib/riot/data-dragon";

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

const slotOrder = ["Q", "W", "E", "R"] as const;
type AbilitySlot = "P" | (typeof slotOrder)[number];

function stripHtml(value: string | undefined | null): string {
  return (value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function getStaticAbility(championId: string, slot: AbilitySlot) {
  return abilities.find((ability) => ability.championId === championId && ability.slot === slot);
}

function getOptionalImage(value: unknown): unknown | undefined {
  if (value && typeof value === "object" && "image" in value) {
    return (value as { image?: unknown }).image;
  }

  return undefined;
}

async function main() {
  const version = await getLatestDataDragonVersion();
  const payload = await fetchRiotChampionPayload(version);

  let championsSynced = 0;
  let championRowsMissing = 0;
  let passivesSynced = 0;
  let passivesSkipped = 0;
  let spellsSynced = 0;
  let spellsSkipped = 0;

  for (const champion of champions) {
    const riotChampion = payload.data[champion.id];

    if (!riotChampion) {
      console.warn(`Skipping champion ${champion.id}: missing from Data Dragon payload.`);
      continue;
    }

    const championUpdate = await pool.query(
      `update champions
       set
         riot_key = $2,
         name = $3,
         title = $4,
         roles = $5,
         resource = $6,
         metadata = coalesce(metadata, '{}'::jsonb) || $7::jsonb,
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

    if (championUpdate.rowCount === 0) {
      championRowsMissing += 1;
      console.warn(`No champions table row updated for ${champion.id}. Did you run npm run seed first?`);
    } else {
      championsSynced += 1;
    }

    const passive = getStaticAbility(champion.id, "P");

    if (!passive || !riotChampion.passive) {
      passivesSkipped += 1;
      console.warn(
        `Skipping passive for ${champion.id}: ${!passive ? "missing static passive" : "missing Riot passive"}.`
      );
    } else {
      const passiveUpdate = await pool.query(
        `update abilities
         set
           name = $2,
           description = $3,
           metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = now()
         where id = $1`,
        [
          passive.id,
          riotChampion.passive.name,
          stripHtml(riotChampion.passive.description),
          JSON.stringify({
            dataDragonVersion: payload.version,
            riotPassiveImage: getOptionalImage(riotChampion.passive)
          })
        ]
      );

      if (passiveUpdate.rowCount === 0) {
        passivesSkipped += 1;
        console.warn(`No abilities table row updated for passive ${passive.id}. Did you run npm run seed first?`);
      } else {
        passivesSynced += 1;
      }
    }

    for (const [index, slot] of slotOrder.entries()) {
      const staticAbility = getStaticAbility(champion.id, slot);
      const riotSpell = Array.isArray(riotChampion.spells) ? riotChampion.spells[index] : undefined;

      if (!staticAbility || !riotSpell) {
        spellsSkipped += 1;
        console.warn(
          `Skipping ${champion.id} ${slot}: ${!staticAbility ? "missing static ability" : "missing Riot spell"}.`
        );
        continue;
      }

      const spellUpdate = await pool.query(
        `update abilities
         set
           name = $2,
           description = $3,
           metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = now()
         where id = $1`,
        [
          staticAbility.id,
          riotSpell.name,
          stripHtml(riotSpell.description),
          JSON.stringify({
            dataDragonVersion: payload.version,
            riotSpellId: riotSpell.id,
            riotSpellImage: getOptionalImage(riotSpell)
          })
        ]
      );

      if (spellUpdate.rowCount === 0) {
        spellsSkipped += 1;
        console.warn(`No abilities table row updated for spell ${staticAbility.id}. Did you run npm run seed first?`);
      } else {
        spellsSynced += 1;
      }
    }
  }

  console.log(`Synced Riot Data Dragon ${version}.`);
  console.log(
    `Champions synced: ${championsSynced}. Champion rows missing: ${championRowsMissing}. Passives synced: ${passivesSynced}. Passives skipped: ${passivesSkipped}. Spells synced: ${spellsSynced}. Spells skipped: ${spellsSkipped}.`
  );
}

main()
  .catch((error) => {
    console.error("Riot sync failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
