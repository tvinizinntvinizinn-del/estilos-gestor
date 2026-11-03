\set ON_ERROR_STOP 0
\set VERBOSITY terse
\pset footer off
\pset tuples_only on
-- Testes da atualização 0005 (versão pública). Rodar em banco com 0001 + 0003 + 0005.
create function pg_temp.ok(label text, cond boolean) returns text language sql as $$
  select rpad(label, 76, '.') || case when coalesce(cond, false) then ' OK' else ' FALHOU' end $$;
create function pg_temp.err(label text, p_sql text, p_like text) returns text language plpgsql as $$
begin
  execute p_sql;
  return rpad(label, 76, '.') || ' FALHOU (nenhum erro)';
exception when others then
  return rpad(label, 76, '.') || case when sqlerrm ilike '%' || p_like || '%' then ' OK' else ' FALHOU: ' || sqlerrm end;
end $$;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); end $$;

-- Proprietário começa com e-mail NÃO confirmado
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a0','VinizinnAlexandre271@gmail.com', null, '{"full_name":"Vini (dono)"}'),
 ('00000000-0000-0000-0000-0000000000e1','antigo-admin@ex.com', now(), '{"full_name":"Antigo Admin"}'),
 ('00000000-0000-0000-0000-0000000000c1','cliente1@ex.com',     now(), '{"full_name":"Cliente Um"}'),
 ('00000000-0000-0000-0000-0000000000c2','cliente2@ex.com',     now(), '{"full_name":"Cliente Dois"}'),
 ('00000000-0000-0000-0000-0000000000c3','cliente3@ex.com',     now(), '{"full_name":"Cliente Três"}');
insert into public.admin_users values ('00000000-0000-0000-0000-0000000000e1') on conflict do nothing;

\echo '=== 1. Conta exclusiva do proprietário'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select pg_temp.ok('E-mail do dono sem confirmação NÃO dá acesso administrativo', not public.is_admin());
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000a0';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select pg_temp.ok('Dono (e-mail confirmado, maiúsculas/minúsculas ignoradas) é administrador', public.is_admin());
select pg_temp.ok('Papel retornado: owner', (public.get_my_status()::jsonb ->> 'role') = 'owner');
select pg_temp.ok('Dono: sem limite de tempo (sem contador)', (public.get_my_status()::jsonb -> 'entitlements' ->> 'daily_limit_seconds') is null);
select pg_temp.ok('Dono: todas as funcionalidades (push, lembretes, suporte)',
  (select (e ->> 'push')::boolean and (e ->> 'reminders')::boolean and (e ->> 'priority_support')::boolean
     from (select public.get_my_status()::jsonb -> 'entitlements' as e) x));
select pg_temp.ok('Dono: heartbeat responde ilimitado', (public.usage_heartbeat()::jsonb ->> 'unlimited')::boolean);

\echo '=== Indicadores começam em zero (sem registros)'
select pg_temp.ok('Minhas Vendas zerado: vendas, recebido, assinantes, lucro',
  (select (r ->> 'sales_count')::int = 0 and (r ->> 'total_received')::numeric = 0
      and (r ->> 'active_subscribers')::int = 0 and (r ->> 'net_profit')::numeric = 0
      and (r ->> 'expenses_total')::numeric = 0
   from (select public.admin_sales_report()::jsonb as r) x));

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok('Antigo administrador (tabela admin_users) perdeu o acesso', not public.is_admin());
select pg_temp.err('Antigo administrador não abre relatório de vendas', 'select public.admin_sales_report()', 'ACESSO_NEGADO');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok('Cliente comum: papel cliente', (public.get_my_status()::jsonb ->> 'role') = 'cliente');
select pg_temp.err('Cliente não lê a tabela do proprietário', 'select * from public.platform_owner', 'permission denied');
select pg_temp.err('Cliente não se coloca como administrador', $$insert into public.admin_users values ('00000000-0000-0000-0000-0000000000c1')$$, 'permission denied');
select pg_temp.err('Cliente não troca o hash do proprietário', $$update public.platform_owner set email_sha256 = repeat('a', 64)$$, 'permission denied');
select pg_temp.err('Cliente não chama a verificação interna de admin', $$select public._is_admin_user('00000000-0000-0000-0000-0000000000c1')$$, 'permission denied');
select pg_temp.err('Cliente não registra venda', $$select public.admin_register_subscription_sale('cliente1@ex.com','x','avancado',70,current_date,'pix','confirmado',null,null,'chave-cliente-123')$$, 'ACESSO_NEGADO');
select pg_temp.err('Cliente não confirma pagamento', $$select public.admin_confirm_payment(gen_random_uuid())$$, 'ACESSO_NEGADO');
select pg_temp.err('Cliente não lista vendas', $$select * from public.admin_list_subscription_sales()$$, 'ACESSO_NEGADO');
select pg_temp.err('Cliente não ativa plano para si mesmo', $$select public.admin_activate_plan('00000000-0000-0000-0000-0000000000c1','avancado')$$, 'ACESSO_NEGADO');

