-- =====================================================================
--  OPCIONAL — verificação automática de vencimentos a cada hora.
--  Sem este agendamento, os status também são atualizados sempre que o
--  usuário abre a plataforma (get_my_status / usage_heartbeat).
--
--  Para usar: no Supabase, ative a extensão "pg_cron"
--  (Database > Extensions) e rode este arquivo no SQL Editor.
-- =====================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'estilos-gestor-vencimentos',
  '5 * * * *',
  $$ select public._refresh_subscriptions(null); $$
);
