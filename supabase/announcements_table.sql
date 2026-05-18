-- ARISE dashboard announcement banners (internal updates only)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists announcements_active_created_idx
  on public.announcements (active, created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "Authenticated users can read active announcements" on public.announcements;
create policy "Authenticated users can read active announcements"
  on public.announcements
  for select
  to authenticated
  using (active = true);

-- Optional seed examples (run once in Supabase SQL editor)
-- insert into public.announcements (title, subtitle, active) values
--   ('AI Health Upgrade', 'CBC analysis is now faster on ARISE.', true),
--   ('Stay Hydrated', 'Your hydration level may be low today.', true),
--   ('Smart Insights', 'New AI recommendations are available.', true);
