-- =====================================================================
--  Estilos Gestor — atualização 0005: VERSÃO PÚBLICA
--   1. Conta exclusiva do proprietário (único acesso administrativo)
--   2. Novos limites: Gratuito 1 h/dia, Básico 10 h/dia, Avançado e Anual ilimitados
--   3. Vendas de assinaturas: registro manual, pendente/confirmado, estorno,
--      proteção contra pagamento duplicado e contra alteração de valores
--   4. Despesas da plataforma e relatório "Minhas Vendas" (lucro líquido)
--   5. Registro de operações administrativas (auditoria)
--   6. WhatsApp oficial e link do Instagram configurável
--
--  Rode DEPOIS da 0001 e da 0003, no SQL Editor do Supabase.
--  Não apaga dados de clientes: só acrescenta colunas/tabelas e atualiza funções.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Proprietário da plataforma
--  Guardamos apenas o SHA-256 do e-mail (o endereço não fica exposto no
--  código). Para trocar o proprietário no futuro, rode no SQL Editor:
--    update public.platform_owner
--       set email_sha256 = public._email_hash('novo-email@exemplo.com'), updated_at = now()
--     where id = 1;
-- ---------------------------------------------------------------------

create or replace function public._email_hash(p_email text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(lower(trim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;

create table if not exists public.platform_owner (
  id            int primary key default 1 check (id = 1),
  email_sha256  text not null check (email_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at    timestamptz not null default now()
);
alter table public.platform_owner enable row level security;   -- sem políticas: ninguém lê ou altera pela API
revoke all on public.platform_owner from anon, authenticated;

-- vinizinnalexandre271@gmail.com
insert into public.platform_owner (id, email_sha256)
values (1, '4509403e4c921552071da7e7675ed002736378a7ab3817c6b9947b44ab757dd6')
on conflict (id) do update set email_sha256 = excluded.email_sha256, updated_at = now();

-- Proprietário = conta com o e-mail autorizado E com o e-mail confirmado.
-- (Quem tentar se cadastrar com esse e-mail sem ter acesso à caixa de entrada não confirma a conta.)
create or replace function public._is_admin_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1
    from auth.users u
    join public.platform_owner o on o.id = 1
    where u.id = p_user
      and u.email_confirmed_at is not null
      and public._email_hash(u.email) = o.email_sha256
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public._is_admin_user(auth.uid())
$$;

-- Acessos administrativos anteriores deixam de valer: só o proprietário administra.
delete from public.admin_users;
revoke all on public.admin_users from anon, authenticated;
revoke execute on function public._is_admin_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  2. Limites de tempo e configurações públicas
-- ---------------------------------------------------------------------

alter table public.app_settings alter column free_daily_seconds set default 3600;
alter table public.app_settings add column if not exists instagram_url text;
alter table public.app_settings drop constraint if exists app_settings_instagram_url_check;
alter table public.app_settings add constraint app_settings_instagram_url_check
  check (instagram_url is null or instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$');

update public.app_settings
   set free_daily_seconds = 3600,                 -- Gratuito: 1 hora por dia
       whatsapp_number    = '5511959311513',       -- +55 11 95931-1513
       updated_at         = now()
 where id = 1;

create or replace function public._daily_limit(p_user uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_free int;
begin
  if public._is_admin_user(p_user) then return null; end if;     -- proprietário: sem limite
  v_plan := public._active_plan(p_user);
  if v_plan.id is not null then return v_plan.daily_limit_seconds; end if;
  select free_daily_seconds into v_free from public.app_settings where id = 1;
  return coalesce(v_free, 3600);
end $$;

-- Benefícios exibidos nos cards (o administrador pode editar depois)
update public.plans set
  daily_limit_seconds = 36000,
  features = array[
    'Até 10 horas de uso por dia',
    'Gestão de produtos',
    'Controle de estoque',
    'Registro de vendas',
    'Entradas e saídas',
    'Gráficos financeiros',
    'Notificações gerais'
  ]
where id = 'basico';

update public.plans set
  daily_limit_seconds = null,
  features = array[
    'Uso ilimitado',
    'Todas as funcionalidades do Plano Básico',
    'Notificações gerais',
    'Lembretes personalizados de pagamentos',
    'Lembretes de compras',
    'Agendamento de compromissos',
    'Prioridade no suporte'
  ]
where id = 'avancado';

update public.plans set
  daily_limit_seconds = null,
  description = 'Pagamento anual à vista (12 meses)',
  features = array[
    'Uso ilimitado',
    'Todos os benefícios do Plano Avançado',
    'Lembretes personalizados e notificações',
    'Prioridade no suporte',
    'Acesso completo durante 12 meses'
  ]
where id = 'completo';

-- Situação da conta logada (agora com o papel: owner ou cliente)
create or replace function public.get_my_status()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_owner boolean;
  v_sub   json;
  v_plan  public.plans;
begin
  if v_uid is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  perform public._refresh_subscriptions(v_uid);
  v_owner := public._is_admin_user(v_uid);

  select json_build_object(
           'id', s.id, 'plan_id', s.plan_id, 'plan_name', p.name, 'status', s.status,
           'price', s.price, 'started_at', s.started_at, 'expires_at', s.expires_at,
           'billing_period', p.billing_period)
    into v_sub
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = v_uid
  order by (s.status = 'ativa' and s.expires_at > now()) desc, s.created_at desc
  limit 1;

  v_plan := public._active_plan(v_uid);

  return json_build_object(
    'is_admin', v_owner,
    'role', case when v_owner then 'owner' else 'cliente' end,
    'subscription', v_sub,
    'entitlements', json_build_object(
      'plan_id', v_plan.id,
      'plan_name', case when v_owner then 'Proprietário' else coalesce(v_plan.name, 'Gratuito') end,
      'daily_limit_seconds', public._daily_limit(v_uid),
      'push', public._has_feature(v_uid, 'push'),
      'reminders', public._has_feature(v_uid, 'lembretes'),
      'priority_support', public._has_feature(v_uid, 'suporte')
    )
  );
end $$;

-- ---------------------------------------------------------------------
--  3. Vendas de assinaturas (pagamentos)
--  Cada pagamento CONFIRMADO é uma venda. Pendentes não entram no faturamento.
--  O histórico financeiro é preservado mesmo se o cliente excluir a conta.
-- ---------------------------------------------------------------------

alter table public.subscription_payments drop constraint if exists subscription_payments_subscription_id_fkey;
alter table public.subscription_payments drop constraint if exists subscription_payments_user_id_fkey;
alter table public.subscription_payments
  alter column subscription_id drop not null,
  alter column user_id drop not null,
  alter column kind drop not null,
  alter column period_end drop not null;
alter table public.subscription_payments
  add constraint subscription_payments_subscription_id_fkey
    foreign key (subscription_id) references public.subscriptions(id) on delete set null,
  add constraint subscription_payments_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.subscription_payments
  add column if not exists status          text not null default 'confirmado',
  add column if not exists method          text,
  add column if not exists paid_at         timestamptz,
  add column if not exists customer_name   text,
  add column if not exists customer_email  text,
  add column if not exists notes           text,
  add column if not exists idempotency_key text,
  add column if not exists confirmed_at    timestamptz,
  add column if not exists confirmed_by    uuid references auth.users(id) on delete set null,
  add column if not exists status_reason   text,
  add column if not exists updated_at      timestamptz not null default now();

alter table public.subscription_payments drop constraint if exists subscription_payments_status_check;
alter table public.subscription_payments add constraint subscription_payments_status_check
  check (status in ('confirmado', 'pendente', 'cancelado', 'estornado'));
alter table public.subscription_payments drop constraint if exists subscription_payments_method_check;
alter table public.subscription_payments add constraint subscription_payments_method_check
  check (method is null or method in ('pix', 'dinheiro', 'credito', 'debito', 'transferencia', 'boleto', 'outro'));
alter table public.subscription_payments drop constraint if exists subscription_payments_amount_max;
alter table public.subscription_payments add constraint subscription_payments_amount_max check (amount <= 100000);

-- Registros anteriores: viram vendas confirmadas com os dados do cliente
update public.subscription_payments sp set
  paid_at        = coalesce(sp.paid_at, sp.created_at),
  confirmed_at   = coalesce(sp.confirmed_at, sp.created_at),
  confirmed_by   = coalesce(sp.confirmed_by, sp.created_by),
  customer_email = coalesce(sp.customer_email, (select u.email::text from auth.users u where u.id = sp.user_id)),
  customer_name  = coalesce(sp.customer_name, (select nullif(p.full_name, '') from public.profiles p where p.id = sp.user_id))
where sp.paid_at is null or sp.customer_email is null;

alter table public.subscription_payments alter column paid_at set default now();
alter table public.subscription_payments alter column paid_at set not null;

create unique index if not exists subscription_payments_idem_idx
  on public.subscription_payments (idempotency_key) where idempotency_key is not null;
-- O mesmo comprovante/ID de pagamento não pode ser contabilizado duas vezes
create unique index if not exists subscription_payments_ref_idx
  on public.subscription_payments (lower(payment_ref))
  where payment_ref is not null and status in ('confirmado', 'pendente');
create index if not exists subscription_payments_paid_idx on public.subscription_payments (paid_at desc);

-- Proteção: valores registrados não mudam; status só segue transições válidas; nada é apagado.
create or replace function public.subscription_payments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAGAMENTO_NAO_PODE_SER_EXCLUIDO' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.customer_email := coalesce(nullif(trim(new.customer_email), ''),
                                   (select u.email::text from auth.users u where u.id = new.user_id));
    new.customer_name  := coalesce(nullif(trim(new.customer_name), ''),
                                   (select nullif(p.full_name, '') from public.profiles p where p.id = new.user_id));
    new.paid_at := coalesce(new.paid_at, now());
    if new.status = 'confirmado' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
    end if;
    return new;
  end if;

  -- UPDATE
  if new.amount <> old.amount
     or new.plan_id is distinct from old.plan_id
     or new.paid_at <> old.paid_at
     or new.created_at <> old.created_at
     or new.idempotency_key is distinct from old.idempotency_key
     or new.customer_email is distinct from old.customer_email
     or (new.user_id is distinct from old.user_id and new.user_id is not null)   -- só "solta" o vínculo se a conta for excluída
     or (old.kind is not null and new.kind is distinct from old.kind)
     or (old.period_end is not null and new.period_end is distinct from old.period_end)
     or (old.payment_ref is not null and new.payment_ref is distinct from old.payment_ref) then
    raise exception 'PAGAMENTO_IMUTAVEL' using errcode = '42501';
  end if;

  if new.status <> old.status and not (
       (old.status = 'pendente' and new.status in ('confirmado', 'cancelado'))
    or (old.status = 'confirmado' and new.status = 'estornado')
  ) then
    raise exception 'TRANSICAO_INVALIDA' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_subscription_payments_guard on public.subscription_payments;
create trigger trg_subscription_payments_guard
  before insert or update or delete on public.subscription_payments
  for each row execute function public.subscription_payments_guard();

-- Linha de venda em JSON (usada pelas funções administrativas)
create or replace function public._payment_json(p_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', sp.id, 'user_id', sp.user_id, 'customer_name', coalesce(sp.customer_name, ''),
    'customer_email', coalesce(sp.customer_email, ''), 'plan_id', sp.plan_id, 'plan_name', pl.name,
    'amount', sp.amount, 'method', sp.method, 'status', sp.status, 'kind', sp.kind,
    'paid_at', sp.paid_at, 'period_end', sp.period_end, 'payment_ref', sp.payment_ref,
    'notes', sp.notes, 'status_reason', sp.status_reason, 'subscription_id', sp.subscription_id,
    'created_at', sp.created_at)
  from public.subscription_payments sp
  left join public.plans pl on pl.id = sp.plan_id
  where sp.id = p_id
$$;

-- Libera o plano de um pagamento confirmado:
--  - mesmo plano ainda ativo  -> RENOVAÇÃO (soma a duração a partir do vencimento atual)
--  - sem plano ou outro plano -> ATIVAÇÃO (o plano anterior é encerrado e fica no histórico)
create or replace function public._apply_confirmed_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pay  public.subscription_payments;
  v_plan public.plans;
  v_sub  public.subscriptions;
  v_kind text;
  v_method text;
begin
  select * into v_pay from public.subscription_payments where id = p_payment_id for update;
  if not found then raise exception 'PAGAMENTO_NAO_ENCONTRADO'; end if;
  if v_pay.kind is not null then return; end if;              -- já aplicado (não duplica)
  if v_pay.user_id is null then raise exception 'USUARIO_NAO_ENCONTRADO'; end if;
  select * into v_plan from public.plans where id = v_pay.plan_id;

  select * into v_sub from public.subscriptions
   where user_id = v_pay.user_id and plan_id = v_plan.id and status = 'ativa' and expires_at > now()
   order by expires_at desc
   limit 1
   for update;

  if found then
    v_kind := 'renovacao';
    update public.subscriptions
       set expires_at = expires_at + make_interval(months => v_plan.duration_months),
           price = v_pay.amount,
           payment_ref = coalesce(v_pay.payment_ref, payment_ref)
     where id = v_sub.id
    returning * into v_sub;
  else
    v_kind := 'ativacao';
    with replaced as (
      update public.subscriptions
         set status = 'cancelada', notes = coalesce(notes || ' | ', '') || 'Substituída por nova ativação'
       where user_id = v_pay.user_id and status in ('ativa', 'suspensa')
      returning id, plan_id
    )
    insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id)
    select v_pay.user_id, r.id, r.plan_id, 'substituicao', 'Encerrada para ativar ' || v_plan.name, auth.uid()
    from replaced r;

    insert into public.subscriptions (user_id, plan_id, status, price, started_at, expires_at, payment_ref, notes, activated_by)
    values (v_pay.user_id, v_plan.id, 'ativa', v_pay.amount, now(),
            now() + make_interval(months => v_plan.duration_months),
            v_pay.payment_ref, v_pay.notes, auth.uid())
    returning * into v_sub;
  end if;

  update public.subscription_payments
     set status = 'confirmado', kind = v_kind, subscription_id = v_sub.id, period_end = v_sub.expires_at,
         confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, auth.uid())
   where id = v_pay.id;

  v_method := case v_pay.method
    when 'pix' then 'Pix' when 'dinheiro' then 'Dinheiro' when 'credito' then 'Cartão de crédito'
    when 'debito' then 'Cartão de débito' when 'transferencia' then 'Transferência' when 'boleto' then 'Boleto'
    when 'outro' then 'Outro' else null end;

  insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id)
  values (v_pay.user_id, v_sub.id, v_plan.id, v_kind,
          public.fmt_brl(v_pay.amount)
            || coalesce(' · ' || v_method, '')
            || ' · pago em ' || to_char(v_pay.paid_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
            || ' · válido até ' || to_char(v_sub.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
            || coalesce(' · pagamento ' || v_pay.payment_ref, ''),
          auth.uid());

  insert into public.notifications (user_id, kind, title, body, link)
  values (v_pay.user_id, 'plano',
          case v_kind when 'renovacao' then 'Assinatura renovada' else v_plan.name || ' ativado!' end,
          'Pagamento confirmado. Seu ' || v_plan.name || ' está ativo até '
            || to_char(v_sub.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
          '/app/meu-plano');
end $$;
revoke execute on function public._apply_confirmed_payment(uuid) from public, anon, authenticated;

-- "+ Registrar nova venda"
create or replace function public.admin_register_subscription_sale(
  p_email           text,
  p_customer_name   text,
  p_plan_id         text,
  p_amount          numeric,
  p_paid_on         date,
  p_method          text,
  p_status          text,
  p_payment_ref     text default null,
  p_notes           text default null,
  p_idempotency_key text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid;
  v_plan    public.plans;
  v_id      uuid;
  v_ref     text := nullif(trim(p_payment_ref), '');
  v_paid_at timestamptz;
begin
  perform public.assert_admin();
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'CHAVE_INVALIDA'; end if;

  -- A mesma operação enviada duas vezes (clique duplo, rede lenta) não duplica a venda
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select id into v_id from public.subscription_payments where idempotency_key = p_idempotency_key;
  if v_id is not null then return public._payment_json(v_id); end if;

  if p_status not in ('confirmado', 'pendente') then raise exception 'STATUS_INVALIDO'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'VALOR_INVALIDO'; end if;
  if p_paid_on is null or p_paid_on > public.br_today() or p_paid_on < public.br_today() - 366 then
    raise exception 'DATA_INVALIDA';
  end if;
  if p_method is null or p_method not in ('pix', 'dinheiro', 'credito', 'debito', 'transferencia', 'boleto', 'outro') then
    raise exception 'FORMA_PAGAMENTO_INVALIDA';
  end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'PLANO_NAO_ENCONTRADO'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'USUARIO_NAO_ENCONTRADO'; end if;
  if v_ref is not null and exists (
    select 1 from public.subscription_payments
     where lower(payment_ref) = lower(v_ref) and status in ('confirmado', 'pendente')
  ) then
    raise exception 'PAGAMENTO_DUPLICADO';
  end if;

  v_paid_at := case when p_paid_on = public.br_today() then now()
                    else (p_paid_on + time '12:00') at time zone 'America/Sao_Paulo' end;

  insert into public.subscription_payments
    (user_id, plan_id, amount, status, method, paid_at, customer_name, payment_ref, notes, idempotency_key, created_by)
  values
    (v_user, v_plan.id, round(p_amount, 2), p_status, p_method, v_paid_at,
     nullif(trim(p_customer_name), ''), v_ref, nullif(trim(p_notes), ''), p_idempotency_key, auth.uid())
  returning id into v_id;

  if p_status = 'confirmado' then
    perform public._apply_confirmed_payment(v_id);
  end if;
  return public._payment_json(v_id);
end $$;

-- Pendente -> confirmado (libera o plano). Repetir não duplica.
create or replace function public.admin_confirm_payment(p_payment_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  perform public.assert_admin();
  select status into v_status from public.subscription_payments where id = p_payment_id for update;
  if v_status is null then raise exception 'PAGAMENTO_NAO_ENCONTRADO'; end if;
  if v_status = 'confirmado' then return public._payment_json(p_payment_id); end if;
  if v_status <> 'pendente' then raise exception 'TRANSICAO_INVALIDA'; end if;
  update public.subscription_payments set status = 'confirmado' where id = p_payment_id;
  perform public._apply_confirmed_payment(p_payment_id);
  return public._payment_json(p_payment_id);
end $$;

-- Pendente -> cancelado (não entra no faturamento)
create or replace function public.admin_cancel_payment(p_payment_id uuid, p_reason text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  perform public.assert_admin();
  select status into v_status from public.subscription_payments where id = p_payment_id for update;
  if v_status is null then raise exception 'PAGAMENTO_NAO_ENCONTRADO'; end if;
  if v_status = 'cancelado' then return public._payment_json(p_payment_id); end if;
  if v_status <> 'pendente' then raise exception 'TRANSICAO_INVALIDA'; end if;
  update public.subscription_payments
     set status = 'cancelado', status_reason = nullif(trim(p_reason), '')
   where id = p_payment_id;
  return public._payment_json(p_payment_id);
end $$;

-- Confirmado -> estornado (sai do faturamento). O plano do cliente não é alterado
-- automaticamente: suspenda ou cancele na lista de clientes, se for o caso.
create or replace function public.admin_refund_payment(p_payment_id uuid, p_reason text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  perform public.assert_admin();
  if nullif(trim(p_reason), '') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select status into v_status from public.subscription_payments where id = p_payment_id for update;
  if v_status is null then raise exception 'PAGAMENTO_NAO_ENCONTRADO'; end if;
  if v_status = 'estornado' then return public._payment_json(p_payment_id); end if;
  if v_status <> 'confirmado' then raise exception 'TRANSICAO_INVALIDA'; end if;
  update public.subscription_payments set status = 'estornado', status_reason = trim(p_reason) where id = p_payment_id;
  return public._payment_json(p_payment_id);
end $$;

-- Histórico de vendas (todas as situações) no período
create or replace function public.admin_list_subscription_sales(p_from timestamptz default null, p_to timestamptz default null)
returns table (
  id uuid, user_id uuid, customer_name text, customer_email text, plan_id text, plan_name text,
  amount numeric, method text, status text, kind text, paid_at timestamptz, period_end timestamptz,
  payment_ref text, notes text, status_reason text, subscription_id uuid, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select sp.id, sp.user_id, coalesce(sp.customer_name, ''), coalesce(sp.customer_email, ''), sp.plan_id, pl.name,
         sp.amount, sp.method, sp.status, sp.kind, sp.paid_at, sp.period_end,
         sp.payment_ref, sp.notes, sp.status_reason, sp.subscription_id, sp.created_at
  from public.subscription_payments sp
  left join public.plans pl on pl.id = sp.plan_id
  where (p_from is null or sp.paid_at >= p_from)
    and (p_to is null or sp.paid_at <= p_to)
  order by sp.paid_at desc, sp.created_at desc
  limit 5000;
$$;

-- ---------------------------------------------------------------------
--  4. Despesas da plataforma (hospedagem, domínio, ferramentas...)
-- ---------------------------------------------------------------------

create table if not exists public.platform_expenses (
  id           uuid primary key default gen_random_uuid(),
  description  text not null check (char_length(trim(description)) between 2 and 120),
  category     text not null check (category in ('hospedagem', 'dominio', 'ferramentas', 'marketing', 'impostos', 'outros')),
  amount       numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  spent_on     date not null default public.br_today(),
  notes        text check (notes is null or char_length(notes) <= 500),
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists platform_expenses_spent_idx on public.platform_expenses (spent_on desc);

alter table public.platform_expenses enable row level security;
drop policy if exists platform_expenses_owner_select on public.platform_expenses;
drop policy if exists platform_expenses_owner_insert on public.platform_expenses;
drop policy if exists platform_expenses_owner_update on public.platform_expenses;
drop policy if exists platform_expenses_owner_delete on public.platform_expenses;
create policy platform_expenses_owner_select on public.platform_expenses for select to authenticated using (public.is_admin());
create policy platform_expenses_owner_insert on public.platform_expenses for insert to authenticated with check (public.is_admin());
create policy platform_expenses_owner_update on public.platform_expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy platform_expenses_owner_delete on public.platform_expenses for delete to authenticated using (public.is_admin());
revoke all on public.platform_expenses from anon;
grant select, insert, update, delete on public.platform_expenses to authenticated;

drop trigger if exists trg_platform_expenses_updated on public.platform_expenses;
create trigger trg_platform_expenses_updated before update on public.platform_expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  5. "Minhas Vendas": indicadores (todos começam em zero sem registros)
--  Vendas = pagamentos confirmados (renovação conta como venda, não como cliente novo)
--  Lucro líquido = receita recebida - despesas da plataforma
-- ---------------------------------------------------------------------

create or replace function public.admin_sales_report(p_from timestamptz default null, p_to timestamptz default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_from_day date := case when p_from is null then null else (p_from at time zone 'America/Sao_Paulo')::date end;
  v_to_day   date := case when p_to   is null then null else (p_to   at time zone 'America/Sao_Paulo')::date end;
  v_received numeric;
  v_expenses numeric;
begin
  perform public.assert_admin();

  select coalesce(sum(amount), 0) into v_received
  from public.subscription_payments
  where status = 'confirmado' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to);

  select coalesce(sum(amount), 0) into v_expenses
  from public.platform_expenses
  where (v_from_day is null or spent_on >= v_from_day) and (v_to_day is null or spent_on <= v_to_day);

  return json_build_object(
    'sales_count', (select count(*) from public.subscription_payments
                    where status = 'confirmado' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to)),
    'total_received', v_received,
    'renewals', (select count(*) from public.subscription_payments
                 where status = 'confirmado' and kind = 'renovacao'
                   and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to)),
    'new_customers', (select count(*) from (
                        select user_id, min(paid_at) as first_at
                        from public.subscription_payments
                        where status = 'confirmado' and user_id is not null
                        group by user_id) f
                      where (p_from is null or f.first_at >= p_from) and (p_to is null or f.first_at <= p_to)),
    'pending_count', (select count(*) from public.subscription_payments
                      where status = 'pendente' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to)),
    'pending_amount', (select coalesce(sum(amount), 0) from public.subscription_payments
                       where status = 'pendente' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to)),
    'refunded_amount', (select coalesce(sum(amount), 0) from public.subscription_payments
                        where status = 'estornado' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to)),
    -- Agora (não depende do período): planos pagos ativos e dentro da validade
    'active_subscribers', (select count(distinct s.user_id) from public.subscriptions s
                           where s.status = 'ativa' and s.expires_at > now() and not public._is_admin_user(s.user_id)),
    'expenses_total', v_expenses,
    'net_profit', v_received - v_expenses,
    'by_plan', coalesce((
      select json_agg(json_build_object('plan_id', x.plan_id, 'plan_name', x.plan_name, 'count', x.n, 'amount', x.total) order by x.total desc)
      from (
        select sp.plan_id, coalesce(pl.name, sp.plan_id) as plan_name, count(*) as n, sum(sp.amount) as total
        from public.subscription_payments sp
        left join public.plans pl on pl.id = sp.plan_id
        where sp.status = 'confirmado' and (p_from is null or sp.paid_at >= p_from) and (p_to is null or sp.paid_at <= p_to)
        group by sp.plan_id, pl.name
      ) x), '[]'::json)
  );
end $$;

-- Visão geral antiga: só pagamentos confirmados contam como receita
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
begin
  perform public.assert_admin();
  return json_build_object(
    'total_users',   (select count(*) from auth.users),
    'active_subs',   (select count(*) from public.subscriptions s
                      where s.status = 'ativa' and s.expires_at > now() and not public._is_admin_user(s.user_id)),
    'expiring_7d',   (select count(*) from public.subscriptions
                      where status = 'ativa' and expires_at > now() and expires_at <= now() + interval '7 days'),
    'revenue_month', (select coalesce(sum(amount), 0) from public.subscription_payments
                      where status = 'confirmado' and paid_at >= v_month_start),
    'revenue_total', (select coalesce(sum(amount), 0) from public.subscription_payments where status = 'confirmado')
  );
end $$;

create or replace function public.admin_list_payments()
returns table (
  id uuid, email text, plan_name text, amount numeric, kind text,
  payment_ref text, period_end timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select sp.id, coalesce(sp.customer_email, ''), coalesce(pl.name, sp.plan_id), sp.amount, sp.kind,
         sp.payment_ref, sp.period_end, sp.paid_at
  from public.subscription_payments sp
  left join public.plans pl on pl.id = sp.plan_id
  where sp.status = 'confirmado'
  order by sp.paid_at desc
  limit 300;
$$;

create or replace function public.admin_list_users(p_search text default null)
returns table (
  user_id uuid, email text, full_name text, business_name text, created_at timestamptz,
  email_confirmed boolean, is_admin boolean,
  subscription_id uuid, plan_id text, plan_name text, status text,
  started_at timestamptz, expires_at timestamptz, price numeric, priority_support boolean
)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select u.id, u.email::text, coalesce(p.full_name, ''), p.business_name, u.created_at,
         u.email_confirmed_at is not null,
         public._is_admin_user(u.id),
         s.id, s.plan_id, pl.name, s.status, s.started_at, s.expires_at, s.price,
         coalesce(s.status = 'ativa' and s.expires_at > now() and pl.priority_support, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join lateral (
    select * from public.subscriptions x
    where x.user_id = u.id
    order by (x.status = 'ativa' and x.expires_at > now()) desc, x.created_at desc
    limit 1
  ) s on true
  left join public.plans pl on pl.id = s.plan_id
  where p_search is null or p_search = ''
     or u.email ilike '%' || p_search || '%'
     or p.full_name ilike '%' || p_search || '%'
  order by u.created_at desc
  limit 300;
$$;

-- ---------------------------------------------------------------------
--  6. Registro de operações administrativas (somente leitura para o proprietário)
-- ---------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  entity       text not null,
  entity_id    text,
  summary      text not null,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_owner_select on public.admin_audit_log;
create policy admin_audit_owner_select on public.admin_audit_log for select to authenticated using (public.is_admin());
revoke all on public.admin_audit_log from anon;
revoke insert, update, delete on public.admin_audit_log from authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public._audit(p_action text, p_entity text, p_entity_id text, p_summary text, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_log (actor_id, actor_email, action, entity, entity_id, summary, details)
  values (auth.uid(), (select u.email::text from auth.users u where u.id = auth.uid()),
          p_action, p_entity, p_entity_id, p_summary, p_details);
end $$;
revoke execute on function public._audit(text, text, text, text, jsonb) from public, anon, authenticated;

-- Registro imutável
create or replace function public.admin_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.actor_id is null and old.actor_id is not null
     and new.id = old.id and new.action = old.action and new.summary = old.summary then
    return new;   -- conta do autor excluída (on delete set null)
  end if;
  raise exception 'REGISTRO_IMUTAVEL' using errcode = '42501';
end $$;
drop trigger if exists trg_admin_audit_log_immutable on public.admin_audit_log;
create trigger trg_admin_audit_log_immutable before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

-- Pagamentos
create or replace function public.audit_subscription_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text := (select name from public.plans where id = new.plan_id);
  v_desc text := coalesce(v_plan, new.plan_id) || ' · ' || public.fmt_brl(new.amount) || ' · ' || coalesce(new.customer_email, 'conta excluída');
begin
  if tg_op = 'INSERT' then
    perform public._audit('venda_registrada', 'pagamento', new.id::text,
      'Venda registrada (' || new.status || '): ' || v_desc,
      jsonb_build_object('status', new.status, 'amount', new.amount, 'method', new.method, 'payment_ref', new.payment_ref));
  elsif new.status <> old.status then
    perform public._audit('pagamento_' || new.status, 'pagamento', new.id::text,
      case new.status when 'confirmado' then 'Pagamento confirmado: '
                      when 'cancelado' then 'Pagamento pendente cancelado: '
                      else 'Pagamento estornado: ' end || v_desc || coalesce(' · motivo: ' || new.status_reason, ''),
      jsonb_build_object('de', old.status, 'para', new.status, 'motivo', new.status_reason));
  end if;
  return null;
end $$;
drop trigger if exists trg_audit_subscription_payments on public.subscription_payments;
create trigger trg_audit_subscription_payments after insert or update of status on public.subscription_payments
  for each row execute function public.audit_subscription_payments();

-- Assinaturas: mudanças de status feitas por uma pessoa (vencimentos automáticos não poluem o registro)
create or replace function public.audit_subscriptions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := (select email::text from auth.users where id = new.user_id);
  v_plan  text := (select name from public.plans where id = new.plan_id);
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public._audit('assinatura_ativada', 'assinatura', new.id::text,
      coalesce(v_plan, new.plan_id) || ' ativado para ' || coalesce(v_email, '?') || ' até '
        || to_char(new.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
  elsif new.status <> old.status then
    perform public._audit('assinatura_' || new.status, 'assinatura', new.id::text,
      'Assinatura ' || old.status || ' → ' || new.status || ': ' || coalesce(v_plan, new.plan_id) || ' · ' || coalesce(v_email, '?'));
  elsif new.expires_at <> old.expires_at then
    perform public._audit('assinatura_renovada', 'assinatura', new.id::text,
      coalesce(v_plan, new.plan_id) || ' renovado para ' || coalesce(v_email, '?') || ' até '
        || to_char(new.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
  end if;
  return null;
end $$;
drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions after insert or update of status, expires_at on public.subscriptions
  for each row execute function public.audit_subscriptions();

-- Planos
create or replace function public.audit_plans()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._audit('plano_criado', 'plano', new.id, 'Plano criado: ' || new.name || ' · ' || public.fmt_brl(new.price));
  elsif row(new.name, new.price, new.duration_months, new.is_active, new.daily_limit_seconds, new.features,
            new.allow_push, new.allow_reminders, new.priority_support)
        is distinct from
        row(old.name, old.price, old.duration_months, old.is_active, old.daily_limit_seconds, old.features,
            old.allow_push, old.allow_reminders, old.priority_support) then
    perform public._audit('plano_alterado', 'plano', new.id,
      'Plano alterado: ' || new.name
        || case when new.price <> old.price then ' · preço ' || public.fmt_brl(old.price) || ' → ' || public.fmt_brl(new.price) else '' end
        || case when new.is_active <> old.is_active then case when new.is_active then ' · ativado' else ' · desativado' end else '' end,
      jsonb_build_object('preco_anterior', old.price, 'preco_novo', new.price));
  end if;
  return null;
end $$;
drop trigger if exists trg_audit_plans on public.plans;
create trigger trg_audit_plans after insert or update on public.plans
  for each row execute function public.audit_plans();

-- Configurações
create or replace function public.audit_app_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if row(new.whatsapp_number, new.support_email, new.instagram_url, new.free_daily_seconds,
         new.satisfied_clients_value, new.satisfied_clients_is_demo, new.expiry_notice_days)
     is distinct from
     row(old.whatsapp_number, old.support_email, old.instagram_url, old.free_daily_seconds,
         old.satisfied_clients_value, old.satisfied_clients_is_demo, old.expiry_notice_days) then
    perform public._audit('configuracoes_alteradas', 'configuracoes', '1', 'Configurações da plataforma alteradas',
      jsonb_build_object(
        'whatsapp', new.whatsapp_number, 'email_suporte', new.support_email, 'instagram', new.instagram_url,
        'gratuito_segundos', new.free_daily_seconds));
  end if;
  return null;
end $$;
drop trigger if exists trg_audit_app_settings on public.app_settings;
create trigger trg_audit_app_settings after update on public.app_settings
  for each row execute function public.audit_app_settings();

-- Despesas da plataforma
create or replace function public.audit_platform_expenses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._audit('despesa_registrada', 'despesa', new.id::text,
      'Despesa registrada: ' || new.description || ' · ' || public.fmt_brl(new.amount));
  elsif tg_op = 'UPDATE' then
    perform public._audit('despesa_alterada', 'despesa', new.id::text,
      'Despesa alterada: ' || new.description || ' · ' || public.fmt_brl(old.amount) || ' → ' || public.fmt_brl(new.amount));
  else
    perform public._audit('despesa_excluida', 'despesa', old.id::text,
      'Despesa excluída: ' || old.description || ' · ' || public.fmt_brl(old.amount));
  end if;
  return null;
end $$;
drop trigger if exists trg_audit_platform_expenses on public.platform_expenses;
create trigger trg_audit_platform_expenses after insert or update or delete on public.platform_expenses
  for each row execute function public.audit_platform_expenses();

-- Comunicados
create or replace function public.audit_announcements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._audit('comunicado_enviado', 'comunicado', new.id::text, 'Comunicado enviado: ' || new.title);
  return null;
end $$;
drop trigger if exists trg_audit_announcements on public.announcements;
create trigger trg_audit_announcements after insert on public.announcements
  for each row execute function public.audit_announcements();

-- ---------------------------------------------------------------------
--  7. Permissões das novas funções (a autorização real é o assert_admin())
-- ---------------------------------------------------------------------
revoke execute on function public.admin_register_subscription_sale(text, text, text, numeric, date, text, text, text, text, text) from public, anon;
revoke execute on function public.admin_confirm_payment(uuid) from public, anon;
revoke execute on function public.admin_cancel_payment(uuid, text) from public, anon;
revoke execute on function public.admin_refund_payment(uuid, text) from public, anon;
revoke execute on function public.admin_list_subscription_sales(timestamptz, timestamptz) from public, anon;
revoke execute on function public.admin_sales_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_register_subscription_sale(text, text, text, numeric, date, text, text, text, text, text) to authenticated;
grant execute on function public.admin_confirm_payment(uuid) to authenticated;
grant execute on function public.admin_cancel_payment(uuid, text) to authenticated;
grant execute on function public.admin_refund_payment(uuid, text) to authenticated;
grant execute on function public.admin_list_subscription_sales(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_sales_report(timestamptz, timestamptz) to authenticated;
