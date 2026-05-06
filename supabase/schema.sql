-- Case Status Tracker - Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  case_label text not null,
  receipt_number text not null unique,
  form_type text not null default 'Other',
  category text not null default 'Other',
  service_center text default 'Not selected',
  filing_date date,
  priority_date date,
  status text not null default 'Case Was Received',
  status_date date,
  last_checked_at timestamptz,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_number_format check (receipt_number ~ '^[A-Z]{3}[0-9]{10}$')
);

create index if not exists idx_cases_receipt_number on cases (receipt_number);
create index if not exists idx_cases_status on cases (status);
create index if not exists idx_cases_last_checked_at on cases (last_checked_at);
create index if not exists idx_cases_created_at on cases (created_at desc);

create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  event_date timestamptz not null default now(),
  title text not null,
  description text default '',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists idx_status_history_case_id on status_history (case_id);
create index if not exists idx_status_history_event_date on status_history (event_date desc);

create table if not exists app_settings (
  id integer primary key default 1,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint one_settings_row check (id = 1)
);

insert into app_settings (id, settings)
values (
  1,
  '{
    "workspaceName": "Case Status Tracker",
    "workspaceSubtitle": "Private USCIS tracking dashboard",
    "maskReceiptNumbers": true,
    "defaultView": "dashboard",
    "themeMode": "day",
    "autoCheckEnabled": true
  }'::jsonb
)
on conflict (id) do nothing;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cases_updated_at on cases;
create trigger trg_cases_updated_at
before update on cases
for each row
execute function set_updated_at();

drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at
before update on app_settings
for each row
execute function set_updated_at();

-- Optional demo data. Uncomment if you want starter rows in Supabase.
-- insert into cases (
--   case_label, receipt_number, form_type, category, service_center,
--   filing_date, priority_date, status, status_date, last_checked_at, notes
-- ) values
--   ('Ahmet C.', 'IOE0912345678', 'I-485', 'Marriage-Based AOS', 'NBC',
--    '2026-01-12', '2025-11-04', 'Case Is Being Actively Reviewed', '2026-05-02', now(), 'Demo case')
-- on conflict (receipt_number) do nothing;
