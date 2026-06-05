# Rift Daily

Rift Daily is a League-inspired daily challenge hub for item builds, item recipes, esports draft calls, loading-screen Elo reads, champion Connections, Dodge-or-Queue lobbies, and a Kennen skillshot dodge trainer.

The app is built to run in two modes:

- Local demo mode with generated Riot/Data Dragon content and no required secrets.
- Production mode on AWS Amplify with Supabase Postgres persistence, auth, suggestions, stats, leaderboards, Riot static data, and live Leaguepedia esports draft data.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- NextAuth credential sessions with HTTP-only cookies
- Supabase Postgres through `pg`
- Riot Data Dragon for live champion/item/spell assets
- Leaguepedia Cargo for esports draft puzzles
- CommunityDragon static assets for ranked emblems and trainer character art
- AWS Amplify Hosting for the Next.js app and API routes

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The app works without secrets in local demo mode. Use `demo@riftdaily.local` and `demo1234` to try the demo account flow.

## Useful Scripts

```bash
npm run lint
npm run typecheck
npm run build
npm run seed
npm run sync:riot
```

`npm run seed` inserts the demo user and baseline stats when `DATABASE_URL` is configured. `npm run sync:riot` refreshes the Supabase champion and ability catalog from Riot Data Dragon.

## Production Setup

1. Create a Supabase project.
2. Run every SQL file in `supabase/migrations/` in order.
3. Copy the Supabase transaction pooler connection string into `DATABASE_URL`.
4. Push the project to GitHub.
5. Create an AWS Amplify Hosting app from that GitHub repo.
6. Add every variable from `.env.example` in Amplify.
7. Deploy with the included `amplify.yml`.
8. After the first deploy, set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the final Amplify domain and redeploy.
9. Optionally create an AWS EventBridge Scheduler/API Destination job that calls `/api/cron/generate-daily` at midnight UTC.

Detailed walkthroughs are in:

- `docs/SUPABASE.md`
- `docs/AWS_AMPLIFY.md`
- `docs/ARCHITECTURE.md`

## Riot Notice

Rift Daily is a fan-made project and is not endorsed by Riot Games. League of Legends and related assets are property of Riot Games.
