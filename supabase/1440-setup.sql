-- ============================================================
--  1440 · database setup
--  Paste ALL of this into Supabase → SQL Editor → New query → Run.
--  Safe to run again later: it only creates what's missing.
--
--  What it sets up:
--   • Tables for habits, daily ticks, day reviews, urges, books,
--     achievements, settings and reminder subscriptions
--   • Row Level Security: every row is locked to your own login
--   • The midnight rule, enforced by the database itself:
--     only TODAY can be ticked (15-min grace after midnight so
--     offline ticks can sync), and a closed day can't be changed
--   • A job that runs every hour and permanently records
--     yesterday's misses
-- ============================================================


-- ---------- 1. Settings (one row per user) ----------
create table if not exists public.settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  tz               text not null default 'Asia/Kolkata',
  why              text check (length(why) <= 1000),
  remind_morning   time default '08:30',
  remind_evening   time default '21:30',
  remind_last_call time default '23:30',
  shields_enabled  boolean not null default false,
  steps_threshold  int not null default 2000 check (steps_threshold between 0 and 100000),
  accent           text,
  prefs            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ---------- 2. Helpers: your time zone and "today" ----------
create or replace function public.user_tz() returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select s.tz from public.settings s where s.user_id = auth.uid()),
    'Asia/Kolkata')
$$;

create or replace function public.today_local() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone public.user_tz())::date
$$;


-- ---------- 3. Tables ----------
create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  emoji       text check (length(emoji) <= 16),
  section     text not null default 'day' check (section in ('morning','day','night')),
  kind        text not null default 'check' check (kind in ('check','count','timer','avoid','people')),
  target      int  not null default 1 check (target between 1 and 1440),
  unit        text check (length(unit) <= 20),
  xp          int  not null default 10 check (xp between 1 and 100),
  days        smallint[] not null default '{0,1,2,3,4,5,6}',
  auto_steps  boolean not null default false,
  sort_order  int  not null default 0,
  start_date  date not null default public.today_local(),
  archived_on date,
  created_at  timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits (user_id);

create table if not exists public.entries (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  day        date not null,
  value      int  not null default 0 check (value between 0 and 100000),
  target     int  not null default 1,   -- snapshot of the habit's target that day
  done       boolean not null default false,
  xp         int  not null default 0,
  meta       jsonb not null default '{}'::jsonb,
  done_at    timestamptz,
  updated_at timestamptz not null default now(),
  primary key (habit_id, day)
);
create index if not exists entries_user_day_idx on public.entries (user_id, day);

create table if not exists public.days (
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day       date not null,
  mood      smallint check (mood between 1 and 5),
  energy    smallint check (energy between 1 and 5),
  note      text check (length(note) <= 500),
  closed_at timestamptz,   -- you closed the day yourself
  sealed_at timestamptz,   -- the nightly job recorded it
  primary key (user_id, day)
);

create table if not exists public.urges (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid references public.habits(id) on delete cascade,
  at       timestamptz not null default now(),
  day      date not null default public.today_local()
);
create index if not exists urges_user_day_idx on public.urges (user_id, day);

create table if not exists public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  author      text check (length(author) <= 200),
  status      text not null default 'reading' check (status in ('reading','finished','dropped')),
  started_on  date default public.today_local(),
  finished_on date,
  created_at  timestamptz not null default now()
);

create table if not exists public.achievements (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null check (length(key) <= 60),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);


-- ---------- 4. The rules (database-enforced) ----------
-- These apply to the app. Admin edits in the Supabase dashboard
-- (and the nightly job) are not restricted.

-- Ticks: only today (+15 min grace after midnight), never a closed day.
create or replace function public.guard_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  tz    text;
  today date;
  grace date;
  d     date;
  h     public.habits;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  tz    := public.user_tz();
  today := (now() at time zone tz)::date;
  grace := ((now() - interval '15 minutes') at time zone tz)::date;
  d     := case when tg_op = 'DELETE' then old.day else new.day end;

  if d is distinct from today and d is distinct from grace then
    raise exception '1440: % is locked. Only today can be changed.', d;
  end if;
  if exists (select 1 from public.days x
             where x.user_id = auth.uid() and x.day = d
               and (x.closed_at is not null or x.sealed_at is not null)) then
    raise exception '1440: % is already closed.', d;
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'UPDATE' and (new.day <> old.day or new.habit_id <> old.habit_id) then
    raise exception '1440: an entry can''t be moved to another day or habit.';
  end if;

  select * into h from public.habits where id = new.habit_id;
  if not found then
    raise exception '1440: habit not found.';
  end if;
  if h.start_date > d or (h.archived_on is not null and h.archived_on <= d) then
    raise exception '1440: that habit isn''t active on %.', d;
  end if;

  new.target     := h.target;
  new.done       := new.value >= h.target;
  new.xp         := case when new.done then h.xp else 0 end;
  new.done_at    := case
                      when not new.done then null
                      when tg_op = 'UPDATE' and old.done then old.done_at
                      else now()
                    end;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists entries_guard on public.entries;
create trigger entries_guard
  before insert or update or delete on public.entries
  for each row execute function public.guard_entry();

