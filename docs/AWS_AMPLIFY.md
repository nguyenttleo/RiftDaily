# AWS Amplify Setup

This project is prepared for AWS Amplify Hosting as a Next.js SSR app. Amplify serves the pages and the API routes, including auth, suggestions, Riot status, daily challenge generation, and leaderboard/stat APIs.

## 1. Push the Project

Push this folder to GitHub, GitLab, Bitbucket, or AWS CodeCommit. GitHub is the simplest path.

## 2. Create the Amplify App

1. Open **AWS Amplify > Hosting**.
2. Choose **Deploy an app**.
3. Connect your repository and branch.
4. Let Amplify detect the included `amplify.yml`.
5. Use the default `.next` artifact output.

Amplify supports SSR, static pages, API routes, dynamic routes, middleware, image optimization, environment variables, and the Next.js app directory for supported Next.js versions.

## 3. Add Environment Variables

Add these in **Amplify > App settings > Environment variables**:

```text
DATABASE_URL
NEXTAUTH_URL
NEXTAUTH_SECRET
NEXT_PUBLIC_APP_URL
CHALLENGE_SALT
CRON_SECRET
RIOT_API_KEY
RIOT_REGION
RIOT_MATCH_SAMPLE_SIZE
RIOT_BUILD_SAMPLE_MATCH_COUNT
RIOT_MATCHUP_SAMPLE_MATCH_COUNT
RIOT_MATCH_HISTORY_PAGES_PER_SOURCE
NEXT_PUBLIC_CREATOR_GITHUB_URL
NEXT_PUBLIC_CREATOR_LINKEDIN_URL
```

Use these values:

- `DATABASE_URL`: Supabase transaction pooler URL.
- `NEXTAUTH_URL`: final deployed URL, for example `https://main.xxxxx.amplifyapp.com`.
- `NEXT_PUBLIC_APP_URL`: same final deployed URL.
- `NEXTAUTH_SECRET`: long random secret.
- `CHALLENGE_SALT`: long random secret used for deterministic daily seeds.
- `CRON_SECRET`: long random secret for `/api/cron/generate-daily`.
- `RIOT_API_KEY`: required for Guess the Elo, Champion Matchup, and Dodge-or-Queue. Those modes use Riot League-V4 and Match-V5 so lane assignments, champion-lane matchup samples, and summoner spells are real.
- `RIOT_REGION`: `na1` unless you want a different Riot platform route.
- `RIOT_MATCH_SAMPLE_SIZE`: target number of verified ranked matches to prepare for infinite-style Elo/Lobby queues. `100` gives up to 20 rounds per Guess the Elo rank bucket. If Riot/AWS latency stops a request before all 100 are collected, the app still returns the largest playable verified set it collected instead of hiding the mode.
- `RIOT_BUILD_SAMPLE_MATCH_COUNT`: target number of verified ranked matches used for Build baseline/correct-build winrate samples. `128` is the recommended production value so Build stats can find 5+ verified-game build samples more reliably.
- `RIOT_MATCHUP_SAMPLE_MATCH_COUNT`: target number of current-patch verified ranked matches used by the cron warmer for Champion Matchup champion-lane samples. The app stores verified Match-V5 rows, then filters gameplay to the active Data Dragon patch and uses every eligible current-patch cached row for each exact champion-lane pair. Matchup pairs only display at 20+ current-patch games, so increase this if your Riot key and hosting limits allow a larger current-patch cache.
- `RIOT_MATCH_HISTORY_PAGES_PER_SOURCE`: number of Match-V5 ranked history pages fetched per source player when building matchup samples. `2` is a conservative default; each page can add up to 100 match IDs per source.

Generate secrets locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The included `amplify.yml` writes the needed server variables into `.env.production` before `npm run build`. This is required for Next.js server/API code on Amplify.

## 4. First Deploy

Deploy once. Copy the Amplify URL after it finishes, then update:

```text
NEXTAUTH_URL=https://YOUR-AMPLIFY-DOMAIN
NEXT_PUBLIC_APP_URL=https://YOUR-AMPLIFY-DOMAIN
```

Redeploy after changing those values so auth callbacks and public links use the real production URL.

## 5. Schedule Daily Generation

The app generates deterministic daily content on demand. Keep the daily row generator fast:

```text
GET https://YOUR-AMPLIFY-DOMAIN/api/cron/generate-daily
Authorization: Bearer YOUR_CRON_SECRET
```

Build Champion Matchup cache in small batches so Amplify does not time out:

```text
GET https://YOUR-AMPLIFY-DOMAIN/api/cron/generate-daily?mode=warm-matchups&target=12&sources=1&pages=1
Authorization: Bearer YOUR_CRON_SECRET
```

Recommended AWS path:

1. Create an EventBridge Scheduler schedule at `cron(5 0 * * ? *)` for midnight UTC that invokes a Lambda wrapper calling `/api/cron/generate-daily`.
2. Create a second EventBridge Scheduler schedule at `rate(15 minutes)` that invokes the same Lambda wrapper with `/api/cron/generate-daily?mode=warm-matchups&target=12&sources=1&pages=1`.
3. Store the cron URL and `CRON_SECRET` as Lambda environment variables and send `Authorization: Bearer ...`.

The warm response includes how many current-patch matches were processed and how many 20+ game Matchup pairs are valid. You can call the endpoints manually after deploy:

```powershell
Invoke-WebRequest `
  -Uri "https://YOUR-AMPLIFY-DOMAIN/api/cron/generate-daily" `
  -Headers @{ Authorization = "Bearer YOUR_CRON_SECRET" }

Invoke-WebRequest `
  -Uri "https://YOUR-AMPLIFY-DOMAIN/api/cron/generate-daily?mode=warm-matchups&target=12&sources=1&pages=1" `
  -Headers @{ Authorization = "Bearer YOUR_CRON_SECRET" }
```

## 6. Production Smoke Test

After deploy:

1. Open `/`.
2. Open `/play`.
3. Submit a suggestion on `/suggest`, then confirm it appears in the `suggestions` table.
4. Open `/api/challenges/daily` and confirm `persistence` is `"database"`.
5. Open `/api/riot/status` and confirm Data Dragon status is returned.
6. Open `/api/challenges/daily` and confirm `extraChallenges.guessElo.rounds` and `extraChallenges.dodgeQueue.rounds` contain Match-V5 backed rounds when `RIOT_API_KEY` is valid.
7. Register a real account and sign in.

## 7. Security Notes

- Do not expose `DATABASE_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, or `RIOT_API_KEY` with `NEXT_PUBLIC_`.
- AWS warns that variables written into build artifacts can be visible to users with artifact access. Keep Amplify app/team permissions tight.
- Rotate `RIOT_API_KEY` and `CRON_SECRET` if they are ever shared.
