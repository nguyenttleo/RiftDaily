create table if not exists champion_matchup_samples (
  match_id text not null,
  platform text not null,
  game_version text not null,
  game_creation timestamptz,
  left_champion_id text not null,
  left_role text not null,
  right_champion_id text not null,
  right_role text not null,
  left_won boolean not null,
  created_at timestamptz not null default now(),
  primary key (match_id, left_champion_id, left_role, right_champion_id, right_role)
);

create index if not exists champion_matchup_samples_pair_idx
  on champion_matchup_samples (left_champion_id, left_role, right_champion_id, right_role);

create index if not exists champion_matchup_samples_created_idx
  on champion_matchup_samples (created_at desc);
