-- =====================================================================
--  Estilos Gestor — atualização 0003
--  Planos com limite diário por plano, recursos por plano, lembretes
--  personalizados, notificações push (fila de envio), preferências de
--  alertas e histórico de assinaturas.
--
--  Rode DEPOIS da 0001, no SQL Editor do Supabase. Não apaga dados:
--  só acrescenta colunas/tabelas e atualiza funções.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Planos: limite diário e recursos configuráveis
-- ---------------------------------------------------------------------

alter table public.plans
  add column if not exists daily_limit_seconds int
    check (daily_limit_seconds is null or daily_limit_seconds between 0 and 86400),   -- null = ilimitado
  add column if not exists allow_push       boolean not null default true,   -- notificações no celular/computador
  add column if not exists allow_reminders  boolean not null default false,  -- "Meus Lembretes"
  add column if not exists priority_support boolean not null default false,  -- atendimento humano prioritário
  add column if not exists featured         boolean not null default false,  -- destaque visual no card
  add column if not exists compare_to_plan_id text references public.plans(id) on delete set null;

alter table public.plans drop constraint if exists plans_id_format;
alter table public.plans add constraint plans_id_format check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$');

-- Definição dos planos (preços e benefícios combinados com o proprietário)
update public.plans set
  name = 'Plano Básico', description = 'Cobrança mensal', price = 40.00,
  billing_period = 'mensal', duration_months = 1, sort_order = 1,
  daily_limit_seconds = 36000, allow_push = true, allow_reminders = false, priority_support = false,
  featured = false, highlight = null, compare_to_plan_id = null,
  features = array[
    'Acesso à plataforma por até 10 horas diárias',
    'Controle de produtos e estoque',
    'Registro de vendas',
    'Controle de entradas e saídas',
    'Gráficos financeiros',
    'Notificações gerais',
    'Acesso pelo computador e celular'
  ]
where id = 'basico';

update public.plans set
  name = 'Plano Avançado', description = 'Cobrança mensal', price = 70.00,
  billing_period = 'mensal', duration_months = 1, sort_order = 2,
  daily_limit_seconds = null, allow_push = true, allow_reminders = true, priority_support = true,
  featured = true, highlight = 'Mais popular', compare_to_plan_id = null,
  features = array[
    'Uso ilimitado da plataforma, sem limite diário de horas',
    'Todos os recursos do Plano Básico',
    'Notificações gerais',
    'Lembretes personalizados de pagamentos',
    'Lembretes personalizados de compras',
    'Agendamento de compromissos financeiros',
    'Prioridade no atendimento de suporte',
    'Acesso pelo computador e celular'
  ]
where id = 'avancado';

update public.plans set
  name = 'Plano Completo Anual', description = 'Cobrança anual única (12 meses)', price = 240.00,
  billing_period = 'anual', duration_months = 12, sort_order = 3,
  daily_limit_seconds = null, allow_push = true, allow_reminders = true, priority_support = true,
  featured = false, highlight = 'Oferta promocional', compare_to_plan_id = 'avancado',
  features = array[
    'Todos os benefícios do Plano Avançado',
    'Uso ilimitado',
    'Notificações e lembretes personalizados',
    'Prioridade no suporte',
    'Acesso completo durante 12 meses'
  ]
where id = 'completo';

-- ---------------------------------------------------------------------
--  2. Direitos do usuário (plano vigente, limite diário, recursos)
-- ---------------------------------------------------------------------

create or replace function public._is_admin_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = p_user)
$$;

-- Plano da assinatura vigente (linha nula quando não há assinatura ativa)
create or replace function public._active_plan(p_user uuid)
returns public.plans language sql stable security definer set search_path = public as $$
  select p.*
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = p_user and s.status = 'ativa' and s.expires_at > now()
  order by s.expires_at desc
  limit 1
$$;

