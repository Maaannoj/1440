-- ============================================================
--  1440 · Board + reminders
--  Run this AFTER 1440-setup.sql.
--  Paste ALL of this into Supabase → SQL Editor → New query → Run.
--  Safe to run again later.
--
--  What it adds:
--   • Board names, and a board that shares only name, level and XP.
--     XP is worked out here from real ticks, so nobody can type in
--     a fake number.
--   • Reminder notifications: a check every minute that queues each
--     person's reminders and asks the "push" Edge Function to send them.
--   • The push keys (VAPID), generated inside the database once,
--     so there are no keys to copy anywhere.
-- ============================================================


-- ---------- 1. Board names ----------
alter table public.settings add column if not exists display_name text;
alter table public.settings drop constraint if exists settings_display_name_len;
alter table public.settings add constraint settings_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 20);


-- ---------- 2. Quest counts for one person on one day ----------
-- Same rule as the app: the quests scheduled that day, plus any
-- quest that already has a row for that day.
create or replace function public._quest_counts(p_user uuid, p_day date)
returns table (total int, done int)
language sql stable set search_path = '' as $$
  with s as (
    select h.id
    from public.habits h
    where h.user_id = p_user
      and h.start_date <= p_day
      and (h.archived_on is null or h.archived_on > p_day)
      and (cardinality(h.days) = 0 or extract(dow from p_day)::smallint = any (h.days))
    union
    select e.habit_id from public.entries e where e.user_id = p_user and e.day = p_day
  )
  select count(*)::int, (count(*) filter (where e.done))::int
  from s left join public.entries e on e.habit_id = s.id and e.day = p_day
$$;


-- ---------- 3. The board: name, level (from XP) and XP only ----------
-- Mirrors the app's XP rule: every finished quest pays its XP, and a
-- day where everything scheduled was done adds 50. "This week" starts
-- on Monday in each person's own time zone.
create or replace function public.board()
returns table (name text, is_me boolean, xp_total int, xp_week int)
language sql stable security definer set search_path = '' as $$
  with u as (
    select s.user_id, s.display_name, (now() at time zone s.tz)::date as today
    from public.settings s
  ),
  span as (
    select u.*,
           u.today - (extract(isodow from u.today)::int - 1) as monday,
           least((select min(h.start_date) from public.habits h where h.user_id = u.user_id),
                 (select min(e.day) from public.entries e where e.user_id = u.user_id)) as first_day
    from u
  ),
  d as (
    select sp.user_id, g::date as day
    from span sp
    cross join lateral generate_series(sp.first_day, sp.today, interval '1 day') g
    where sp.first_day is not null and sp.first_day <= sp.today
  ),
  sched as (
    -- a sealed day's rows are the permanent record; otherwise use the schedule
    select d.user_id, d.day, h.id as habit_id
    from d join public.habits h on h.user_id = d.user_id
    where h.start_date <= d.day
      and (h.archived_on is null or h.archived_on > d.day)
      and (cardinality(h.days) = 0 or extract(dow from d.day)::smallint = any (h.days))
      and not exists (select 1 from public.days x
                      where x.user_id = d.user_id and x.day = d.day and x.sealed_at is not null)
    union
    select e.user_id, e.day, e.habit_id
    from public.entries e join d on d.user_id = e.user_id and d.day = e.day
  ),
  per_day as (
    select s.user_id, s.day,
           count(*) as n,
           count(*) filter (where e.done) as n_done,
           coalesce(sum(e.xp), 0) as xp
    from sched s
    left join public.entries e on e.habit_id = s.habit_id and e.day = s.day
    group by s.user_id, s.day
  ),
  scored as (
    select p.user_id, p.day,
           p.xp + case when p.n > 0 and p.n_done = p.n then 50 else 0 end as pts
    from per_day p
  )
  select coalesce(nullif(btrim(sp.display_name), ''), 'Player') as name,
         sp.user_id = auth.uid() as is_me,
         coalesce(sum(sc.pts), 0)::int as xp_total,
         coalesce(sum(sc.pts) filter (where sc.day >= sp.monday), 0)::int as xp_week
  from span sp
  left join scored sc on sc.user_id = sp.user_id
  group by sp.user_id, sp.display_name, sp.monday
  order by xp_total desc
