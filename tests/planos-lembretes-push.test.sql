\set ON_ERROR_STOP 0
\set VERBOSITY terse
\pset footer off
-- Utilitários de teste (temporários, só nesta sessão)
create function pg_temp.ok(label text, cond boolean) returns text language sql as $$
  select rpad(label, 72, '.') || case when cond then ' OK' else ' FALHOU' end $$;
create function pg_temp.err(label text, p_sql text, p_like text) returns text language plpgsql as $$
begin
  execute p_sql;
  return rpad(label, 72, '.') || ' FALHOU (nenhum erro)';
exception when others then
  return rpad(label, 72, '.') || case when sqlerrm ilike '%' || p_like || '%' then ' OK' else ' FALHOU: ' || sqlerrm end;
end $$;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1','gratis@ex.com',   now(), '{"full_name":"Fernanda Grátis"}'),
 ('00000000-0000-0000-0000-0000000000b1','basico@ex.com',   now(), '{"full_name":"Bruno Básico"}'),
 ('00000000-0000-0000-0000-0000000000a1','avancado@ex.com', now(), '{"full_name":"Ana Avançado"}'),
 ('00000000-0000-0000-0000-0000000000c1','anual@ex.com',    now(), '{"full_name":"Carla Anual"}'),
 ('00000000-0000-0000-0000-0000000000ad','vinizinnalexandre271@gmail.com',     now(), '{"full_name":"Dono"}');
insert into public.admin_users values ('00000000-0000-0000-0000-0000000000ad');

\echo
\echo '=== Planos definidos'
select id, price, billing_period, duration_months, daily_limit_seconds as limite_s, allow_reminders as lembretes,
       priority_support as suporte, featured, highlight, compare_to_plan_id as compara
from plans order by sort_order;

\echo '=== 9. Planos só são ativados pelo administrador'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.err('cliente tenta ativar plano para si mesmo', $$select admin_activate_plan(auth.uid(), 'completo')$$, 'ACESSO_NEGADO');
select pg_temp.err('cliente tenta inserir assinatura direto', $$insert into subscriptions (user_id, plan_id, status, price, expires_at) values (auth.uid(),'completo','ativa',0, now()+interval '1 year')$$, 'permission denied');
update plans set daily_limit_seconds = null where id = 'basico';  -- RLS: 0 linhas alteradas
select pg_temp.ok('plano Básico continua com limite após tentativa', (select daily_limit_seconds from plans where id='basico') = 36000);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select (admin_activate_plan('00000000-0000-0000-0000-0000000000b1', 'basico',   'PIX-B1')).status as basico;
select (admin_activate_plan('00000000-0000-0000-0000-0000000000a1', 'avancado', 'PIX-A1')).status as avancado;
select (admin_activate_plan('00000000-0000-0000-0000-0000000000c1', 'completo', 'PIX-C1')).status as anual;

-- Editar/salvar um plano não ativa nada para ninguém
update plans set price = 45, features = features || array['Teste de edição'] where id = 'basico';
select pg_temp.ok('editar plano não cria assinaturas novas', (select count(*) from subscriptions) = 3);
select pg_temp.ok('editar plano não muda o preço registrado do cliente', (select price from subscriptions where user_id='00000000-0000-0000-0000-0000000000b1') = 40);
select pg_temp.ok('usuário gratuito continua sem assinatura', not exists (select 1 from subscriptions where user_id='00000000-0000-0000-0000-0000000000f1'));
update plans set price = 40, features = array_remove(features, 'Teste de edição') where id = 'basico';
insert into plans (id, name, price, billing_period, duration_months, daily_limit_seconds, allow_reminders, sort_order)
values ('semestral', 'Plano Semestral', 180, 'mensal', 6, null, true, 4);
select pg_temp.ok('admin cria plano novo (sem ativar para ninguém)', (select count(*) from subscriptions) = 3);
select pg_temp.err('id de plano inválido é recusado', $$insert into plans (id, name, price, billing_period, duration_months) values ('Plano X!', 'X', 1, 'mensal', 1)$$, 'plans_id_format');
reset role;
delete from plans where id = 'semestral';