-- Limite diário em segundos. null = ilimitado (planos sem limite e administradores)
create or replace function public._daily_limit(p_user uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_free int;
begin
  if public._is_admin_user(p_user) then return null; end if;
  v_plan := public._active_plan(p_user);
  if v_plan.id is not null then return v_plan.daily_limit_seconds; end if;
  select free_daily_seconds into v_free from public.app_settings where id = 1;
  return coalesce(v_free, 10800);
end $$;

-- Recursos: 'push', 'lembretes', 'suporte'
create or replace function public._has_feature(p_user uuid, p_feature text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plans;
begin
  if p_user is null then return false; end if;
  if public._is_admin_user(p_user) then return true; end if;
  v_plan := public._active_plan(p_user);
  if v_plan.id is null then return false; end if;
  return case p_feature
    when 'push'      then v_plan.allow_push
    when 'lembretes' then v_plan.allow_reminders
    when 'suporte'   then v_plan.priority_support
    else false
  end;
end $$;

-- Versão para o usuário logado (usada nas políticas de segurança)
create or replace function public.has_feature(p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select public._has_feature(auth.uid(), p_feature)
$$;

-- Acesso liberado para gravar: plano sem limite, administrador, ou tempo do dia
-- restante (gratuito ou plano com limite) com sessão ativa (pulso no último minuto).
create or replace function public.has_access()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_limit int;
begin
  if auth.uid() is null then return false; end if;
  v_limit := public._daily_limit(auth.uid());
  if v_limit is null then return true; end if;
  return exists (
    select 1 from public.daily_usage u
    where u.user_id = auth.uid()
      and u.day = public.br_today()
      and u.seconds_used < v_limit
      and u.last_heartbeat > now() - interval '60 seconds'
  );
end $$;

create or replace function public._hours_label(p_seconds int)
returns text language sql immutable as $$
  select case when p_seconds % 3600 = 0 then (p_seconds / 3600)::text
              else replace(round(p_seconds / 3600.0, 1)::text, '.', ',') end
$$;

-- ---------------------------------------------------------------------
--  3. Contador diário (gratuito: 3h; Básico: 10h; Avançado/Anual: sem limite)
--  Uma linha por conta e por dia (horário de Brasília). Cada pulso soma no
--  máximo 30s desde o pulso anterior DA CONTA — com dois aparelhos abertos
--  ao mesmo tempo os pulsos se intercalam e o tempo não é contado em dobro.
-- ---------------------------------------------------------------------

create or replace function public.usage_heartbeat()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_day    date := public.br_today();
  v_plan   public.plans;
  v_limit  int;
  v_row    public.daily_usage;
  v_delta  int := 0;
  v_reset  timestamptz := ((public.br_today() + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if v_uid is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;

  perform public._refresh_subscriptions(v_uid);
  v_plan  := public._active_plan(v_uid);
  v_limit := public._daily_limit(v_uid);

  if v_limit is null then
    return json_build_object('unlimited', true, 'remaining_seconds', null, 'limit_seconds', null,
                             'server_now', now(), 'resets_at', v_reset,
                             'scope', case when v_plan.id is null then 'admin' else 'plano' end,
                             'plan_name', v_plan.name);
  end if;

  insert into public.daily_usage (user_id, day) values (v_uid, v_day) on conflict do nothing;
  select * into v_row from public.daily_usage where user_id = v_uid and day = v_day for update;

  if v_row.last_heartbeat is not null then
    v_delta := least(greatest(extract(epoch from now() - v_row.last_heartbeat), 0), 30)::int;
  end if;

  update public.daily_usage
     set seconds_used = least(greatest(v_limit, seconds_used), seconds_used + v_delta),
         last_heartbeat = now()
   where user_id = v_uid and day = v_day
  returning * into v_row;

  if v_row.seconds_used >= v_limit then
    if v_plan.id is null then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
      values (v_uid, 'tempo', 'Seu tempo gratuito de hoje terminou!',
              'Volte amanhã ou escolha um dos nossos planos para continuar utilizando a plataforma.',
              '/planos', 'tempo-' || v_day)
      on conflict (user_id, dedupe_key) do nothing;
    else
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
      values (v_uid, 'tempo', 'Seu limite diário de ' || public._hours_label(v_limit) || ' horas terminou',
              'O acesso ao ' || v_plan.name || ' será renovado à meia-noite (horário de Brasília). '
              || 'Para usar sem limite diário, conheça o Plano Avançado.',
              '/app/meu-plano', 'tempo-' || v_day)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;

  return json_build_object('unlimited', false,
                           'remaining_seconds', greatest(v_limit - v_row.seconds_used, 0),
                           'limit_seconds', v_limit,
                           'server_now', now(),
                           'resets_at', v_reset,
                           'scope', case when v_plan.id is null then 'gratuito' else 'plano' end,
                           'plan_name', v_plan.name);
end $$;

-- ---------------------------------------------------------------------
--  4. Histórico de assinaturas (auditoria das ações administrativas)
-- ---------------------------------------------------------------------

create table if not exists public.subscription_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  subscription_id  uuid references public.subscriptions(id) on delete set null,
  plan_id          text references public.plans(id) on delete set null,
  action           text not null check (action in ('ativacao', 'renovacao', 'suspensao', 'reativacao',
                                                   'cancelamento', 'vencimento', 'substituicao')),
  details          text,
  actor_id         uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists subscription_events_user_idx on public.subscription_events (user_id, created_at desc);

-- Registros anteriores a esta atualização
insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id, created_at)
select sp.user_id, sp.subscription_id, sp.plan_id, sp.kind,
       'Válido até ' || to_char(sp.period_end at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
         || coalesce(' · pagamento ' || sp.payment_ref, ''),
       sp.created_by, sp.created_at
from public.subscription_payments sp
where not exists (select 1 from public.subscription_events e where e.subscription_id = sp.subscription_id);

insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, created_at)
select s.user_id, s.id, s.plan_id,
       case s.status when 'suspensa' then 'suspensao' when 'cancelada' then 'cancelamento' else 'vencimento' end,
       'Registro anterior à atualização', s.updated_at
from public.subscriptions s
where s.status in ('suspensa', 'cancelada', 'vencida')
  and not exists (select 1 from public.subscription_events e
                  where e.subscription_id = s.id and e.action in ('suspensao', 'cancelamento', 'vencimento'));

-- Vencimentos: atualiza status, avisa e registra no histórico
create or replace function public._refresh_subscriptions(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_days int;
begin
  select expiry_notice_days into v_days from public.app_settings where id = 1;
  v_days := coalesce(v_days, 3);

  with expired as (
    update public.subscriptions
       set status = 'vencida'
     where status = 'ativa' and expires_at <= now()
       and (p_user is null or user_id = p_user)
    returning id, user_id, plan_id, expires_at
  ), notified as (
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select e.user_id, 'plano', 'Seu plano venceu',
           'Renove sua assinatura para voltar a aproveitar todos os recursos do seu plano.',
           '/app/meu-plano', 'vencido-' || e.id
    from expired e
    on conflict (user_id, dedupe_key) do nothing
  )
  insert into public.subscription_events (user_id, subscription_id, plan_id, action, details)
  select e.user_id, e.id, e.plan_id, 'vencimento',
         'Venceu em ' || to_char(e.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
  from expired e;

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

-- Situação da conta logada: assinatura vigente + direitos do plano
create or replace function public.get_my_status()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_sub  json;
  v_plan public.plans;
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

  v_plan := public._active_plan(v_uid);

  return json_build_object(
    'is_admin', public.is_admin(),
    'subscription', v_sub,
    'entitlements', json_build_object(
      'plan_id', v_plan.id,
      'plan_name', coalesce(v_plan.name, 'Gratuito'),
      'daily_limit_seconds', public._daily_limit(v_uid),
      'push', public._has_feature(v_uid, 'push'),
      'reminders', public._has_feature(v_uid, 'lembretes'),
      'priority_support', public._has_feature(v_uid, 'suporte')
    )
  );
end $$;

-- ---------------------------------------------------------------------
--  5. Administração com histórico (ativar, renovar, suspender, cancelar)
--  Salvar/editar um plano NÃO ativa nada: ativação é sempre individual.
-- ---------------------------------------------------------------------

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

  -- Um plano ativo por vez: o anterior é encerrado (e fica no histórico)
  with replaced as (
    update public.subscriptions
       set status = 'cancelada', notes = coalesce(notes || ' | ', '') || 'Substituída por nova ativação'
     where user_id = p_user_id and status in ('ativa', 'suspensa')
    returning id, plan_id
  )
  insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id)
  select p_user_id, r.id, r.plan_id, 'substituicao', 'Encerrada para ativar ' || v_plan.name, auth.uid()
  from replaced r;

  insert into public.subscriptions (user_id, plan_id, status, price, started_at, expires_at, payment_ref, notes, activated_by)
  values (p_user_id, v_plan.id, 'ativa', v_plan.price, now(),
          now() + make_interval(months => v_plan.duration_months),
          nullif(trim(p_payment_ref), ''), nullif(trim(p_notes), ''), auth.uid())
  returning * into v_sub;

  insert into public.subscription_payments (subscription_id, user_id, plan_id, amount, kind, payment_ref, period_end, created_by)
  values (v_sub.id, p_user_id, v_plan.id, v_plan.price, 'ativacao', v_sub.payment_ref, v_sub.expires_at, auth.uid());

  insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id)
  values (p_user_id, v_sub.id, v_plan.id, 'ativacao',
          public.fmt_brl(v_plan.price) || ' · válido até '
            || to_char(v_sub.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
            || coalesce(' · pagamento ' || v_sub.payment_ref, '')
            || coalesce(' · ' || v_sub.notes, ''),
          auth.uid());

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

  insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id)
  values (v_sub.user_id, v_sub.id, v_plan.id, 'renovacao',
          public.fmt_brl(v_plan.price) || ' · válido até '
            || to_char(v_sub.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
            || coalesce(' · pagamento ' || nullif(trim(p_payment_ref), ''), ''),
          auth.uid());

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
  v_old text;
begin
  perform public.assert_admin();
  if p_status not in ('ativa', 'suspensa', 'cancelada') then raise exception 'STATUS_INVALIDO'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'ASSINATURA_NAO_ENCONTRADA'; end if;
  if p_status = 'ativa' and v_sub.expires_at <= now() then raise exception 'ASSINATURA_EXPIRADA_USE_RENOVAR'; end if;
  if v_sub.status = p_status then return v_sub; end if;
  v_old := v_sub.status;

  update public.subscriptions set status = p_status where id = v_sub.id returning * into v_sub;

  insert into public.subscription_events (user_id, subscription_id, plan_id, action, details, actor_id)
  values (v_sub.user_id, v_sub.id, v_sub.plan_id,
          case p_status when 'ativa' then 'reativacao' when 'suspensa' then 'suspensao' else 'cancelamento' end,
          'Status anterior: ' || v_old, auth.uid());

  insert into public.notifications (user_id, kind, title, body, link)
  values (v_sub.user_id, 'plano',
          case p_status when 'ativa' then 'Assinatura reativada'
                        when 'suspensa' then 'Assinatura suspensa'
                        else 'Assinatura cancelada' end,
          'Em caso de dúvidas, fale com o suporte.', '/app/meu-plano');
  return v_sub;
end $$;

-- Lista de clientes com a assinatura mais relevante
drop function if exists public.admin_list_users(text);
create function public.admin_list_users(p_search text default null)
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
         exists (select 1 from public.admin_users a where a.user_id = u.id),
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

create or replace function public.admin_user_history(p_user_id uuid)
returns table (id uuid, action text, plan_name text, details text, actor_email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select public.assert_admin();
  select e.id, e.action, coalesce(pl.name, e.plan_id), e.details, a.email::text, e.created_at
  from public.subscription_events e
  left join public.plans pl on pl.id = e.plan_id
  left join auth.users a on a.id = e.actor_id
  where e.user_id = p_user_id
  order by e.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
--  6. Notificações: nova categoria "lembrete" + fila de envio push
-- ---------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('estoque', 'venda', 'despesa', 'plano', 'tempo', 'admin', 'sistema', 'lembrete'));

alter table public.notifications
  add column if not exists push_status text not null default 'nao_aplicavel'
    check (push_status in ('pendente', 'enviando', 'enviada', 'sem_destino', 'falhou', 'expirada', 'nao_aplicavel')),
  add column if not exists push_attempts   int not null default 0,
  add column if not exists push_claimed_at timestamptz,
  add column if not exists pushed_at       timestamptz;
create index if not exists notifications_push_queue_idx on public.notifications (created_at)
  where push_status in ('pendente', 'enviando');

-- Preferências: quais categorias o usuário quer receber no celular/computador.
-- A central de notificações (sino) continua guardando todas.
create table if not exists public.notification_preferences (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  estoque      boolean not null default true,
  vendas       boolean not null default true,
  despesas     boolean not null default true,
  assinatura   boolean not null default true,
  lembretes    boolean not null default true,
  comunicados  boolean not null default true,
  sistema      boolean not null default true,
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_notification_preferences_updated on public.notification_preferences;
create trigger trg_notification_preferences_updated before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Inscrições Web Push (uma por navegador/aparelho)
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  endpoint         text not null unique check (char_length(endpoint) <= 1000),
  p256dh           text not null check (char_length(p256dh) between 60 and 120),
  auth             text not null check (char_length(auth) between 16 and 40),
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    int not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Somente serviços de push conhecidos (evita que o servidor chame endereços arbitrários)
create or replace function public._is_push_endpoint(p_endpoint text)
returns boolean language sql immutable as $$
  select coalesce(p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/', false)
$$;

create or replace function public._push_category_enabled(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_kind
             when 'estoque'  then np.estoque
             when 'venda'    then np.vendas
             when 'despesa'  then np.despesas
             when 'plano'    then np.assinatura
             when 'lembrete' then np.lembretes
             when 'admin'    then np.comunicados
             else np.sistema
           end
    from public.notification_preferences np where np.user_id = p_user
  ), true)
$$;

-- Ao criar qualquer notificação: entra na fila de push somente se o plano permite,
-- a categoria está ativada e o usuário tem pelo menos um aparelho inscrito.
create or replace function public.notifications_queue_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.push_status := 'nao_aplicavel';
  if public._has_feature(new.user_id, 'push')
     and public._push_category_enabled(new.user_id, new.kind)
     and exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
    new.push_status := 'pendente';
  end if;
  return new;
end $$;

drop trigger if exists trg_notifications_queue_push on public.notifications;
create trigger trg_notifications_queue_push
  before insert on public.notifications
  for each row execute function public.notifications_queue_push();

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  if not public._has_feature(auth.uid(), 'push') then raise exception 'RECURSO_DO_PLANO'; end if;
  if not public._is_push_endpoint(p_endpoint) then raise exception 'PUSH_ENDPOINT_INVALIDO'; end if;

  -- O mesmo navegador pode trocar de conta: a inscrição passa a ser de quem está logado
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, failure_count = 0;

  -- No máximo 10 aparelhos por conta (mantém os mais recentes)
  delete from public.push_subscriptions
   where user_id = auth.uid()
     and id not in (select id from public.push_subscriptions where user_id = auth.uid()
                    order by created_at desc limit 10);
end $$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ----- Funções do servidor de envio (somente service_role) -----

create or replace function public.push_claim_batch(p_limit int default 100)
returns table (notification_id uuid, user_id uuid, kind text, title text, body text, link text,
               created_at timestamptz, subscriptions json)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  -- Avisos com mais de 24h não são mais enviados ao aparelho (continuam no sino)
  update public.notifications
     set push_status = 'expirada'
   where push_status in ('pendente', 'enviando') and created_at < now() - interval '24 hours';

  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.push_status = 'pendente'
       or (n.push_status = 'enviando' and n.push_claimed_at < now() - interval '5 minutes' and n.push_attempts < 3)
    order by n.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ), claimed as (
    update public.notifications n
       set push_status = 'enviando', push_claimed_at = now(), push_attempts = n.push_attempts + 1
      from picked
     where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link, n.created_at
  )
  select c.id, c.user_id, c.kind, c.title, c.body, c.link, c.created_at,
         coalesce((select json_agg(json_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                   from public.push_subscriptions s
                   where s.user_id = c.user_id and public._is_push_endpoint(s.endpoint)), '[]'::json)
  from claimed c;
end $$;

create or replace function public.push_finish(p_notification_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('enviada', 'sem_destino', 'falhou', 'pendente') then raise exception 'STATUS_INVALIDO'; end if;
  update public.notifications
     set push_status = case when p_status = 'pendente' and push_attempts >= 3 then 'falhou' else p_status end,
         pushed_at = case when p_status = 'enviada' then now() else pushed_at end
   where id = p_notification_id;
end $$;

-- Resultado por aparelho: inscrição expirada (404/410) é removida
create or replace function public.push_subscription_result(p_endpoint text, p_ok boolean, p_gone boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_gone then
    delete from public.push_subscriptions where endpoint = p_endpoint;
  elsif p_ok then
    update public.push_subscriptions set last_success_at = now(), failure_count = 0 where endpoint = p_endpoint;
  else
    update public.push_subscriptions set failure_count = failure_count + 1 where endpoint = p_endpoint;
    delete from public.push_subscriptions where endpoint = p_endpoint and failure_count >= 10;
  end if;
end $$;

-- Aparelhos de um usuário (rota de teste do servidor, após validar o token do usuário)
create or replace function public.push_targets_for_user(p_user uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public._has_feature(p_user, 'push') then raise exception 'RECURSO_DO_PLANO'; end if;
  return query
    select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
    where s.user_id = p_user and public._is_push_endpoint(s.endpoint);
end $$;

-- ---------------------------------------------------------------------
--  7. Lembretes personalizados (Plano Avançado e Completo Anual)
-- ---------------------------------------------------------------------

create table if not exists public.reminders (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title                  text not null check (char_length(trim(title)) between 1 and 120),
  description            text check (description is null or char_length(description) <= 500),
  category               text not null default 'outro' check (category in ('pagamento', 'compra', 'outro')),
  due_date               date not null,                -- data no horário de Brasília
  due_time               time not null,                -- horário de Brasília
  amount                 numeric(12,2) check (amount is null or (amount >= 0 and amount <= 99999999)),
  repeat                 text not null default 'unica' check (repeat in ('unica', 'diaria', 'semanal', 'mensal')),
  notify_before_minutes  int not null default 0 check (notify_before_minutes between 0 and 10080),
  status                 text not null default 'ativo' check (status in ('ativo', 'concluido')),
  occurrence             int not null default 0 check (occurrence >= 0),  -- repetições já cumpridas
  next_due_at            timestamptz,                                    -- próxima ocorrência (calculada)
  next_notify_at         timestamptz,                                    -- quando avisar (calculada)
  last_notified_at       timestamptz,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists reminders_user_idx on public.reminders (user_id, status, next_due_at);
create index if not exists reminders_due_idx on public.reminders (next_notify_at) where status = 'ativo' and next_notify_at is not null;

-- Ocorrência n (0 = a primeira), calculada no fuso de Brasília.
-- Mensal: 31/01 -> 28/02 -> 31/03 (sempre a partir da data original, sem "escorregar").
create or replace function public._reminder_due_at(p_date date, p_time time, p_repeat text, p_n int)
returns timestamptz language sql stable as $$
  select ((p_date + p_time)
          + case p_repeat when 'diaria'  then make_interval(days => p_n)
                          when 'semanal' then make_interval(days => 7 * p_n)
                          when 'mensal'  then make_interval(months => p_n)
                          else interval '0' end)
         at time zone 'America/Sao_Paulo'
$$;

-- Recalcula a próxima ocorrência e o horário do aviso sempre que a agenda muda
create or replace function public.reminders_schedule()
returns trigger language plpgsql set search_path = public as $$
declare
  v_due  timestamptz;
  v_guard int := 0;
begin
  if tg_op = 'UPDATE' then
    if (new.due_date, new.due_time, new.repeat) is distinct from (old.due_date, old.due_time, old.repeat) then
      new.occurrence := 0;
    end if;
    new.updated_at := now();
    if (new.due_date, new.due_time, new.repeat, new.notify_before_minutes, new.status, new.occurrence)
       is not distinct from
       (old.due_date, old.due_time, old.repeat, old.notify_before_minutes, old.status, old.occurrence) then
      return new;  -- só texto/valor mudou: agenda continua igual
    end if;
  end if;

  if new.status = 'concluido' then
    new.next_notify_at := null;
    new.completed_at := coalesce(new.completed_at, now());
    return new;
  end if;
  new.completed_at := null;

  v_due := public._reminder_due_at(new.due_date, new.due_time, new.repeat, new.occurrence);
  if new.repeat <> 'unica' then
    -- Repetições que já passaram são puladas (sem enxurrada de avisos atrasados)
    while v_due <= now() and v_guard < 20000 loop
      new.occurrence := new.occurrence + 1;
      v_due := public._reminder_due_at(new.due_date, new.due_time, new.repeat, new.occurrence);
      v_guard := v_guard + 1;
    end loop;
  end if;

  new.next_due_at := v_due;
  if v_due <= now() then
    new.next_notify_at := null;  -- lembrete único com data passada: fica como atrasado, sem aviso
  else
    new.next_notify_at := greatest(v_due - make_interval(mins => new.notify_before_minutes), now());
  end if;
  return new;
end $$;

drop trigger if exists trg_reminders_schedule on public.reminders;
create trigger trg_reminders_schedule
  before insert or update on public.reminders
  for each row execute function public.reminders_schedule();

-- Concluir: lembrete único fica concluído; repetido avança para a próxima ocorrência
create or replace function public.complete_reminder(p_id uuid)
returns public.reminders language plpgsql security definer set search_path = public as $$
declare
  v_r public.reminders;
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO' using errcode = '28000'; end if;
  if not public._has_feature(auth.uid(), 'lembretes') then raise exception 'RECURSO_DO_PLANO'; end if;
  select * into v_r from public.reminders where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'LEMBRETE_NAO_ENCONTRADO'; end if;
  if v_r.status = 'concluido' then return v_r; end if;

  if v_r.repeat = 'unica' then
    update public.reminders set status = 'concluido' where id = p_id returning * into v_r;
  else
    update public.reminders set occurrence = occurrence + 1 where id = p_id returning * into v_r;
  end if;
  return v_r;
end $$;

-- Processamento agendado (a cada minuto): cria a notificação de cada lembrete
-- vencido UMA única vez (chave por ocorrência) e agenda a próxima repetição.
create or replace function public.process_due_reminders(p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare
  r        public.reminders;
  v_count  int := 0;
  v_local  timestamp;
  v_when   text;
  v_body   text;
begin
  for r in
    select * from public.reminders
     where status = 'ativo' and next_notify_at is not null and next_notify_at <= now()
     order by next_notify_at
     limit greatest(1, least(coalesce(p_limit, 500), 2000))
     for update skip locked
  loop
    if public._has_feature(r.user_id, 'lembretes') then
      v_local := r.next_due_at at time zone 'America/Sao_Paulo';
      v_when := case
        when v_local::date = public.br_today()     then 'Hoje às ' || to_char(v_local, 'HH24:MI')
        when v_local::date = public.br_today() + 1 then 'Amanhã às ' || to_char(v_local, 'HH24:MI')
        else 'Dia ' || to_char(v_local, 'DD/MM') || ' às ' || to_char(v_local, 'HH24:MI')
      end;
      v_body := v_when
        || coalesce(' — ' || nullif(rtrim(trim(r.description), '.'), ''), '')
        || case when r.amount is not null then '. Valor: ' || public.fmt_brl(r.amount) else '' end
        || '.';
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
      values (r.user_id, 'lembrete', '🔔 Lembrete: ' || r.title, v_body, '/app/lembretes',
              'lembrete-' || r.id || '-' || to_char(r.next_due_at at time zone 'UTC', 'YYYYMMDDHH24MI'))
      on conflict (user_id, dedupe_key) do nothing;
      v_count := v_count + 1;
    end if;

    if r.repeat = 'unica' then
      update public.reminders set next_notify_at = null, last_notified_at = now() where id = r.id;
    else
      update public.reminders set occurrence = occurrence + 1, last_notified_at = now() where id = r.id;
    end if;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
--  8. Segurança (RLS + permissões)
-- ---------------------------------------------------------------------

alter table public.subscription_events      enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions       enable row level security;
alter table public.reminders                enable row level security;

drop policy if exists subscription_events_admin_select on public.subscription_events;
create policy subscription_events_admin_select on public.subscription_events
  for select to authenticated using (public.is_admin());

drop policy if exists notif_prefs_select_own on public.notification_preferences;
drop policy if exists notif_prefs_insert_own on public.notification_preferences;
drop policy if exists notif_prefs_update_own on public.notification_preferences;
create policy notif_prefs_select_own on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy notif_prefs_insert_own on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy notif_prefs_update_own on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subs_select_own on public.push_subscriptions;
drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subs_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Lembretes: o dono sempre vê e pode excluir os seus; criar e editar exige o recurso no plano
drop policy if exists reminders_select_own on public.reminders;
drop policy if exists reminders_insert_own on public.reminders;
drop policy if exists reminders_update_own on public.reminders;
drop policy if exists reminders_delete_own on public.reminders;
create policy reminders_select_own on public.reminders for select to authenticated using (user_id = auth.uid());
create policy reminders_insert_own on public.reminders for insert to authenticated
  with check (user_id = auth.uid() and public.has_feature('lembretes'));
create policy reminders_update_own on public.reminders for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_feature('lembretes'));
create policy reminders_delete_own on public.reminders for delete to authenticated using (user_id = auth.uid());

-- Permissões por coluna: campos calculados pelo servidor não podem ser alterados pelo navegador
revoke all on public.subscription_events, public.notification_preferences, public.push_subscriptions, public.reminders from anon;
revoke insert, update, delete on public.subscription_events from authenticated;
revoke insert, update on public.push_subscriptions from authenticated;
revoke insert, update on public.reminders from authenticated;
grant select, delete on public.reminders to authenticated;
grant insert (title, description, category, due_date, due_time, amount, repeat, notify_before_minutes)
  on public.reminders to authenticated;
grant update (title, description, category, due_date, due_time, amount, repeat, notify_before_minutes, status)
  on public.reminders to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Funções: nada novo fica exposto por padrão
revoke execute on all functions in schema public from public, anon;
grant execute on function public.br_today() to anon;

revoke execute on function public._is_admin_user(uuid)                from authenticated;
revoke execute on function public._active_plan(uuid)                  from authenticated;
revoke execute on function public._daily_limit(uuid)                  from authenticated;
revoke execute on function public._has_feature(uuid, text)            from authenticated;
revoke execute on function public._push_category_enabled(uuid, text)  from authenticated;
revoke execute on function public.notifications_queue_push()          from authenticated;
revoke execute on function public.reminders_schedule()                from authenticated;
revoke execute on function public.process_due_reminders(int)          from authenticated;
revoke execute on function public.push_claim_batch(int)               from authenticated;
revoke execute on function public.push_finish(uuid, text)             from authenticated;
revoke execute on function public.push_subscription_result(text, boolean, boolean) from authenticated;
revoke execute on function public.push_targets_for_user(uuid)         from authenticated;

grant execute on function public.has_feature(text)                    to authenticated;
grant execute on function public._hours_label(int)                    to authenticated;
grant execute on function public._is_push_endpoint(text)              to authenticated;
grant execute on function public._reminder_due_at(date, time, text, int) to authenticated;
grant execute on function public.has_access()                         to authenticated;
grant execute on function public.usage_heartbeat()                    to authenticated;
grant execute on function public.get_my_status()                      to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text)       to authenticated;
grant execute on function public.complete_reminder(uuid)              to authenticated;
grant execute on function public.admin_activate_plan(uuid, text, text, text) to authenticated;
grant execute on function public.admin_renew_subscription(uuid, text) to authenticated;
grant execute on function public.admin_set_subscription_status(uuid, text) to authenticated;
grant execute on function public.admin_list_users(text)               to authenticated;
grant execute on function public.admin_user_history(uuid)             to authenticated;

-- Servidor de envio (chave service_role, usada só na rota /api/push/*)
grant execute on function public.process_due_reminders(int)           to service_role;
grant execute on function public.push_claim_batch(int)                to service_role;
grant execute on function public.push_finish(uuid, text)              to service_role;
grant execute on function public.push_subscription_result(text, boolean, boolean) to service_role;
grant execute on function public.push_targets_for_user(uuid)          to service_role;

-- Tempo real: lembretes atualizados em outros aparelhos
do $$ begin
  alter publication supabase_realtime add table public.reminders;
exception when others then null;
end $$;