$$;


-- ---------- 4. Push keys, made inside the database ----------
-- Web Push needs a P-256 key pair (VAPID). These helpers generate one
-- with plain Postgres maths, once, and keep it in a locked table.
create table if not exists public.push_keys (
  id            int primary key default 1 check (id = 1),
  token         text not null,   -- shared with the Edge Function on each call
  vapid_public  text not null,
  vapid_private text not null,
  created_at    timestamptz not null default now()
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;

create or replace function public._hex_num(h text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare x numeric := 0; i int;
begin
  for i in 1..length(h) loop
    x := x * 16 + (position(lower(substr(h, i, 1)) in '0123456789abcdef') - 1);
  end loop;
  return x;
end $$;

create or replace function public._num_bytes(x numeric, n int) returns bytea
language plpgsql immutable set search_path = '' as $$
declare h text := ''; i int;
begin
  for i in 1..n loop
    h := lpad(to_hex(mod(x, 256)::int), 2, '0') || h;
    x := div(x, 256);
  end loop;
  return decode(h, 'hex');
end $$;

create or replace function public._b64url(b bytea) returns text
language sql immutable set search_path = '' as $$
  select translate(rtrim(replace(encode(b, 'base64'), E'\n', ''), '='), '+/', '-_')
$$;

-- d·G on the P-256 curve, returned as an uncompressed point (65 bytes).
create or replace function public._p256_public(d numeric) returns bytea
language plpgsql immutable set search_path = '' as $$
declare
  p  numeric := public._hex_num('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  b  numeric := public._hex_num('5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
  gx numeric := public._hex_num('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
  gy numeric := public._hex_num('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  bits text := '';
  k numeric := d;
  x1 numeric; y1 numeric; z1 numeric;
  delta numeric; gamma numeric; beta numeric; alpha numeric;
  zz numeric; u2 numeric; s2 numeric; h numeric; hh numeric; i4 numeric; j numeric; r numeric; v numeric;
  x3 numeric; y3 numeric; z3 numeric;
  t numeric; nt numeric; rr numeric; nr numeric; q numeric; tmp numeric;
  zi numeric; zi2 numeric; ax numeric; ay numeric;
  i int;
begin
  if d is null or d < 1 then raise exception 'bad private key'; end if;
  while k > 0 loop bits := mod(k, 2)::int::text || bits; k := div(k, 2); end loop;
  -- Jacobian coordinates, double-and-add from the top bit
  x1 := gx; y1 := gy; z1 := 1;
  for i in 2..length(bits) loop
    delta := mod(z1 * z1, p);
    gamma := mod(y1 * y1, p);
    beta  := mod(x1 * gamma, p);
    alpha := mod(3 * (x1 - delta) * (x1 + delta), p);
    x3 := mod(alpha * alpha - 8 * beta, p);
    z3 := mod((y1 + z1) * (y1 + z1) - gamma - delta, p);
    y3 := mod(alpha * (4 * beta - x3) - 8 * gamma * gamma, p);
    x1 := x3; y1 := y3; z1 := z3;
    if substr(bits, i, 1) = '1' then
      zz := mod(z1 * z1, p);
      u2 := mod(gx * zz, p);
      s2 := mod(gy * z1 * zz, p);
      h  := mod(u2 - x1, p);
      if h = 0 then raise exception 'unexpected point doubling'; end if;
      hh := mod(h * h, p);
      i4 := mod(4 * hh, p);
      j  := mod(h * i4, p);
      r  := mod(2 * (s2 - y1), p);
      v  := mod(x1 * i4, p);
      x3 := mod(r * r - j - 2 * v, p);
      y3 := mod(r * (v - x3) - 2 * y1 * j, p);
      z3 := mod((z1 + h) * (z1 + h) - zz - hh, p);
      x1 := x3; y1 := y3; z1 := z3;
    end if;
  end loop;
  -- back to normal coordinates: x = X/Z², y = Y/Z³
  z1 := mod(z1, p); if z1 < 0 then z1 := z1 + p; end if;
  t := 0; nt := 1; rr := p; nr := z1;
  while nr <> 0 loop
    q := div(rr, nr);
    tmp := t - q * nt; t := nt; nt := tmp;
    tmp := rr - q * nr; rr := nr; nr := tmp;
  end loop;
  zi := mod(t, p); if zi < 0 then zi := zi + p; end if;
  zi2 := mod(zi * zi, p);
  ax := mod(x1 * zi2, p); if ax < 0 then ax := ax + p; end if;
  ay := mod(y1 * zi2 * zi, p); if ay < 0 then ay := ay + p; end if;
  -- sanity check: the point must be on the curve
  if mod(ay * ay - (ax * ax * ax - 3 * ax + b), p) <> 0 then raise exception 'key check failed'; end if;
  return decode('04', 'hex') || public._num_bytes(ax, 32) || public._num_bytes(ay, 32);
end $$;

create or replace function public._push_init() returns void
language plpgsql security definer set search_path = '' as $$
declare
  n numeric := public._hex_num('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  d numeric;
begin
  if exists (select 1 from public.push_keys where id = 1) then return; end if;
  -- 366 random bits from the database's secure random generator
  d := mod(public._hex_num(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())
                                  || uuid_send(gen_random_uuid()), 'hex')), n - 1) + 1;
  insert into public.push_keys (id, token, vapid_public, vapid_private)
  values (1,
          encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'hex'),
          public._b64url(public._p256_public(d)),
          public._b64url(public._num_bytes(d, 32)));
end $$;


-- ---------- 5. Reminder queue ----------
create table if not exists public.push_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('morning','evening','last_call','test')),
  day        date not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  result     text          -- what the push service answered, e.g. 201
);
alter table public.push_queue add column if not exists result text;
-- each reminder goes out at most once a day
create unique index if not exists push_queue_once on public.push_queue (user_id, day, kind) where kind <> 'test';
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- Wakes the "push" Edge Function. Change the address here if your
-- Supabase project URL is different.
create or replace function public._push_ping() returns void
language plpgsql security definer set search_path = '' as $$
declare k public.push_keys;
begin
  select * into k from public.push_keys where id = 1;
  if k.token is null then return; end if;
  perform net.http_post(
    url := 'https://umdgecfjfjvavdpuzwxe.supabase.co/functions/v1/push',
    body := jsonb_build_object('token', k.token),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 15000);
end $$;

-- Runs every minute: queues reminders whose time has come (for people
-- with notifications on), then wakes the sender if anything is waiting.
create or replace function public.push_enqueue() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.push_queue (user_id, kind, day)
  select s.user_id, r.kind, (now() at time zone s.tz)::date
  from public.settings s
  cross join lateral (values ('morning', s.remind_morning),
                             ('evening', s.remind_evening),
                             ('last_call', s.remind_last_call)) r(kind, t)
  where r.t is not null
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = s.user_id)
    and ((now() at time zone s.tz)::time - r.t) between interval '0' and interval '20 minutes'
  on conflict do nothing;
  get diagnostics n = row_count;
  if exists (select 1 from public.push_queue
             where sent_at is null and created_at > now() - interval '30 minutes') then
    perform public._push_ping();
  end if;
  return n;
