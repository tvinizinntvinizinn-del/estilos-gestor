-- =====================================================================
--  Estilos Gestor — estrutura inicial do banco (Supabase / PostgreSQL)
--  Rode este arquivo inteiro no SQL Editor do Supabase (ou via CLI:
--  `supabase db push`). Ele é idempotente apenas na criação inicial.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Utilitários
-- ---------------------------------------------------------------------

-- "Hoje" no horário de Brasília (o limite gratuito renova à meia-noite BRT)
create or replace function public.br_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Formata valores em reais: 1234.5 -> 'R$ 1.234,50'
create or replace function public.fmt_brl(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
--  Tabelas
-- ---------------------------------------------------------------------

create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  full_name                text not null default '',
  business_name            text,
  phone                    text,
  expense_alert_threshold  numeric(12,2) not null default 500 check (expense_alert_threshold >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Administradores da plataforma. Sem políticas de acesso: só é possível
-- incluir alguém por SQL (painel do Supabase) — nunca pelo navegador.
create table public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Configurações gerais (linha única, id = 1)
create table public.app_settings (
  id                         int primary key default 1 check (id = 1),
  whatsapp_number            text check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$'),
  support_email              text,
  satisfied_clients_value    int not null default 120 check (satisfied_clients_value >= 0),
  satisfied_clients_is_demo  boolean not null default true,
  free_daily_seconds         int not null default 10800 check (free_daily_seconds between 0 and 86400),
  expiry_notice_days         int not null default 3 check (expiry_notice_days between 1 and 30),
  updated_at                 timestamptz not null default now()
);

create table public.plans (
  id               text primary key,
  name             text not null,
  description      text not null default '',
  price            numeric(12,2) not null check (price >= 0),
  billing_period   text not null check (billing_period in ('mensal', 'anual')),
  duration_months  int not null check (duration_months between 1 and 36),
  features         text[] not null default '{}',
  highlight        text,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  updated_at       timestamptz not null default now()
);

create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan_id       text not null references public.plans(id),
  status        text not null check (status in ('ativa', 'suspensa', 'cancelada', 'vencida')),
  price         numeric(12,2) not null,           -- preço registrado na ativação
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  payment_ref   text,                              -- identificador do pagamento (opcional)
  notes         text,
  activated_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, status, expires_at desc);

-- Receitas de assinaturas registradas manualmente pelo administrador
create table public.subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  plan_id          text not null references public.plans(id),
  amount           numeric(12,2) not null check (amount >= 0),
  kind             text not null check (kind in ('ativacao', 'renovacao')),
  payment_ref      text,
  period_end       timestamptz not null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index subscription_payments_created_idx on public.subscription_payments (created_at desc);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  category    text not null default 'Geral' check (char_length(category) between 1 and 60),
  price       numeric(12,2) not null check (price >= 0),
  cost        numeric(12,2) not null default 0 check (cost >= 0),
  stock       int not null default 0 check (stock >= 0),
  min_stock   int not null default 5 check (min_stock >= 0),
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index products_user_idx on public.products (user_id, name);

create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  product_id       uuid references public.products(id) on delete set null,
  product_name     text not null,
  quantity         int not null check (quantity > 0),
  unit_price       numeric(12,2) not null,
  total            numeric(12,2) not null,
  payment_method   text not null check (payment_method in ('pix', 'dinheiro', 'credito', 'debito', 'boleto', 'outro')),
  status           text not null default 'confirmada' check (status in ('confirmada', 'cancelada')),
  idempotency_key  text not null,
  created_at       timestamptz not null default now(),
  canceled_at      timestamptz,
  unique (user_id, idempotency_key)               -- impede vendas duplicadas
);
create index sales_user_idx on public.sales (user_id, created_at desc);

