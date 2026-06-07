-- session_logs INSERT 時に line-webhook Edge Function へ通知（pg_net）
-- プロジェクト: cekyskhvxyhvqnvpwqyl
-- 前提: line-webhook がデプロイ済み、LINE_ACCESS_TOKEN / LINE_TARGET_ID シークレット設定済み

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_line_webhook_on_session_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://cekyskhvxyhvqnvpwqyl.supabase.co/functions/v1/line-webhook',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'session_logs',
      'schema', 'public',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists session_logs_line_webhook on public.session_logs;

create trigger session_logs_line_webhook
  after insert on public.session_logs
  for each row
  execute function public.notify_line_webhook_on_session_log();
