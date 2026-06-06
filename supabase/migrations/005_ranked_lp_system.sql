create table if not exists user_rank_state (
  user_id uuid primary key references users(id) on delete cascade,
  tier text not null default 'Unranked' check (tier in ('Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger')),
  lp integer not null default 0 check (lp >= 0 and lp <= 100),
  last_lp_change integer,
  games_played integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists ranked_game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  game_key text not null,
  round_id text not null,
  won boolean not null,
  performance_quality numeric(4, 3) not null,
  lp_delta integer not null check (lp_delta between -30 and 30 and lp_delta <> 0),
  tier_before text not null,
  lp_before integer not null,
  tier_after text not null,
  lp_after integer not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists game_mode_stats (
  user_id uuid not null references users(id) on delete cascade,
  game_key text not null,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  games_played integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_key)
);

create index if not exists ranked_game_results_user_created_idx
  on ranked_game_results (user_id, created_at desc);

create index if not exists ranked_game_results_game_created_idx
  on ranked_game_results (game_key, created_at desc);

create index if not exists game_mode_stats_game_idx
  on game_mode_stats (game_key);
