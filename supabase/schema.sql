create extension if not exists pgcrypto;

create table if not exists kb_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  price_text text,
  eligibility text,
  priority int default 100,
  active boolean default true
);

create table if not exists kb_schedule (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  day_of_week int not null,
  start_time time not null,
  end_time time not null,
  coach text,
  level text,
  active boolean default true
);

create table if not exists kb_playbook (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  content text not null,
  version text,
  active boolean default true
);

create table if not exists kb_tone_examples (
  id uuid primary key default gen_random_uuid(),
  user_example text not null,
  assistant_example text not null,
  tags text[] default '{}',
  active boolean default true
);

create table if not exists chat_sessions (
  id uuid primary key,
  created_at timestamptz default now(),
  last_stage text default 'welcome',
  collected_fields jsonb default '{}'::jsonb,
  last_recommendation text
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete set null,
  name text,
  contact text,
  goal text,
  availability text,
  experience_level text default 'unknown',
  recommended_plan text,
  notes text,
  status text default 'new',
  created_at timestamptz default now()
);

-- Seguridad: acceso solo por backend (service_role).
-- No se habilitan politicas para anon/authenticated.
alter table if exists kb_services enable row level security;
alter table if exists kb_services force row level security;
alter table if exists kb_schedule enable row level security;
alter table if exists kb_schedule force row level security;
alter table if exists kb_playbook enable row level security;
alter table if exists kb_playbook force row level security;
alter table if exists kb_tone_examples enable row level security;
alter table if exists kb_tone_examples force row level security;
alter table if exists chat_sessions enable row level security;
alter table if exists chat_sessions force row level security;
alter table if exists chat_messages enable row level security;
alter table if exists chat_messages force row level security;
alter table if exists leads enable row level security;
alter table if exists leads force row level security;

revoke all on table kb_services from anon, authenticated;
revoke all on table kb_schedule from anon, authenticated;
revoke all on table kb_playbook from anon, authenticated;
revoke all on table kb_tone_examples from anon, authenticated;
revoke all on table chat_sessions from anon, authenticated;
revoke all on table chat_messages from anon, authenticated;
revoke all on table leads from anon, authenticated;
