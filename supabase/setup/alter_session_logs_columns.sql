-- session_logs にアプリが INSERT する列を追加（既存テーブル用）
-- プロジェクト: cekyskhvxyhvqnvpwqyl
-- SQL Editor で実行 — 既存データは保持されます

alter table public.session_logs
  add column if not exists file_url text,
  add column if not exists track_name text,
  add column if not exists car_model text;

-- INSERT ポリシー（無い場合のみ追加）
drop policy if exists "session_logs insert own" on public.session_logs;
create policy "session_logs insert own"
  on public.session_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- PostgREST のスキーマキャッシュ更新（列追加後に推奨）
notify pgrst, 'reload schema';