\echo '=== 2/3. Direitos de cada plano'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select 'gratuito' as quem, get_my_status() -> 'entitlements' as direitos;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select 'basico' as quem, get_my_status() -> 'entitlements' as direitos;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select 'avancado' as quem, get_my_status() -> 'entitlements' as direitos;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select 'anual' as quem, get_my_status() -> 'entitlements' as direitos;
select pg_temp.ok('Anual tem os mesmos recursos do Avançado (lembretes, push, suporte, sem limite)',
  (get_my_status() -> 'entitlements' ->> 'reminders')::boolean
  and (get_my_status() -> 'entitlements' ->> 'push')::boolean
  and (get_my_status() -> 'entitlements' ->> 'priority_support')::boolean
  and (get_my_status() -> 'entitlements' ->> 'daily_limit_seconds') is null);

\echo '=== 1/2. Contador diário'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok('Avançado: sem limite diário', (usage_heartbeat() ->> 'unlimited')::boolean);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok('Anual: sem limite diário', (usage_heartbeat() ->> 'unlimited')::boolean);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok('Gratuito: limite de 1 hora (3600 s)', (usage_heartbeat() ->> 'limit_seconds')::int = 3600);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select usage_heartbeat() ->> 'remaining_seconds' as basico_restante_primeiro_pulso;
select pg_temp.ok('Básico: limite de 10 horas (36000 s)', (usage_heartbeat() ->> 'limit_seconds')::int = 36000);
select pg_sleep(2);
select usage_heartbeat() ->> 'remaining_seconds' as basico_apos_2s;
select pg_temp.ok('Básico: tempo diminui com o uso ativo (2 s ≈ 2 s)',
  (select seconds_used between 1 and 4 from daily_usage where user_id = auth.uid() and day = br_today()));

-- Dois aparelhos: pulsos intercalados (A, B, A, B) a cada 1 s => conta ~3 s, não ~6 s
reset role;
update daily_usage set seconds_used = 100, last_heartbeat = now() where user_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_sleep(1); select usage_heartbeat() is not null as aparelho_1;
select pg_sleep(1); select usage_heartbeat() is not null as aparelho_2;
select pg_sleep(1); select usage_heartbeat() is not null as aparelho_1;
select pg_temp.ok('Dois aparelhos ao mesmo tempo não contam o tempo em dobro',
  (select seconds_used between 102 and 105 from daily_usage where user_id = auth.uid() and day = br_today()));

-- Pausa longa (aba fechada): no máximo 30 s por pulso
reset role;
update daily_usage set seconds_used = 1000, last_heartbeat = now() - interval '2 hours' where user_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select usage_heartbeat() is not null;
select pg_temp.ok('Tempo fora do app não é cobrado (máx. 30 s por pulso)',
  (select seconds_used <= 1030 from daily_usage where user_id = auth.uid() and day = br_today()));