create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type         text not null check (type in ('entrada', 'saida')),
  description  text not null check (char_length(description) between 1 and 160),
  amount       numeric(12,2) not null check (amount > 0),
  category     text not null check (char_length(category) between 1 and 60),
  occurred_at  timestamptz not null default now(),
  notes        text check (notes is null or char_length(notes) <= 500),
  sale_id      uuid unique references public.sales(id) on delete cascade,  -- 1 venda = 1 entrada
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (user_id, occurred_at desc);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('estoque', 'venda', 'despesa', 'plano', 'tempo', 'admin', 'sistema')),
  title       text not null,
  body        text not null default '',
  link        text,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)                    -- evita avisos repetidos
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Controle do tempo gratuito diário (calculado SEMPRE com o relógio do servidor)
create table public.daily_usage (
  user_id         uuid not null references auth.users(id) on delete cascade,
  day             date not null,
  seconds_used    int not null default 0 check (seconds_used >= 0),
  last_heartbeat  timestamptz,
  primary key (user_id, day)
);

create trigger trg_profiles_updated      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger trg_app_settings_updated  before update on public.app_settings  for each row execute function public.set_updated_at();
create trigger trg_plans_updated         before update on public.plans         for each row execute function public.set_updated_at();
create trigger trg_subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger trg_products_updated      before update on public.products      for each row execute function public.set_updated_at();
create trigger trg_transactions_updated  before update on public.transactions  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  Dados iniciais
-- ---------------------------------------------------------------------

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- Os benefícios de cada plano são editáveis no painel administrativo.
-- O único item cadastrado é o que já está definido: assinantes não têm limite diário.
insert into public.plans (id, name, description, price, billing_period, duration_months, features, highlight, sort_order) values
  ('basico',   'Plano Básico',   'Cobrança mensal',               40.00,  'mensal', 1,  array['Uso sem limite diário de tempo'], null, 1),
  ('avancado', 'Plano Avançado', 'Cobrança mensal',               70.00,  'mensal', 1,  array['Uso sem limite diário de tempo'], null, 2),
  ('completo', 'Plano Completo', 'Cobrança anual (12 meses)',     240.00, 'anual',  12, array['Uso sem limite diário de tempo'], 'Melhor custo-benefício', 3)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
--  Funções de autorização
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
$$;

create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;
end $$;

-- Responde apenas sobre o próprio usuário (ou para administradores)
create or replace function public.has_active_plan(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_user = auth.uid() or public.is_admin())
     and exists (
       select 1 from public.subscriptions s
       where s.user_id = p_user and s.status = 'ativa' and s.expires_at > now()
     )
$$;

-- Acesso liberado = assinatura ativa, administrador OU tempo gratuito restante com sessão ativa
-- (pulso do contador recebido no último minuto). Usado nas políticas de escrita.
create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_plan(auth.uid()) or public.is_admin() or exists (
    select 1
    from public.daily_usage u
    join public.app_settings s on s.id = 1
    where u.user_id = auth.uid()
      and u.day = public.br_today()
      and u.seconds_used < s.free_daily_seconds
      and u.last_heartbeat > now() - interval '60 seconds'
  )
$$;

-- ---------------------------------------------------------------------
--  Novo usuário -> perfil
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''))
  on conflict (id) do nothing;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (new.id, 'sistema', 'Bem-vindo ao Estilos Gestor!',
          'Cadastre seus produtos e registre suas movimentações para acompanhar o seu negócio.',
          '/app/produtos', 'boas-vindas')
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Alerta de despesa importante (valor >= limite definido pelo usuário)
create or replace function public.notify_big_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_threshold numeric;
begin
  if new.type <> 'saida' then return new; end if;
  select expense_alert_threshold into v_threshold from public.profiles where id = new.user_id;
  if v_threshold is not null and v_threshold > 0 and new.amount >= v_threshold then
    insert into public.notifications (user_id, kind, title, body, link)
    values (new.user_id, 'despesa', 'Despesa importante registrada',
            new.description || ' — ' || public.fmt_brl(new.amount), '/app/entradas-saidas');
  end if;
  return new;
