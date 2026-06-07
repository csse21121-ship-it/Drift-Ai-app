-- PIN 当て試し対策強化: 失敗時のみ記録 + IP 単位レート制限
-- プロジェクト: cekyskhvxyhvqnvpwqyl

-- ユーザー別失敗記録（成功時は行を増やさない）
alter table public.pin_lookup_attempts
  add column if not exists ip_hash text;

comment on table public.pin_lookup_attempts is
  'PIN lookup 失敗のみ記録（15分10回/ユーザー）。成功はカウントしない。';

-- IP 別失敗記録（同一回線からの総当たり対策）
create table if not exists public.pin_lookup_ip_failures (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  failed_at timestamptz not null default now()
);

create index if not exists pin_lookup_ip_failures_hash_time_idx
  on public.pin_lookup_ip_failures (ip_hash, failed_at desc);

alter table public.pin_lookup_ip_failures enable row level security;
revoke all on table public.pin_lookup_ip_failures from anon, authenticated;

notify pgrst, 'reload schema';
