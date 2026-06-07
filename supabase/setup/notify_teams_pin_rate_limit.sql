-- チーム PIN: 6桁発行 + lookup レート制限（15分あたり10回 / ユーザー）
-- プロジェクト: cekyskhvxyhvqnvpwqyl
-- notify_teams_secure_pin_lookup.sql の後に実行

create table if not exists public.pin_lookup_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists pin_lookup_attempts_user_time_idx
  on public.pin_lookup_attempts (user_id, attempted_at desc);

alter table public.pin_lookup_attempts enable row level security;
revoke all on table public.pin_lookup_attempts from anon, authenticated;

create or replace function public.lookup_notify_team_by_pin(p_pin text)
returns table (
  pin text,
  team_name text,
  line_target_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_attempt_count int;
  v_max_attempts constant int := 10;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return;
  end if;

  select count(*)::int
  into v_attempt_count
  from public.pin_lookup_attempts
  where user_id = v_user_id
    and attempted_at > now() - interval '15 minutes';

  if v_attempt_count >= v_max_attempts then
    raise exception 'PIN lookup rate limit exceeded'
      using hint = 'rate_limit_exceeded';
  end if;

  insert into public.pin_lookup_attempts (user_id) values (v_user_id);

  delete from public.pin_lookup_attempts
  where attempted_at < now() - interval '24 hours';

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    return;
  end if;

  return query
  select n.pin, n.team_name, n.line_target_id
  from public.notify_teams n
  where n.pin = p_pin
  limit 1;
end;
$$;

revoke all on function public.lookup_notify_team_by_pin(text) from public;
grant execute on function public.lookup_notify_team_by_pin(text) to authenticated;

comment on function public.lookup_notify_team_by_pin(text) is
  'PIN 一致時のみ通知先を返す。15分10回まで（auth.uid 単位）。新規 PIN は6桁。';

notify pgrst, 'reload schema';
