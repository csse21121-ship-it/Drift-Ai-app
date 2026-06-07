-- Storage バケット logs のみ作成（session_logs テーブル / ポリシーは触らない）
-- プロジェクト: cekyskhvxyhvqnvpwqyl
-- SQL Editor: https://supabase.com/dashboard/project/cekyskhvxyhvqnvpwqyl/sql/new

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