\echo '=== 2. Limites de tempo'
select pg_temp.ok('Gratuito: 1 hora por dia (3600 s)', (public.get_my_status()::jsonb -> 'entitlements' ->> 'daily_limit_seconds')::int = 3600);
select pg_temp.ok('Contador gratuito começa em 01:00:00', (public.usage_heartbeat()::jsonb ->> 'remaining_seconds')::int between 3590 and 3600);
reset role;
select pg_temp.ok('Básico 10 h; Avançado e Anual ilimitados',
  (select daily_limit_seconds from plans where id = 'basico') = 36000
  and (select daily_limit_seconds from plans where id = 'avancado') is null
  and (select daily_limit_seconds from plans where id = 'completo') is null);
select pg_temp.ok('WhatsApp oficial configurado (+55 11 95931-1513)', (select whatsapp_number from app_settings) = '5511959311513');
select pg_temp.ok('Instagram começa vazio (sem link inventado)', (select instagram_url from app_settings) is null);

\echo '=== 3. Registrar nova venda (confirmada)'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select public.admin_register_subscription_sale('Cliente1@ex.com', 'Cliente Um', 'avancado', 70, public.br_today(), 'pix', 'confirmado', 'PIX-0001', 'primeira venda', 'idem-venda-0001') ->> 'id' as venda1 \gset
select pg_temp.ok('Venda confirmada vinculada à conta certa', (select user_id = '00000000-0000-0000-0000-0000000000c1' and status = 'confirmado' and kind = 'ativacao' from subscription_payments where id = :'venda1'));
select pg_temp.ok('Plano liberado com vencimento em 1 mês',
  (select status = 'ativa' and plan_id = 'avancado' and expires_at::date = (now() + interval '1 month')::date
     from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c1' order by created_at desc limit 1));
select pg_temp.ok('Data de vencimento registrada na venda', (select period_end is not null from subscription_payments where id = :'venda1'));
select pg_temp.ok('Indicadores atualizados: 1 venda, R$ 70, 1 assinante, lucro R$ 70',
  (select (r ->> 'sales_count')::int = 1 and (r ->> 'total_received')::numeric = 70
      and (r ->> 'active_subscribers')::int = 1 and (r ->> 'net_profit')::numeric = 70 and (r ->> 'new_customers')::int = 1
   from (select public.admin_sales_report()::jsonb as r) x));
select public.admin_register_subscription_sale('cliente1@ex.com', 'Cliente Um', 'avancado', 70, public.br_today(), 'pix', 'confirmado', 'PIX-0001', 'primeira venda', 'idem-venda-0001') is not null as reenvio;
select pg_temp.ok('Mesma operação enviada 2x não duplica a venda', (select count(*) = 1 from subscription_payments where idempotency_key = 'idem-venda-0001'));
select pg_temp.err('Mesmo comprovante (PIX-0001) não conta duas vezes', $$select public.admin_register_subscription_sale('cliente2@ex.com','Cliente Dois','basico',40,public.br_today(),'pix','confirmado','pix-0001',null,'idem-outra-0002')$$, 'PAGAMENTO_DUPLICADO');
select pg_temp.err('E-mail sem conta é recusado', $$select public.admin_register_subscription_sale('naoexiste@ex.com','X','basico',40,public.br_today(),'pix','confirmado',null,null,'idem-nao-0003')$$, 'USUARIO_NAO_ENCONTRADO');
select pg_temp.err('Valor zero é recusado', $$select public.admin_register_subscription_sale('cliente2@ex.com','X','basico',0,public.br_today(),'pix','confirmado',null,null,'idem-zero-0004')$$, 'VALOR_INVALIDO');
select pg_temp.err('Data de pagamento no futuro é recusada', $$select public.admin_register_subscription_sale('cliente2@ex.com','X','basico',40,public.br_today()+1,'pix','confirmado',null,null,'idem-futuro-05')$$, 'DATA_INVALIDA');
select pg_temp.ok('Indicador não mudou após tentativas recusadas', (public.admin_sales_report()::jsonb ->> 'sales_count')::int = 1);

\echo '=== 4. Pagamento pendente'
select public.admin_register_subscription_sale('cliente2@ex.com', 'Cliente Dois', 'basico', 40, public.br_today() - 1, 'transferencia', 'pendente', null, null, 'idem-pend-0006') ->> 'id' as pend \gset
select pg_temp.ok('Pendente não entra no faturamento nem nas vendas',
  (select (r ->> 'sales_count')::int = 1 and (r ->> 'total_received')::numeric = 70 and (r ->> 'pending_count')::int = 1 and (r ->> 'pending_amount')::numeric = 40
   from (select public.admin_sales_report()::jsonb as r) x));
select pg_temp.ok('Pendente não libera plano', not exists (select 1 from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c2'));
select public.admin_confirm_payment(:'pend') is not null as confirmou;
select public.admin_confirm_payment(:'pend') is not null as confirmou_de_novo;
select pg_temp.ok('Confirmar libera o Plano Básico', exists (select 1 from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c2' and status = 'ativa' and plan_id = 'basico'));
select pg_temp.ok('Confirmar 2x não duplica (2 vendas, R$ 110, 2 assinantes)',
  (select (r ->> 'sales_count')::int = 2 and (r ->> 'total_received')::numeric = 110 and (r ->> 'active_subscribers')::int = 2
      and (select count(*) from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c2') = 1
   from (select public.admin_sales_report()::jsonb as r) x));
select pg_temp.err('Pagamento confirmado não pode ser "cancelado"', format('select public.admin_cancel_payment(%L)', :'pend'), 'TRANSICAO_INVALIDA');

select public.admin_register_subscription_sale('cliente3@ex.com', 'Cliente Três', 'completo', 240, public.br_today(), 'credito', 'pendente', null, null, 'idem-pend-0007') ->> 'id' as pend2 \gset
select public.admin_cancel_payment(:'pend2', 'cliente desistiu') is not null as cancelou;
select pg_temp.ok('Pendente cancelado não conta e não libera plano',
  (select status = 'cancelado' from subscription_payments where id = :'pend2')
  and not exists (select 1 from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c3'));
select pg_temp.err('Cancelado não pode ser confirmado depois', format('select public.admin_confirm_payment(%L)', :'pend2'), 'TRANSICAO_INVALIDA');

\echo '=== 5. Renovação e plano anual'
select to_char(expires_at, 'YYYY-MM-DD HH24:MI') as venc_antes from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c1' and status = 'ativa' \gset
select public.admin_register_subscription_sale('cliente1@ex.com', 'Cliente Um', 'avancado', 70, public.br_today(), 'pix', 'confirmado', 'PIX-0002', null, 'idem-renova-0008') ->> 'kind' as tipo \gset
select pg_temp.ok('Mesmo plano ativo = renovação', :'tipo' = 'renovacao');
select pg_temp.ok('Renovação soma 1 mês a partir do vencimento atual (não perde dias)',
  (select to_char(expires_at, 'YYYY-MM-DD HH24:MI') = to_char(:'venc_antes'::timestamp + interval '1 month', 'YYYY-MM-DD HH24:MI')
     from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c1' and status = 'ativa'));
select pg_temp.ok('Renovação conta como venda, mas não como cliente novo (3 vendas, 2 clientes)',
  (select (r ->> 'sales_count')::int = 3 and (r ->> 'new_customers')::int = 2 and (r ->> 'renewals')::int = 1 and (r ->> 'active_subscribers')::int = 2
   from (select public.admin_sales_report()::jsonb as r) x));
select public.admin_register_subscription_sale('cliente3@ex.com', 'Cliente Três', 'completo', 240, public.br_today(), 'pix', 'confirmado', null, null, 'idem-anual-0009') is not null as anual;
select pg_temp.ok('Plano Completo Anual: vencimento em 12 meses',
  (select expires_at::date = (now() + interval '12 months')::date from subscriptions where user_id = '00000000-0000-0000-0000-0000000000c3' and status = 'ativa'));
reset role;
select pg_temp.ok('Anual recebe os recursos do Avançado (lembretes)', public._has_feature('00000000-0000-0000-0000-0000000000c3', 'lembretes'));
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');

\echo '=== 6. Despesas e lucro líquido'
insert into public.platform_expenses (description, category, amount) values ('Hospedagem Vercel', 'hospedagem', 100), ('Domínio .com.br', 'dominio', 40);
select pg_temp.ok('Faturamento R$ 420; despesas R$ 140; lucro R$ 280 (faturamento ≠ lucro)',
  (select (r ->> 'total_received')::numeric = 420 and (r ->> 'expenses_total')::numeric = 140 and (r ->> 'net_profit')::numeric = 280
   from (select public.admin_sales_report()::jsonb as r) x));
select pg_temp.ok('Faturamento por plano', (select json_array_length(public.admin_sales_report()::json -> 'by_plan') = 3));
select pg_temp.ok('Filtro de período: ontem = 1 venda (pago ontem, confirmado hoje)',
  (select (public.admin_sales_report(
      ((public.br_today() - 1)::timestamp at time zone 'America/Sao_Paulo'),
      ((public.br_today())::timestamp at time zone 'America/Sao_Paulo') - interval '1 second')::jsonb ->> 'sales_count')::int = 1));

\echo '=== 7. Estorno'
select pg_temp.err('Estorno exige motivo', format('select public.admin_refund_payment(%L, %L)', :'venda1', ' '), 'MOTIVO_OBRIGATORIO');
select public.admin_refund_payment(:'venda1', 'pagamento devolvido') is not null as estornou;
select pg_temp.ok('Estorno sai do faturamento (R$ 350) e do lucro (R$ 210)',
  (select (r ->> 'total_received')::numeric = 350 and (r ->> 'net_profit')::numeric = 210 and (r ->> 'refunded_amount')::numeric = 70
   from (select public.admin_sales_report()::jsonb as r) x));

\echo '=== 8. Proteção dos valores e separação dos dados'
reset role;
select pg_temp.err('Nem pelo banco dá para mudar o valor de uma venda', format('update subscription_payments set amount = 1 where id = %L', :'venda1'), 'PAGAMENTO_IMUTAVEL');
select pg_temp.err('Venda não pode ser apagada', format('delete from subscription_payments where id = %L', :'venda1'), 'PAGAMENTO_NAO_PODE_SER_EXCLUIDO');
select pg_temp.err('Estornado não volta a confirmado', format('update subscription_payments set status = %L where id = %L', 'confirmado', :'venda1'), 'TRANSICAO_INVALIDA');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.err('Cliente não altera pagamentos', $$update public.subscription_payments set amount = 1$$, 'permission denied');
select pg_temp.ok('Cliente não vê vendas da plataforma', (select count(*) = 0 from public.subscription_payments));
select pg_temp.ok('Cliente não vê despesas da plataforma', (select count(*) = 0 from public.platform_expenses));
select pg_temp.err('Cliente não registra despesa da plataforma', $$insert into public.platform_expenses (description, category, amount) values ('x', 'outros', 1)$$, 'row-level security');
select pg_temp.ok('Cliente não vê o registro de operações', (select count(*) = 0 from public.admin_audit_log));
update public.app_settings set whatsapp_number = '5511000000000';
select pg_temp.ok('WhatsApp continua o oficial', (select whatsapp_number from public.app_settings) = '5511959311513');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select pg_temp.ok('Dono não vê produtos/movimentações dos clientes',
  (select count(*) = 0 from public.products) and (select count(*) = 0 from public.transactions));
select pg_temp.err('Instagram com endereço inválido é recusado', $$update public.app_settings set instagram_url = 'https://exemplo.com/perfil'$$, 'instagram_url');
update public.app_settings set instagram_url = 'https://www.instagram.com/estilosgestor' where id = 1;
select pg_temp.ok('Dono cadastra o Instagram', (select instagram_url from public.app_settings) = 'https://www.instagram.com/estilosgestor');
reset role;
set role anon;
select pg_temp.ok('Visitante lê WhatsApp e Instagram (rodapé público)', (select whatsapp_number is not null and instagram_url is not null from public.app_settings));
select pg_temp.err('Visitante não abre relatório', 'select public.admin_sales_report()', 'permission denied');
reset role;

\echo '=== 9. Registro de operações'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select pg_temp.ok('Registra venda, confirmação, cancelamento e estorno',
  (select count(distinct action) = 4 from public.admin_audit_log
    where action in ('venda_registrada', 'pagamento_confirmado', 'pagamento_cancelado', 'pagamento_estornado')));
select pg_temp.ok('Registra despesas e configurações',
  exists (select 1 from public.admin_audit_log where action = 'despesa_registrada')
  and exists (select 1 from public.admin_audit_log where action = 'configuracoes_alteradas'));
select pg_temp.ok('Registro identifica quem fez (e-mail do dono)',
  (select bool_and(actor_email ilike 'vinizinnalexandre271@gmail.com') from public.admin_audit_log where action = 'venda_registrada'));
reset role;
select pg_temp.err('Registro de operações não pode ser alterado', 'update public.admin_audit_log set summary = $$x$$', 'REGISTRO_IMUTAVEL');
select pg_temp.err('Registro de operações não pode ser apagado', 'delete from public.admin_audit_log', 'REGISTRO_IMUTAVEL');

\echo '=== 10. Conta excluída: histórico financeiro preservado'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select public.delete_my_account();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select pg_temp.ok('Venda do cliente excluído continua no faturamento (com e-mail registrado)',
  (select count(*) = 1 from public.admin_list_subscription_sales() where customer_email = 'cliente2@ex.com' and user_id is null and status = 'confirmado')
  and (public.admin_sales_report()::jsonb ->> 'total_received')::numeric = 350);
select pg_temp.ok('Assinantes ativos não conta conta excluída nem o dono', (public.admin_sales_report()::jsonb ->> 'active_subscribers')::int = 2);
reset role;
