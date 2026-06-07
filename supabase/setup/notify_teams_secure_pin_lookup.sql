-- notify_teams: 全件 SELECT を禁止し、PIN 一致時のみ RPC で解決
-- プロジェクト: cekyskhvxyhvqnvpwqyl
-- SQL Editor で実行（line_notify_teams_and_link.sql の後）

-- 旧ポリシー（authenticated 全件読み取り）を削除
drop policy if exists "notify_teams read for authenticated" on public.notify_teams;

-- クライアントからの直接 SELECT を拒否（line-bot は service_role で RLS バイパス）
revoke all on table public.notify_teams from anon, authenticated;

-- PIN が一致した行だけ返す（SECURITY DEFINER = RLS をバイパスして 1 行のみ）
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
begin
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
  'チーム PIN から通知先を解決。notify_teams への直接 SELECT は不可。';

notify pgrst, 'reload schema';
