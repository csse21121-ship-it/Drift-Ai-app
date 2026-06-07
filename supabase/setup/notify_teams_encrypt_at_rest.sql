-- LINE 通知先 ID 暗号化対応（Dashboard / SQL から平文 ID を見えにくくする）
-- 平文復号は Edge Function シークレット LINE_TARGET_ENCRYPTION_KEY のみ

-- 暗号文保存のため旧 CHECK（U/C/R 形式）を解除
alter table public.notify_teams
  drop constraint if exists notify_teams_line_target_id_check;

alter table public.user_line_links
  drop constraint if exists user_line_links_line_target_id_check;

-- notify_teams: ルックアップ用 HMAC キー（line-bot がグループ ID 照合に使用）
alter table public.notify_teams
  add column if not exists line_target_key text;

drop index if exists notify_teams_line_target_id_key;

create unique index if not exists notify_teams_line_target_key_key
  on public.notify_teams (line_target_key)
  where line_target_key is not null;

comment on column public.notify_teams.line_target_id is
  'AES-GCM 暗号文（v1:...）。平文 LINE グループ ID は保存しない。';
comment on column public.notify_teams.line_target_key is
  'HMAC ルックアップキー（hk:...）。LINE ID 自体は復元不可。';

comment on column public.user_line_links.line_target_id is
  'AES-GCM 暗号文（v1:...）。平文 LINE ユーザー ID は保存しない。';

comment on column public.session_logs.line_target_id is
  'AES-GCM 暗号文（v1:...）。平文は Edge Function のみ復号。';

-- 旧 RPC は line_target_id を返さない（Edge Function line-notify を使用）
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
  raise exception 'Use Edge Function line-notify (team_lookup) instead'
    using hint = 'deprecated_rpc';
end;
$$;

revoke all on function public.lookup_notify_team_by_pin(text) from public;

notify pgrst, 'reload schema';
