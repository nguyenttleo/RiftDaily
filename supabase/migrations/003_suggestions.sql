create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  name text,
  contact text,
  type text not null,
  message text not null,
  page text,
  status text not null default 'New' check (status in ('New', 'Reviewed', 'Planned', 'Implemented', 'Rejected')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists suggestions_status_created_idx on suggestions (status, created_at desc);
create index if not exists suggestions_user_created_idx on suggestions (user_id, created_at desc);