end $$;

-- Called by the Edge Function: hands over everything waiting, marks it sent.
-- Reminders are skipped when nothing is left; tests always go out.
create or replace function public.push_claim(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.push_keys;
  items jsonb;
begin
  select * into k from public.push_keys where id = 1;
  if k.token is null or p_token is distinct from k.token then
    raise exception '1440: not allowed.';
  end if;

  with q as (
    update public.push_queue pq set sent_at = now()
    where pq.sent_at is null and pq.created_at > now() - interval '30 minutes'
    returning pq.id, pq.user_id, pq.kind
  ),
  who as (
    select q.id, q.user_id, q.kind, s.prefs, s.display_name, (now() at time zone s.tz) as local_now
    from q join public.settings s on s.user_id = q.user_id
  ),
  counted as (
    select w.*, c.total, c.done
    from who w cross join lateral public._quest_counts(w.user_id, w.local_now::date) c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'qid', c.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth,
           'kind', c.kind, 'total', c.total, 'done', c.done,
           'minutes_left', 1440 - (extract(hour from c.local_now)::int * 60 + extract(minute from c.local_now)::int),
           'world', coalesce(c.prefs->>'world', 'cyberpunk'),
           'name', c.display_name)), '[]'::jsonb)
    into items
  from counted c
  join public.push_subscriptions ps on ps.user_id = c.user_id
  where c.kind = 'test' or c.done < c.total;

  return jsonb_build_object('public', k.vapid_public, 'private', k.vapid_private, 'items', items);
