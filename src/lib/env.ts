export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "",
  nextAuthSecret: process.env.NEXTAUTH_SECRET ?? "local-development-secret-change-before-production",
  challengeSalt: process.env.CHALLENGE_SALT ?? "rift-daily-local-salt",
  riotApiKey: process.env.RIOT_API_KEY ?? "",
  riotRegion: process.env.RIOT_REGION ?? "na1",
  riotMatchSampleSize: Number(process.env.RIOT_MATCH_SAMPLE_SIZE ?? "16"),
  riotBuildSampleMatchCount: Number(process.env.RIOT_BUILD_SAMPLE_MATCH_COUNT ?? "128"),
  riotMatchupSampleMatchCount: Number(process.env.RIOT_MATCHUP_SAMPLE_MATCH_COUNT ?? "1600"),
  cronSecret: process.env.CRON_SECRET ?? ""
};

export function isDatabaseConfigured(): boolean {
  return env.databaseUrl.trim().length > 0;
}

export function isRiotApiConfigured(): boolean {
  return env.riotApiKey.trim().length > 0;
}
