-- session_logs クラウド保存 — Supabase SQL Editor で実行
-- プロジェクト: cekyskhvxyhvqnvpwqyl
--
-- テーブル / ポリシーが既にある場合は storage_logs_bucket.sql だけ実行してください。

-- 2. session_logs（未作成の場合のみ）
create table if not exists public.session_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_url text not null,
  score numeric not null,
  track_name text,
  car_model text,
  created_at timestamptz not null default now()
);

alter table public.session_logs enable row level security;

-- 既存ポリシー名（Dashboard 作成分）があっても衝突しないよう DROP してから作成
drop policy if exists "Users can view their own data" on public.session_logs;
drop policy if exists "Users can insert their own data" on public.session_logs;
drop policy if exists "session_logs insert own" on public.session_logs;
drop policy if exists "session_logs select own" on public.session_logs;

create policy "session_logs insert own"
  on public.session_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "session_logs select own"
  on public.session_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 3. Storage バケット logs
insert into storage.buckets (id, name, public)
values ('logs', 'logs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "logs upload own folder" on storage.objects;
create policy "logs upload own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "logs read public" on storage.objects;
create policy "logs read public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'logs');