end $$;

-- Called by the Edge Function: forget phones that turned notifications off.
create or replace function public.push_gone(p_token text, p_endpoints text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_token is distinct from (select token from public.push_keys where id = 1) then
    raise exception '1440: not allowed.';
  end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end $$;

-- Called by the Edge Function: what each push service answered.
create or replace function public.push_done(p_token text, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is distinct from (select token from public.push_keys where id = 1) then
    raise exception '1440: not allowed.';
  end if;
  update public.push_queue pq
  set result = left(coalesce(pq.result || '; ', '') || r.res, 300)
  from (select (x->>'qid')::bigint as qid, string_agg(concat_ws(' ', x->>'status', nullif(x->>'text', '')), '; ') as res
        from jsonb_array_elements(p_results) x group by 1) r
  where pq.id = r.qid;
end $$;

-- The app: the public key a phone needs to subscribe.
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select vapid_public from public.push_keys where id = 1
$$;

-- The app: save this phone's subscription for the logged-in person.
-- If the phone was used by someone else before, it moves to you.
create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '1440: log in first.'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 40 and 200
     or coalesce(length(p_auth), 0) not between 10 and 100 then
    raise exception '1440: that notification address looks wrong.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- The app: "Send test". Goes out within a few seconds. Returns its number,
-- so the app can check on it.
drop function if exists public.send_test_push();
create or replace function public.send_test_push() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n int; qid bigint;
begin
  if auth.uid() is null then raise exception '1440: log in first.'; end if;
  select count(*) into n from public.push_subscriptions where user_id = auth.uid();
  if n = 0 then raise exception '1440: turn on reminders on this phone first.'; end if;
  if exists (select 1 from public.push_queue
             where user_id = auth.uid() and kind = 'test' and created_at > now() - interval '10 seconds') then
    raise exception '1440: one test at a time. Try again in a few seconds.';
  end if;
  insert into public.push_queue (user_id, kind, day) values (auth.uid(), 'test', public.today_local())
  returning id into qid;
  perform public._push_ping();
  return qid;
end $$;

-- The app: did the test go out, and what did the push service say?
create or replace function public.push_test_result(p_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('sent', q.sent_at is not null, 'result', q.result)
  from public.push_queue q
  where q.id = p_id and q.user_id = auth.uid()
$$;


-- ---------- 6. Access ----------
revoke all on function public._quest_counts(uuid, date), public._hex_num(text),
  public._num_bytes(numeric, int), public._b64url(bytea), public._p256_public(numeric),
  public._push_init(), public._push_ping(), public.push_enqueue()
  from public, anon, authenticated;

revoke all on function public.board(), public.push_public_key(),
  public.save_push(text, text, text), public.send_test_push(), public.push_test_result(bigint)
  from public, anon;
grant execute on function public.board(), public.push_public_key(),
  public.save_push(text, text, text), public.send_test_push(), public.push_test_result(bigint)
  to authenticated;

-- the Edge Function calls these with the public key; they need the token
revoke all on function public.push_claim(text), public.push_gone(text, text[]), public.push_done(text, jsonb) from public;
grant execute on function public.push_claim(text), public.push_gone(text, text[]), public.push_done(text, jsonb) to anon, authenticated;

-- make the keys now (does nothing if they already exist)
select public._push_init();


-- ---------- 7. Schedule ----------
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('1440-reminders', '* * * * *', $$select public.push_enqueue()$$);
select cron.schedule('1440-queue-cleanup', '40 3 * * *',
  $$delete from public.push_queue where created_at < now() - interval '7 days'$$);
select cron.schedule('1440-cron-log-cleanup', '45 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
