-- =====================================================================
--  Estilos Gestor — agendamento dos LEMBRETES e das NOTIFICAÇÕES PUSH
--  Rode DEPOIS da 0003 e DEPOIS de publicar o site (precisa do endereço).
--
--  ANTES DE RODAR, troque os dois valores marcados com  <<< TROCAR >>>:
--    1. o endereço do seu site publicado (sem barra no final)
--    2. o mesmo valor de PUSH_DISPATCH_SECRET configurado na Vercel
--  Os valores ficam guardados criptografados no Vault do Supabase.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Segredos (para trocar depois:  select vault.update_secret(id, 'novo valor')  )
select vault.create_secret('https://SEU-SITE.vercel.app', 'estilos_gestor_site_url');          -- <<< TROCAR >>>
select vault.create_secret('COLE_AQUI_O_PUSH_DISPATCH_SECRET', 'estilos_gestor_push_secret');  -- <<< TROCAR >>>

-- 2) Lembretes: a cada minuto. Funciona mesmo sem push (o aviso aparece no sino do site).
select cron.schedule(
  'estilos-gestor-lembretes',
  '* * * * *',
  $$ select public.process_due_reminders(); $$
);

-- 3) Envio das notificações push: a cada minuto chama a rota segura do site.
select cron.schedule(
  'estilos-gestor-push',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'estilos_gestor_site_url') || '/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'estilos_gestor_push_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Conferir:   select jobname, schedule, active from cron.job;
-- Histórico:  select * from cron.job_run_details order by start_time desc limit 20;
-- Respostas:  select status_code, content from net._http_response order by created desc limit 10;
