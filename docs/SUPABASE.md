# Supabase Setup

Use Supabase only as Postgres. The app talks to it from Next.js API/server code through `DATABASE_URL`, so no Supabase anon key is required for the current build.

## 1. Create the Database

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run these files in order:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_expanded_games.sql
supabase/migrations/003_suggestions.sql
supabase/migrations/004_champion_matchup_samples.sql
```

The schema creates users, daily challenge metadata, guesses, results, stats, leaderboards, expanded-game attempt tables, trainer runs, suggestions, and cached Riot Match-V5 head-to-head matchup samples.

## 2. Get the Connection String

For AWS Amplify, use the Supabase **Transaction pooler** connection string because Amplify server instances can create short-lived database connections.

In Supabase:

1. Go to **Project Settings > Database > Connect**.
2. Choose the transaction pooler string on port `6543`.
3. Replace `[YOUR-PASSWORD]` with the database password.
4. Use it as `DATABASE_URL`.

Example shape:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true
```

The app sets SSL automatically for Supabase hosts and limits the pool size to keep the free tier comfortable.

## 3. Seed and Sync Data

After setting `DATABASE_URL` locally:

```bash
npm run seed
npm run sync:riot
```

`sync:riot` refreshes champion and ability rows from Riot Data Dragon. The runtime app also fetches the latest Data Dragon version for current champion/item/spell assets.

## 4. Verify Tables

Run these in the Supabase SQL editor:

```sql
select count(*) from champions;
select username, email from users order by created_at desc limit 5;
select * from suggestions order by created_at desc limit 5;
select count(*) from champion_matchup_samples;
select split_part(game_version, '.', 1) || '.' || split_part(game_version, '.', 2) as patch,
       count(*) as matchup_rows,
       count(distinct match_id) as matches
from champion_matchup_samples
group by 1
order by matchup_rows desc;
```

If `champions` has the full roster and suggestions insert from `/suggest`, Supabase is wired correctly.

## 5. Notes

- Keep `DATABASE_URL` server-side only. Do not prefix it with `NEXT_PUBLIC_`.
- The suggestion form posts to `/api/suggestions` and persists into the `suggestions` table when `DATABASE_URL` is configured.
- Champion Matchup samples accumulate in `champion_matchup_samples` from verified Riot Match-V5 ranked games; gameplay filters that cache to the current Data Dragon patch and uses every eligible current-patch row available for each champion-lane pair. The game only displays exact same-match current-patch pairs with 20+ games.
- Free-tier Supabase can pause after inactivity. If accounts, saved stats, or leaderboards stop updating, check whether the project needs to be resumed.