-- Esgota as 10 horas
reset role;
update daily_usage set seconds_used = 35990, last_heartbeat = now() - interval '20 seconds' where user_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select usage_heartbeat() ->> 'remaining_seconds' as basico_restante_final, usage_heartbeat() ->> 'resets_at' as renova_em;
select pg_temp.ok('Básico: acesso bloqueado ao terminar as 10 horas', not has_access());
select pg_temp.err('Básico sem tempo não consegue cadastrar produto', $$insert into products (name, price, cost, stock) values ('X', 1, 1, 1)$$, 'row-level security');
select pg_temp.ok('Aviso "limite diário de 10 horas" criado uma única vez',
  (select count(*) = 1 from notifications where user_id = auth.uid() and kind = 'tempo' and title like '%10 horas%'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok('Avançado continua com acesso liberado', has_access());

\echo '=== 4. Básico e Gratuito não criam lembretes (verificado no banco)'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.err('Básico tenta criar lembrete', $$insert into reminders (title, category, due_date, due_time) values ('Pagar', 'pagamento', current_date + 1, '09:00')$$, 'row-level security');
select pg_temp.err('Básico tenta concluir lembrete via função', $$select complete_reminder(gen_random_uuid())$$, 'RECURSO_DO_PLANO');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.err('Gratuito tenta criar lembrete', $$insert into reminders (title, category, due_date, due_time) values ('Pagar', 'pagamento', current_date + 1, '09:00')$$, 'row-level security');

\echo '=== 5/6. Lembretes (Avançado e Anual)'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into reminders (title, description, category, due_date, due_time, amount, repeat, notify_before_minutes)
values ('Pagar fornecedor', 'Boleto da distribuidora.', 'pagamento',
        ((now() at time zone 'America/Sao_Paulo') + interval '2 minutes')::date,
        ((now() at time zone 'America/Sao_Paulo') + interval '2 minutes')::time(0), 350, 'unica', 5);
insert into reminders (title, category, due_date, due_time, repeat) values ('Conta de energia', 'pagamento', '2026-01-31', '09:00', 'mensal');
insert into reminders (title, category, due_date, due_time, repeat, notify_before_minutes) values ('Comprar mercadorias', 'compra', br_today(), '00:01', 'diaria', 30);
insert into reminders (title, category, due_date, due_time) values ('Lembrete antigo', 'outro', '2026-01-10', '10:00');
select title, repeat, occurrence as ocorr,
       to_char(next_due_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as proxima_brt,
       to_char(next_due_at at time zone 'UTC', 'HH24:MI') as utc,
       to_char(next_notify_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as aviso_brt
from reminders order by created_at;
select pg_temp.ok('Mensal criado em 31/01 pula para a próxima data futura (sem avisos atrasados)',
  (select next_due_at > now() and occurrence > 0 from reminders where title = 'Conta de energia'));
select pg_temp.ok('Fuso: 09:00 de Brasília = 12:00 UTC',
  (select to_char(next_due_at at time zone 'UTC', 'HH24:MI') = '12:00' from reminders where title = 'Conta de energia'));
select pg_temp.ok('Antecedência: aviso 30 min antes da ocorrência diária',
  (select next_due_at - next_notify_at = interval '30 minutes' from reminders where title = 'Comprar mercadorias'));
select pg_temp.ok('Lembrete único com data passada fica sem aviso (aparece como atrasado)',
  (select next_notify_at is null from reminders where title = 'Lembrete antigo'));
select pg_temp.err('Usuário não altera campos calculados pelo servidor', $$update reminders set next_notify_at = now() where title = 'Lembrete antigo'$$, 'permission denied');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into reminders (title, category, due_date, due_time, amount) values ('Comprar embalagens', 'compra', br_today() + 1, '08:00', 120);
select pg_temp.ok('Anual cria lembretes normalmente', (select count(*) = 1 from reminders));
select pg_temp.ok('Isolamento: Anual não vê lembretes do Avançado', not exists (select 1 from reminders where title = 'Pagar fornecedor'));
reset role;

-- O usuário sai da plataforma: os lembretes continuam salvos
select pg_temp.ok('Lembretes permanecem salvos no banco (sem sessão)', (select count(*) from reminders) = 5);

\echo '--- Processamento agendado (cron a cada minuto)'
select process_due_reminders() as notificados_1a_execucao;
select process_due_reminders() as notificados_2a_execucao;
select title, body from notifications where kind = 'lembrete' order by created_at;
select pg_temp.ok('Aviso do lembrete criado exatamente uma vez',
  (select count(*) = 1 from notifications where kind = 'lembrete' and title = '🔔 Lembrete: Pagar fornecedor'));
select pg_temp.ok('Texto inclui horário e valor', (select body like 'Hoje às %Valor: R$ 350,00.' from notifications where title = '🔔 Lembrete: Pagar fornecedor'));

-- Simula o horário do aviso da conta mensal chegando
update reminders set next_notify_at = now() - interval '1 minute' where title = 'Conta de energia';
select to_char(next_due_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as antes from reminders where title = 'Conta de energia';
select next_due_at as antes_ts from reminders where title = 'Conta de energia' \gset
select process_due_reminders() as notificados;
select to_char(next_due_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as depois from reminders where title = 'Conta de energia';
update reminders set next_notify_at = now() - interval '1 minute' where title = 'Conta de energia';
select process_due_reminders() as notificados;
select to_char(next_due_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as depois_2 from reminders where title = 'Conta de energia';
-- Lembrete do dia 31: em cada mês deve cair no último dia (30 em meses de 30 dias) às 09:00,
-- e voltar para o dia 31 nos meses que têm 31 dias (independe da data em que o teste roda).
select pg_temp.ok('Mensal respeita o fim do mês (dia 31 -> último dia de cada mês)',
  (select (l::date = (date_trunc('month', l) + interval '1 month - 1 day')::date) and to_char(l, 'HH24:MI') = '09:00'
     from (select next_due_at at time zone 'America/Sao_Paulo' as l from reminders where title = 'Conta de energia') x));
select pg_temp.ok('Mensal: avançou exatamente 2 meses em 2 execuções',
  (select (extract(year from l) * 12 + extract(month from l)) - (extract(year from b) * 12 + extract(month from b)) = 2
     from (select next_due_at at time zone 'America/Sao_Paulo' as l from reminders where title = 'Conta de energia') x,
          (select (:'antes_ts'::timestamptz at time zone 'America/Sao_Paulo') as b) y));
-- Reprocessar a mesma ocorrência não duplica
update reminders set occurrence = occurrence - 1 where title = 'Conta de energia';
update reminders set next_notify_at = now() - interval '1 minute' where title = 'Conta de energia';
select process_due_reminders() as reprocessado;
select pg_temp.ok('Mesma ocorrência processada de novo não gera aviso duplicado',
  (select count(*) = 2 from notifications where title = '🔔 Lembrete: Conta de energia'));

\echo '--- Concluir'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select (complete_reminder((select id from reminders where title = 'Pagar fornecedor'))).status as unico;
select (complete_reminder((select id from reminders where title = 'Comprar mercadorias'))).status as diario,
       (select occurrence from reminders where title = 'Comprar mercadorias') as ocorrencia;
select pg_temp.ok('Concluir lembrete repetido avança para a próxima ocorrência',
  (select status = 'ativo' and next_due_at > now() + interval '23 hours' from reminders where title = 'Comprar mercadorias'));
update reminders set status = 'ativo' where title = 'Pagar fornecedor';
select pg_temp.ok('Reabrir lembrete concluído funciona', (select status = 'ativo' from reminders where title = 'Pagar fornecedor'));
reset role;

-- Plano cancelado: lembretes continuam visíveis, mas não geram avisos
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select (admin_set_subscription_status((select id from subscriptions where user_id='00000000-0000-0000-0000-0000000000c1'), 'suspensa')).status as anual_suspenso;
reset role;
update reminders set next_notify_at = now() - interval '1 minute' where title = 'Comprar embalagens';
select process_due_reminders() as notificados;
select pg_temp.ok('Plano suspenso: lembrete não notifica', not exists (select 1 from notifications where title like '%Comprar embalagens%'));
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok('Plano suspenso: lembretes continuam visíveis', (select count(*) = 1 from reminders));
select pg_temp.err('Plano suspenso: não cria novos', $$insert into reminders (title, due_date, due_time) values ('x', current_date + 1, '10:00')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select (admin_set_subscription_status((select id from subscriptions where user_id='00000000-0000-0000-0000-0000000000c1'), 'ativa')).status as anual_reativado;

\echo '=== 7. Push: inscrição e fila de envio'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.err('Gratuito não inscreve aparelho para push', $$select save_push_subscription('https://fcm.googleapis.com/fcm/send/abc', repeat('B', 87), repeat('a', 22))$$, 'RECURSO_DO_PLANO');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.err('Endereço de push fora dos serviços conhecidos é recusado', $$select save_push_subscription('https://evil.example.com/x', repeat('B', 87), repeat('a', 22))$$, 'PUSH_ENDPOINT_INVALIDO');
select pg_temp.err('Inserir inscrição direto na tabela é bloqueado', $$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://fcm.googleapis.com/x', repeat('B',87), repeat('a',22))$$, 'permission denied');
select save_push_subscription('https://fcm.googleapis.com/fcm/send/ana-celular', repeat('B', 87), repeat('a', 22), 'Android Chrome');
select save_push_subscription('https://web.push.apple.com/ana-iphone', repeat('C', 87), repeat('b', 22), 'iPhone Safari');
select pg_temp.ok('Avançado inscreve 2 aparelhos', (select count(*) = 2 from push_subscriptions));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select save_push_subscription('https://fcm.googleapis.com/fcm/send/bruno-pc', repeat('D', 87), repeat('c', 22), 'Windows Chrome');
select pg_temp.ok('Básico (plano pago) também recebe notificações gerais', (select count(*) = 1 from push_subscriptions));
select pg_temp.ok('Usuário só vê os próprios aparelhos', not exists (select 1 from push_subscriptions where endpoint like '%ana%'));
-- Preferências: Bruno desliga vendas
insert into notification_preferences (vendas) values (false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select admin_broadcast('Manutenção programada', 'O sistema ficará indisponível domingo às 2h.') as comunicados_enviados;
reset role;
insert into notifications (user_id, kind, title, body) values ('00000000-0000-0000-0000-0000000000b1', 'venda', 'Venda registrada', 'teste');
insert into notifications (user_id, kind, title, body) values ('00000000-0000-0000-0000-0000000000b1', 'estoque', 'Estoque baixo: X', 'teste');
select u.email, n.kind, n.title, n.push_status from notifications n join auth.users u on u.id = n.user_id
where n.created_at > now() - interval '1 minute' and n.kind in ('admin','venda','estoque') order by u.email, n.kind;
select pg_temp.ok('Comunicado entra na fila de push só para quem tem aparelho e plano',
  (select count(*) = 2 from notifications where kind = 'admin' and push_status = 'pendente'));
select pg_temp.ok('Categoria desativada (vendas) não vai para o celular, mas fica no sino',
  (select push_status = 'nao_aplicavel' from notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and kind = 'venda'));
select pg_temp.ok('Gratuito: alertas internos continuam, sem push',
  (select bool_and(push_status = 'nao_aplicavel') from notifications where user_id = '00000000-0000-0000-0000-0000000000f1'));

\echo '--- Servidor de envio (service_role)'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.err('Cliente não acessa a fila de envio', $$select * from push_claim_batch(10)$$, 'permission denied');
select pg_temp.err('Cliente não dispara o processamento de lembretes', $$select process_due_reminders()$$, 'permission denied');
reset role;
set role service_role;
select notification_id is not null as tem_id, kind, title, json_array_length(subscriptions) as aparelhos from push_claim_batch(50) order by kind, aparelhos;
select pg_temp.ok('Segunda leitura da fila não repete os mesmos avisos', (select count(*) = 0 from push_claim_batch(50)));
select push_finish(id, 'enviada') from notifications where push_status = 'enviando';
select push_subscription_result('https://web.push.apple.com/ana-iphone', false, true);
reset role;
select pg_temp.ok('Avisos marcados como enviados', (select count(*) = 0 from notifications where push_status in ('pendente','enviando')));
select pg_temp.ok('Aparelho expirado (410) removido', (select count(*) = 1 from push_subscriptions where user_id = '00000000-0000-0000-0000-0000000000a1'));

\echo '=== 8. Painel administrativo protegido'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.err('Cliente chama lista de clientes', $$select * from admin_list_users(null)$$, 'ACESSO_NEGADO');
select pg_temp.err('Cliente chama histórico de outro cliente', $$select * from admin_user_history('00000000-0000-0000-0000-0000000000b1')$$, 'ACESSO_NEGADO');
select pg_temp.err('Cliente chama renovar', $$select admin_renew_subscription((select id from subscriptions limit 1))$$, 'ACESSO_NEGADO');
select pg_temp.ok('Cliente não lê histórico pela tabela', (select count(*) = 0 from subscription_events));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select email, plan_name, status, to_char(started_at, 'DD/MM/YYYY') as ativacao, to_char(expires_at, 'DD/MM/YYYY') as vencimento, priority_support as prioritario
from admin_list_users(null) order by email;
select (admin_renew_subscription((select id from subscriptions where user_id='00000000-0000-0000-0000-0000000000b1'), 'PIX-B2')).status as renovado;
select action, plan_name, details, actor_email from admin_user_history('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok('Histórico registra ativação, suspensão e reativação',
  (select array_agg(action order by created_at) = array['ativacao','suspensao','reativacao'] from admin_user_history('00000000-0000-0000-0000-0000000000c1')));
reset role;
