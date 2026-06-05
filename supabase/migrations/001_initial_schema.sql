create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists users_username_lower_idx on users (lower(username));
create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists champions (
  id text primary key,
  riot_key integer not null,
  name text not null,
  title text not null,
  roles text[] not null default '{}',
  region text not null,
  resource text not null,
  gender text not null,
  release_year integer not null,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists abilities (
  id text primary key,
  champion_id text not null references champions(id) on delete cascade,
  slot text not null check (slot in ('P', 'Q', 'W', 'E', 'R')),
  name text not null,
  description text not null,
  damage_type text not null,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists daily_challenges (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  challenge_type text not null check (challenge_type in ('ability', 'champion')),
  answer_id text not null,
  seed text not null,
  difficulty text not null default 'normal',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (date, challenge_type)
);

create index if not exists daily_challenges_type_date_idx on daily_challenges (challenge_type, date desc);

create table if not exists guesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  challenge_id uuid not null references daily_challenges(id) on delete cascade,
  guess jsonb not null,
  correct boolean not null default false,
  attempt_number integer not null,
  elapsed_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists guesses_user_challenge_idx on guesses (user_id, challenge_id, attempt_number);

create table if not exists challenge_results (
  user_id uuid not null references users(id) on delete cascade,
  challenge_id uuid not null references daily_challenges(id) on delete cascade,
  challenge_type text not null check (challenge_type in ('ability', 'champion')),
  date date not null,
  solved boolean not null default false,
  attempts integer not null,
  elapsed_ms integer not null,
  answer_roles text[] not null default '{}',
  solved_at timestamptz,
  primary key (user_id, challenge_id)
);

create index if not exists challenge_results_user_date_idx on challenge_results (user_id, date desc);

create table if not exists user_stats (
  user_id uuid primary key references users(id) on delete cascade,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  games_played integer not null default 0,
  wins integer not null default 0,
  win_rate numeric(5, 2) not null default 0,
  perfect_solves integer not null default 0,
  fastest_solve_ms integer,
  favorite_role text not null default 'Unclaimed',
  updated_at timestamptz not null default now()
);
