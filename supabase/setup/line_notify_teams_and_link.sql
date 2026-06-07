-- LINE 通知 — チーム PIN / 個人連携用テーブル
-- プロジェクト: cekyskhvxyhvqnvpwqyl

-- 主催者が登録: PIN → グループ LINE ID（ユーザーは PIN だけ入力）
create table if not exists public.notify_teams (
  pin text primary key check (pin ~ '^[0-9]{4,6}$'),
  team_name text not null,
  line_target_id text not null,
  line_target_key text,
  created_at timestamptz not null default now()
);

alter table public.notify_teams enable row level security;

-- 直接 SELECT は不可（lookup_notify_team_by_pin RPC を使用）
revoke all on table public.notify_teams from anon, authenticated;

-- 旧ポリシーが残っている場合は削除
drop policy if exists "notify_teams read for authenticated" on public.notify_teams;

-- PIN lookup レート制限（15分 / 10回 / auth.uid）
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

-- 個人連携: アプリが発行した6桁コード（10分有効）
create table if not exists public.line_link_pending (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.line_link_pending enable row level security;

drop policy if exists "line_link_pending own" on public.line_link_pending;
create policy "line_link_pending own"
  on public.line_link_pending
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 連携完了後の LINE ユーザー ID
create table if not exists public.user_line_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  line_target_id text not null,
  linked_at timestamptz not null default now()
);

alter table public.user_line_links enable row level security;

drop policy if exists "user_line_links own read" on public.user_line_links;
create policy "user_line_links own read"
  on public.user_line_links
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists line_link_pending_code_idx on public.line_link_pending (code);

-- ボットがグループ参加時に PIN を自動発行（line-bot Edge Function）
-- 手動登録は不要。必要なら以下の例で上書き可能:
-- insert into public.notify_teams (pin, team_name, line_target_id) ...

notify pgrst, 'reload schema';
