-- Método Kiru: username login support.
-- Run in Supabase SQL Editor after reviewing the current schema.
-- This adds usernames to profiles; it does not create or alter Auth users.
alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

comment on column public.profiles.username is
  'Login name used by Método Kiru. Keep unique; never store passwords here.';
