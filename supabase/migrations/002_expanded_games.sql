create table if not exists item_build_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  answer_item_id text not null,
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists item_recipe_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  answer_item_id text not null,
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists esports_draft_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  answer_champion text not null,
  correct boolean not null default false,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists guess_elo_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  answer_tier text not null,
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists connection_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  solved_groups integer not null default 0,
  mistakes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists dodge_queue_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  answer text not null check (answer in ('queue', 'dodge')),
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists dodge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge_id text not null,
  score integer not null,
  survival_ms integer not null,
  hits_taken integer not null,
  dodges integer not null,
  near_misses integer not null,
  created_at timestamptz default now()
);