end $$;

create trigger trg_transactions_big_expense
  after insert on public.transactions
  for each row execute function public.notify_big_expense();

-- Alerta de estoque baixo em qualquer alteração de estoque
create or replace function public.notify_low_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock > new.min_stock then return new; end if;
  if tg_op = 'UPDATE' then
    if old.stock = new.stock and old.min_stock = new.min_stock then return new; end if;
  end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (new.user_id, 'estoque', 'Estoque baixo: ' || new.name,
          case when new.stock = 0 then 'O produto está sem estoque.'
               else 'Restam ' || new.stock || ' unidade(s) em estoque.' end,
          '/app/produtos', 'estoque-' || new.id || '-' || public.br_today())
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;

create trigger trg_products_low_stock
  after insert or update of stock, min_stock on public.products
  for each row execute function public.notify_low_stock();

-- ---------------------------------------------------------------------
--  Vencimento de assinaturas
-- ---------------------------------------------------------------------

-- p_user = null -> todos os usuários (usado pelo agendamento opcional)
create or replace function public._refresh_subscriptions(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_days int;
begin
  select expiry_notice_days into v_days from public.app_settings where id = 1;
  v_days := coalesce(v_days, 3);

  -- Planos vencidos: atualiza status e avisa
  with expired as (
    update public.subscriptions
       set status = 'vencida'
     where status = 'ativa' and expires_at <= now()
       and (p_user is null or user_id = p_user)
    returning id, user_id
  )
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select e.user_id, 'plano', 'Seu plano venceu',
         'Renove sua assinatura para voltar a usar a plataforma sem limite diário.',
         '/app/meu-plano', 'vencido-' || e.id
  from expired e
  on conflict (user_id, dedupe_key) do nothing;

  -- Aviso de proximidade do vencimento (padrão: 3 dias antes)
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select s.user_id, 'plano', 'Seu plano está próximo do vencimento!',
         'Renove sua assinatura para continuar aproveitando todas as funcionalidades.',
         '/app/meu-plano', 'aviso-' || s.id || '-' || to_char(s.expires_at, 'YYYYMMDD')
  from public.subscriptions s
  where s.status = 'ativa'
    and s.expires_at > now()
    and s.expires_at <= now() + make_interval(days => v_days)
    and (p_user is null or s.user_id = p_user)
  on conflict (user_id, dedupe_key) do nothing;
end $$;

-- Situação da conta logada (perfil de acesso + assinatura vigente)
create or replace function public.get_my_status()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sub json;
begin
  if v_uid is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  perform public._refresh_subscriptions(v_uid);

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

  return json_build_object('is_admin', public.is_admin(), 'subscription', v_sub);
end $$;

-- ---------------------------------------------------------------------
--  Contador gratuito (3 horas/dia) — pulso enviado pelo app a cada ~20s
--  Cada pulso soma no máximo 30s, medidos pelo relógio do servidor.
--  Fechar o app ou mudar de aba interrompe os pulsos (tempo não conta).
-- ---------------------------------------------------------------------

create or replace function public.usage_heartbeat()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_day    date := public.br_today();
  v_limit  int;
  v_row    public.daily_usage;
  v_delta  int := 0;
  v_reset  timestamptz := ((public.br_today() + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if v_uid is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;

  perform public._refresh_subscriptions(v_uid);
  if public.has_active_plan(v_uid) or public.is_admin() then
    return json_build_object('unlimited', true, 'remaining_seconds', null, 'limit_seconds', null,
                             'server_now', now(), 'resets_at', v_reset);
  end if;

  select free_daily_seconds into v_limit from public.app_settings where id = 1;
  v_limit := coalesce(v_limit, 10800);

  insert into public.daily_usage (user_id, day) values (v_uid, v_day) on conflict do nothing;
  select * into v_row from public.daily_usage where user_id = v_uid and day = v_day for update;

  if v_row.last_heartbeat is not null then
    v_delta := least(greatest(extract(epoch from now() - v_row.last_heartbeat), 0), 30)::int;
  end if;

  update public.daily_usage
     set seconds_used = least(v_limit, seconds_used + v_delta),
         last_heartbeat = now()
   where user_id = v_uid and day = v_day
  returning * into v_row;

  if v_row.seconds_used >= v_limit then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (v_uid, 'tempo', 'Seu tempo gratuito de hoje terminou!',
            'Volte amanhã ou escolha um dos nossos planos para continuar utilizando a plataforma.',
            '/planos', 'tempo-' || v_day)
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return json_build_object('unlimited', false,
                           'remaining_seconds', greatest(v_limit - v_row.seconds_used, 0),
                           'limit_seconds', v_limit,
                           'server_now', now(),
                           'resets_at', v_reset);
end $$;

-- ---------------------------------------------------------------------
--  Vendas (operação atômica: estoque + venda + entrada financeira)
-- ---------------------------------------------------------------------

create or replace function public.register_sale(
  p_product_id uuid,
  p_quantity int,
  p_payment_method text,
  p_idempotency_key text
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_product  public.products;
  v_sale     public.sales;
begin
  if v_uid is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  if not public.has_access() then raise exception 'ACESSO_BLOQUEADO'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100000 then raise exception 'QUANTIDADE_INVALIDA'; end if;
  if p_payment_method not in ('pix', 'dinheiro', 'credito', 'debito', 'boleto', 'outro') then
    raise exception 'PAGAMENTO_INVALIDO';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then raise exception 'CHAVE_INVALIDA'; end if;

  -- Mesma chave = mesma venda (clique duplo, rede instável, reenvio)
  select * into v_sale from public.sales where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return v_sale; end if;

  begin
    select * into v_product from public.products
     where id = p_product_id and user_id = v_uid
     for update;
    if not found then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;
    if v_product.stock < p_quantity then
      raise exception 'ESTOQUE_INSUFICIENTE' using detail = v_product.stock::text;
    end if;

    update public.products set stock = stock - p_quantity where id = v_product.id;

    insert into public.sales (user_id, product_id, product_name, quantity, unit_price, total, payment_method, idempotency_key)
    values (v_uid, v_product.id, v_product.name, p_quantity, v_product.price,
            round(v_product.price * p_quantity, 2), p_payment_method, p_idempotency_key)
    returning * into v_sale;

    if v_sale.total > 0 then
      insert into public.transactions (user_id, type, description, amount, category, occurred_at, sale_id)
      values (v_uid, 'entrada', 'Venda: ' || v_product.name || ' (' || p_quantity || ' un.)',
              v_sale.total, 'Vendas', v_sale.created_at, v_sale.id);
    end if;

    insert into public.notifications (user_id, kind, title, body, link)
    values (v_uid, 'venda', 'Venda registrada',
            p_quantity || ' × ' || v_product.name || ' — ' || public.fmt_brl(v_sale.total), '/app/produtos');
  exception when unique_violation then
    -- Outra requisição com a mesma chave terminou primeiro: devolve a venda existente
    select * into v_sale from public.sales where user_id = v_uid and idempotency_key = p_idempotency_key;
    if not found then raise; end if;
  end;

  return v_sale;
end $$;

create or replace function public.cancel_sale(p_sale_id uuid)
returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_sale public.sales;
begin
  if v_uid is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  if not public.has_access() then raise exception 'ACESSO_BLOQUEADO'; end if;

  select * into v_sale from public.sales where id = p_sale_id and user_id = v_uid for update;
  if not found then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if v_sale.status = 'cancelada' then return v_sale; end if;

  if v_sale.product_id is not null then
    update public.products set stock = stock + v_sale.quantity
     where id = v_sale.product_id and user_id = v_uid;
  end if;
  delete from public.transactions where sale_id = v_sale.id and user_id = v_uid;
  update public.sales set status = 'cancelada', canceled_at = now()
   where id = v_sale.id
  returning * into v_sale;
  return v_sale;
end $$;

-- LGPD: o próprio usuário pode excluir a conta e todos os dados (cascade)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
--  Administração (todas verificam is_admin() no servidor)
--  Observação de privacidade: nenhuma função administrativa expõe
--  produtos, vendas ou movimentações financeiras dos clientes.
-- ---------------------------------------------------------------------

create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
begin
  perform public.assert_admin();
  return json_build_object(
    'total_users',        (select count(*) from auth.users),
    'active_subs',        (select count(*) from public.subscriptions where status = 'ativa' and expires_at > now()),
    'expiring_7d',        (select count(*) from public.subscriptions where status = 'ativa' and expires_at > now() and expires_at <= now() + interval '7 days'),
    'revenue_month',      (select coalesce(sum(amount), 0) from public.subscription_payments where created_at >= v_month_start),
    'revenue_total',      (select coalesce(sum(amount), 0) from public.subscription_payments)
  );
end $$;

create or replace function public.admin_list_users(p_search text default null)
returns table (
  user_id uuid, email text, full_name text, business_name text, created_at timestamptz,
  email_confirmed boolean, is_admin boolean,
  subscription_id uuid, plan_id text, plan_name text, status text, expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select u.id, u.email::text, coalesce(p.full_name, ''), p.business_name, u.created_at,
         u.email_confirmed_at is not null,
         exists (select 1 from public.admin_users a where a.user_id = u.id),
         s.id, s.plan_id, pl.name, s.status, s.expires_at
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

create or replace function public.admin_list_subscriptions(p_status text default null)
returns table (
  id uuid, user_id uuid, email text, full_name text, plan_id text, plan_name text,
  status text, price numeric, started_at timestamptz, expires_at timestamptz,
  payment_ref text, notes text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select s.id, s.user_id, u.email::text, coalesce(p.full_name, ''), s.plan_id, pl.name,
         s.status, s.price, s.started_at, s.expires_at, s.payment_ref, s.notes, s.created_at
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  join public.plans pl on pl.id = s.plan_id
  where p_status is null or p_status = '' or s.status = p_status
  order by s.expires_at asc
  limit 500;
$$;

create or replace function public.admin_list_payments()
returns table (
  id uuid, email text, plan_name text, amount numeric, kind text,
  payment_ref text, period_end timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select sp.id, u.email::text, pl.name, sp.amount, sp.kind, sp.payment_ref, sp.period_end, sp.created_at
  from public.subscription_payments sp
  join auth.users u on u.id = sp.user_id
  join public.plans pl on pl.id = sp.plan_id
  order by sp.created_at desc
  limit 300;
$$;

create or replace function public.admin_activate_plan(
  p_user_id uuid, p_plan_id text, p_payment_ref text default null, p_notes text default null
) returns public.subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_sub  public.subscriptions;
begin
  perform public.assert_admin();
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'PLANO_NAO_ENCONTRADO'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'USUARIO_NAO_ENCONTRADO'; end if;

  -- Um plano ativo por vez: o anterior é encerrado
  update public.subscriptions
     set status = 'cancelada', notes = coalesce(notes || ' | ', '') || 'Substituída por nova ativação'
   where user_id = p_user_id and status in ('ativa', 'suspensa');

  insert into public.subscriptions (user_id, plan_id, status, price, started_at, expires_at, payment_ref, notes, activated_by)
  values (p_user_id, v_plan.id, 'ativa', v_plan.price, now(),
          now() + make_interval(months => v_plan.duration_months),
          nullif(trim(p_payment_ref), ''), nullif(trim(p_notes), ''), auth.uid())
  returning * into v_sub;

  insert into public.subscription_payments (subscription_id, user_id, plan_id, amount, kind, payment_ref, period_end, created_by)
  values (v_sub.id, p_user_id, v_plan.id, v_plan.price, 'ativacao', v_sub.payment_ref, v_sub.expires_at, auth.uid());

  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user_id, 'plano', v_plan.name || ' ativado!',
          'Sua assinatura está ativa até ' || to_char(v_sub.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
          '/app/meu-plano');
  return v_sub;
end $$;

create or replace function public.admin_renew_subscription(p_subscription_id uuid, p_payment_ref text default null)
returns public.subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_sub  public.subscriptions;
  v_plan public.plans;
begin
  perform public.assert_admin();
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'ASSINATURA_NAO_ENCONTRADA'; end if;
  if v_sub.status = 'cancelada' then raise exception 'ASSINATURA_CANCELADA'; end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;

  update public.subscriptions
     set status = 'ativa',
         price = v_plan.price,
         expires_at = greatest(expires_at, now()) + make_interval(months => v_plan.duration_months),
         payment_ref = coalesce(nullif(trim(p_payment_ref), ''), payment_ref)
   where id = v_sub.id
  returning * into v_sub;

  insert into public.subscription_payments (subscription_id, user_id, plan_id, amount, kind, payment_ref, period_end, created_by)
  values (v_sub.id, v_sub.user_id, v_plan.id, v_plan.price, 'renovacao', nullif(trim(p_payment_ref), ''), v_sub.expires_at, auth.uid());

  insert into public.notifications (user_id, kind, title, body, link)
  values (v_sub.user_id, 'plano', 'Assinatura renovada',
          'Seu ' || v_plan.name || ' foi renovado até ' ||
          to_char(v_sub.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.', '/app/meu-plano');
  return v_sub;
end $$;

create or replace function public.admin_set_subscription_status(p_subscription_id uuid, p_status text)
returns public.subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions;
begin
  perform public.assert_admin();
  if p_status not in ('ativa', 'suspensa', 'cancelada') then raise exception 'STATUS_INVALIDO'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'ASSINATURA_NAO_ENCONTRADA'; end if;
  if p_status = 'ativa' and v_sub.expires_at <= now() then raise exception 'ASSINATURA_EXPIRADA_USE_RENOVAR'; end if;

  update public.subscriptions set status = p_status where id = v_sub.id returning * into v_sub;

  insert into public.notifications (user_id, kind, title, body, link)
  values (v_sub.user_id, 'plano',
          case p_status when 'ativa' then 'Assinatura reativada'
                        when 'suspensa' then 'Assinatura suspensa'
                        else 'Assinatura cancelada' end,
          'Em caso de dúvidas, fale com o suporte.', '/app/meu-plano');
  return v_sub;
end $$;

create or replace function public.admin_broadcast(p_title text, p_body text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count int;
begin
  perform public.assert_admin();
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'COMUNICADO_VAZIO'; end if;
  insert into public.announcements (title, body, created_by) values (trim(p_title), trim(p_body), auth.uid())
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, dedupe_key)
  select u.id, 'admin', trim(p_title), trim(p_body), 'comunicado-' || v_id from auth.users u
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
--  Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.admin_users           enable row level security;
alter table public.app_settings          enable row level security;
alter table public.plans                 enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.products              enable row level security;
alter table public.sales                 enable row level security;
alter table public.transactions          enable row level security;
alter table public.notifications         enable row level security;
alter table public.announcements         enable row level security;
alter table public.daily_usage           enable row level security;

-- Perfis: cada um vê e edita só o próprio (colunas limitadas abaixo)
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Planos e configurações: leitura pública; alteração só para administradores
create policy plans_read_all     on public.plans for select to anon, authenticated using (true);
create policy plans_admin_insert on public.plans for insert to authenticated with check (public.is_admin());
create policy plans_admin_update on public.plans for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy settings_read_all     on public.app_settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Assinaturas: o usuário só lê as suas. Escrita apenas pelas funções admin_*.
create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy payments_admin_select on public.subscription_payments for select to authenticated using (public.is_admin());
create policy announcements_admin_select on public.announcements for select to authenticated using (public.is_admin());

-- Produtos: dono total, escrita exige acesso liberado (plano ou tempo gratuito)
create policy products_select_own on public.products for select to authenticated using (user_id = auth.uid());
create policy products_insert_own on public.products for insert to authenticated
  with check (user_id = auth.uid() and public.has_access());
create policy products_update_own on public.products for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_access());
create policy products_delete_own on public.products for delete to authenticated
  using (user_id = auth.uid() and public.has_access());

-- Vendas: somente leitura (criação/cancelamento pelas funções register_sale/cancel_sale)
create policy sales_select_own on public.sales for select to authenticated using (user_id = auth.uid());

-- Movimentações: as geradas por vendas não podem ser editadas diretamente
create policy transactions_select_own on public.transactions for select to authenticated using (user_id = auth.uid());
create policy transactions_insert_own on public.transactions for insert to authenticated
  with check (user_id = auth.uid() and sale_id is null and public.has_access());
create policy transactions_update_own on public.transactions for update to authenticated
  using (user_id = auth.uid() and sale_id is null)
  with check (user_id = auth.uid() and sale_id is null and public.has_access());
create policy transactions_delete_own on public.transactions for delete to authenticated
  using (user_id = auth.uid() and sale_id is null and public.has_access());

-- Notificações: leitura, marcar como lida e excluir as próprias
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Uso diário: somente leitura (escrita só por usage_heartbeat)
create policy daily_usage_select_own on public.daily_usage for select to authenticated using (user_id = auth.uid());

-- admin_users: sem políticas = inacessível pela API

-- Restrições por coluna (o usuário não consegue mudar campos sensíveis)
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, business_name, phone, expense_alert_threshold) on public.profiles to authenticated;

revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

revoke insert, update, delete on public.sales, public.subscriptions, public.subscription_payments,
                                  public.daily_usage, public.admin_users, public.announcements
  from anon, authenticated;
revoke all on public.products, public.transactions, public.profiles, public.sales, public.notifications,
              public.subscriptions, public.subscription_payments, public.daily_usage,
              public.admin_users, public.announcements
  from anon;

-- ---------------------------------------------------------------------
--  Permissões de execução das funções
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

revoke execute on function public._refresh_subscriptions(uuid) from authenticated;
revoke execute on function public.handle_new_user()            from authenticated;
revoke execute on function public.notify_big_expense()         from authenticated;
revoke execute on function public.notify_low_stock()           from authenticated;
revoke execute on function public.set_updated_at()             from authenticated;

grant execute on function public.br_today()          to authenticated, anon;
grant execute on function public.fmt_brl(numeric)    to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.assert_admin()      to authenticated;
grant execute on function public.has_active_plan(uuid) to authenticated;
grant execute on function public.has_access()        to authenticated;
grant execute on function public.get_my_status()     to authenticated;
grant execute on function public.usage_heartbeat()   to authenticated;
grant execute on function public.register_sale(uuid, int, text, text) to authenticated;
grant execute on function public.cancel_sale(uuid)   to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_overview()    to authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_list_subscriptions(text) to authenticated;
grant execute on function public.admin_list_payments() to authenticated;
grant execute on function public.admin_activate_plan(uuid, text, text, text) to authenticated;
grant execute on function public.admin_renew_subscription(uuid, text) to authenticated;
grant execute on function public.admin_set_subscription_status(uuid, text) to authenticated;
grant execute on function public.admin_broadcast(text, text) to authenticated;

-- ---------------------------------------------------------------------
--  Armazenamento de imagens de produtos
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy product_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy product_images_update_own on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy product_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
--  Tempo real (contador sincronizado entre aparelhos e sino de alertas)
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications, public.daily_usage;
