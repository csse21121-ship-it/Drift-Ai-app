-- session_logs にユーザー指定の LINE 通知先列を追加
alter table public.session_logs
  add column if not exists line_target_id text;

comment on column public.session_logs.line_target_id is
  'LINE Push 先（U=ユーザー / C=グループ）。NULL の行は通知しない。';

notify pgrst, 'reload schema';