-- Day reviews: only today, and frozen once closed.
create or replace function public.guard_day() returns trigger
language plpgsql set search_path = '' as $$
declare
  tz    text;
  today date;
  grace date;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  tz    := public.user_tz();
  today := (now() at time zone tz)::date;
  grace := ((now() - interval '15 minutes') at time zone tz)::date;

  if new.day is distinct from today and new.day is distinct from grace then
    raise exception '1440: % is locked. Only today can be changed.', new.day;
  end if;

  if tg_op = 'UPDATE' then
    if old.closed_at is not null or old.sealed_at is not null then
      raise exception '1440: % is already closed.', old.day;
    end if;
    new.day       := old.day;
    new.sealed_at := old.sealed_at;
  else
    new.sealed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists days_guard on public.days;
create trigger days_guard
  before insert or update on public.days
  for each row execute function public.guard_day();

-- Habits: history can't be rewritten (start date is fixed,
-- archiving can't be backdated).
create or replace function public.guard_habit() returns trigger
language plpgsql set search_path = '' as $$
declare
  today date;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  today := public.today_local();
  if tg_op = 'INSERT' then
    if new.start_date is null or new.start_date < today then
      new.start_date := today;
    end if;
  else
    new.start_date := old.start_date;
    if new.archived_on is not null and new.archived_on < today
       and new.archived_on is distinct from old.archived_on then
      new.archived_on := today;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists habits_guard on public.habits;
create trigger habits_guard
  before insert or update on public.habits
  for each row execute function public.guard_habit();

-- Urges: always stamped with the real time.
create or replace function public.guard_urge() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.at  := now();
  new.day := public.today_local();
  return new;
end $$;

drop trigger if exists urges_guard on public.urges;
create trigger urges_guard
  before insert on public.urges
  for each row execute function public.guard_urge();


-- ---------- 5. Nightly seal: misses become permanent ----------
-- For each of the last 7 days that has ended, records every habit
-- you didn't complete as a miss, and marks the day sealed.
create or replace function public.seal_days() returns int
language plpgsql security definer set search_path = '' as $$
declare
  s     record;
  d     date;
  today date;
  first date;
  n     int := 0;
  k     int;
begin
  for s in select * from public.settings loop
    today := (now() at time zone s.tz)::date;
    first := greatest(today - 7, (s.created_at at time zone s.tz)::date);
    d := first;
    while d < today loop
      insert into public.entries (user_id, habit_id, day, value, target, done, xp)
      select h.user_id, h.id, d, 0, h.target, false, 0
      from public.habits h
      where h.user_id = s.user_id
        and h.start_date <= d
        and (h.archived_on is null or h.archived_on > d)
        and extract(dow from d)::smallint = any (h.days)
      on conflict (habit_id, day) do nothing;
      get diagnostics k = row_count;
      n := n + k;

      insert into public.days (user_id, day, sealed_at)
      values (s.user_id, d, now())
      on conflict (user_id, day) do update
        set sealed_at = coalesce(public.days.sealed_at, excluded.sealed_at);

      d := d + 1;
    end loop;
  end loop;
  return n;
end $$;


-- ---------- 6. Row Level Security ----------
alter table public.settings           enable row level security;
alter table public.habits             enable row level security;
alter table public.entries            enable row level security;
alter table public.days               enable row level security;
alter table public.urges              enable row level security;
alter table public.books              enable row level security;
alter table public.achievements       enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own habits: read"   on public.habits;
drop policy if exists "own habits: add"    on public.habits;
drop policy if exists "own habits: edit"   on public.habits;
drop policy if exists "own habits: delete" on public.habits;
create policy "own habits: read" on public.habits for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own habits: add" on public.habits for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own habits: edit" on public.habits for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A habit with history can only be archived, not deleted.
create policy "own habits: delete" on public.habits for delete to authenticated
  using (user_id = (select auth.uid()) and start_date >= public.today_local());

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own days" on public.days;
create policy "own days" on public.days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own urges: read"   on public.urges;
drop policy if exists "own urges: add"    on public.urges;
drop policy if exists "own urges: delete" on public.urges;
create policy "own urges: read" on public.urges for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own urges: add" on public.urges for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own urges: delete" on public.urges for delete to authenticated
  using (user_id = (select auth.uid()) and day = public.today_local());

drop policy if exists "own books" on public.books;
create policy "own books" on public.books for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own achievements" on public.achievements;
create policy "own achievements" on public.achievements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own push" on public.push_subscriptions;
create policy "own push" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));


-- ---------- 7. Access: logged-in you only, nobody anonymous ----------
revoke all on public.settings, public.habits, public.entries, public.days,
              public.urges, public.books, public.achievements,
              public.push_subscriptions
  from anon;

grant select, insert, update         on public.settings           to authenticated;
grant select, insert, update, delete on public.habits             to authenticated;
grant select, insert, update, delete on public.entries            to authenticated;
grant select, insert, update         on public.days               to authenticated;
grant select, insert, delete         on public.urges              to authenticated;
grant select, insert, update, delete on public.books              to authenticated;
grant select, insert                 on public.achievements       to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

grant execute on function public.user_tz()     to authenticated;
grant execute on function public.today_local() to authenticated;
revoke execute on function public.seal_days()  from public, anon, authenticated;


-- ---------- 8. Run the seal every hour ----------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('1440-seal-days', '20 * * * *', $$select public.seal_days()$$);
