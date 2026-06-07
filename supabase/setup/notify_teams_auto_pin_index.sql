-- notify_teams: 同一グループの重複登録を防ぐ（ボット参加時の自動 PIN 発行用）
create unique index if not exists notify_teams_line_target_id_key
  on public.notify_teams (line_target_id);

notify pgrst, 'reload schema';
