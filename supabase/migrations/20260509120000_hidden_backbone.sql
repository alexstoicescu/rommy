-- v3.0.0 — The Hidden Backbone.
--
-- profiles: one row per Syndicate Signature. id == client-generated
-- signature_id (uuid). The server is the only writer; reads stay
-- server-mediated for now (sidebar gets ELO via socket events), so we
-- keep RLS on with NO anon/authenticated policies — service role
-- bypasses RLS and is the only path to these tables.
--
-- matches: one row per finalized round. Stores the full v2.7.0 Match
-- Tape JSON for the After-Action Report / replay scrubber. winner_id
-- nullable so bot wins (null signature_id) don't blow up the FK.
--
-- ELO floor of 100 mirrors EloLedger.FLOOR_ELO. Tier is denormalised
-- on the row so leaderboards don't have to recompute thresholds in SQL;
-- the server writes both elo and tier in the same upsert.

create table public.profiles (
  id uuid primary key,
  alias text not null default 'Anon',
  elo integer not null default 1200 check (elo >= 100),
  tier text not null default 'Bronze',
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  winner_id uuid references public.profiles(id) on delete set null,
  room_id text,
  match_tape jsonb not null
);

create index matches_created_at_desc_idx on public.matches (created_at desc);
create index matches_winner_idx on public.matches (winner_id);

alter table public.profiles enable row level security;
alter table public.matches  enable row level security;

-- Intentionally no policies for anon/authenticated — only the game
-- server (service role) writes/reads these tables in v3.0.x. If a
-- future release wants direct client reads, add a narrow
-- "profiles_select_public" policy that exposes only id/alias/elo/tier.
