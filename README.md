# Rift Daily

Rift Daily is a League-inspired infinite challenge hub for item builds, item recipes, verified Match-V5 loading-screen reads, champion matchup calls, Dodge-or-Queue lobbies, and a Kennen skillshot dodge trainer.

The app uses Riot Data Dragon at runtime for verified champion, item, spell, splash, and icon data. Guess the Elo and Dodge-or-Queue use Riot Match-V5 ranked matches for lane assignments and summoner spell choices. Champion Matchup prefers 20+ game head-to-head samples where both champion-lane picks appeared on opposite teams in the same Riot Match-V5 ranked games, with verified 5+ game warming samples used while Supabase builds that cache. Build mode shows Match-V5 ranked-sample baseline and target-build-core winrates only when each stat has at least 5 verified games and the build sample is at or above the baseline. Supabase enables persisted auth, suggestions, stats, matchup sample caching, and leaderboards in production.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- NextAuth credential sessions with HTTP-only cookies
- Supabase Postgres through `pg`
- Riot Data Dragon for live champion/item/spell assets
- Riot Match-V5 and League-V4 for verified ranked-match lane/spell rounds
- CommunityDragon static assets for ranked emblems and trainer character art
- AWS Amplify Hosting for the Next.js app and API routes

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Catalog gameplay loads verified Riot Data Dragon data without secrets. Guess the Elo, Champion Matchup, and Dodge-or-Queue require `RIOT_API_KEY` because they only display real Match-V5 `teamPosition`, same-match matchup, and `summoner1Id`/`summoner2Id` data. Account creation, saved stats, matchup sample caching, and leaderboards require `DATABASE_URL`.

## Useful Scripts

```bash
npm run lint
npm run typecheck
npm run build
npm run seed
npm run sync:riot
```

`npm run seed` inserts the Riot-derived champion and ability catalog when `DATABASE_URL` is configured. `npm run sync:riot` refreshes the Supabase champion and ability rows from Riot Data Dragon.

## Production Setup

1. Create a Supabase project.
2. Run every SQL file in `supabase/migrations/` in order.
3. Copy the Supabase transaction pooler connection string into `DATABASE_URL`.
4. Push the project to GitHub.
5. Create an AWS Amplify Hosting app from that GitHub repo.
6. Add every variable from `.env.example` in Amplify.
7. Deploy with the included `amplify.yml`.
8. After the first deploy, set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the final Amplify domain and redeploy.
9. Add a valid Riot API key in `RIOT_API_KEY`; development keys expire, so production hosting should use a production Riot key.
10. Optionally create an AWS EventBridge Scheduler/API Destination job that calls `/api/cron/generate-daily` at midnight UTC.

Detailed walkthroughs are in:

- `docs/SUPABASE.md`
- `docs/AWS_AMPLIFY.md`
- `docs/ARCHITECTURE.md`

## Riot Notice

Rift Daily is a fan-made project and is not endorsed by Riot Games. League of Legends and related assets are property of Riot Games.
