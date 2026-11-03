/**
 * MODO DEMONSTRAÇÃO
 * Usado automaticamente quando o Supabase não está configurado.
 * Tudo fica salvo apenas neste navegador (localStorage), nenhum e-mail é enviado
 * e nenhum pagamento é real. A interface mostra uma faixa avisando isso.
 * As regras imitam as do banco (estoque, vendas sem duplicidade, limite diário etc.).
 */
import { addDays, blobToDataUrl, brDateKey, brMidnight, formatBRL, uid } from "../utils";
import type { Backend } from "./backend";
import { AppError } from "./errors";
import type {
  AdminHistoryRow,
  AdminSubscriptionRow,
  AppNotification,
  AppSettings,
  AuditRow,
  Entitlements,
  HistoryAction,
  MySubscription,
  NotificationKind,
  NotificationPrefs,
  PaymentStatus,
  Plan,
  PlatformExpense,
  Product,
  Profile,
  Reminder,
  ReminderRepeat,
  Sale,
  SalesReport,
  SessionUser,
  SubscriptionSaleRow,
  Transaction,
} from "./types";

const KEY = "estilos-gestor-demo-v1";

interface DemoUser {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  business_name: string | null;
  phone: string | null;
  expense_alert_threshold: number;
  verified: boolean;
  /** Conta do proprietário (e-mail autorizado + confirmado); calculado no login */
  owner?: boolean;
  created_at: string;
}
type DemoPayment = Omit<SubscriptionSaleRow, "plan_name"> & { idempotency_key: string | null };
type Owned<T> = T & { user_id: string };
interface DemoSub extends Omit<MySubscription, "plan_name" | "billing_period"> {
  user_id: string;
  payment_ref: string | null;
  notes: string | null;
  created_at: string;
}
interface DemoEvent {
  id: string;
  user_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  action: HistoryAction;
  details: string | null;
  actor_email: string | null;
  created_at: string;
}
interface DemoDB {
  version: number;
  users: DemoUser[];
  session: string | null;
  codes: Record<string, { code: string; kind: "signup" | "recovery"; expires: number }>;
  plans: Plan[];
  settings: AppSettings;
  subscriptions: DemoSub[];
  payments: DemoPayment[];
  expenses: PlatformExpense[];
  audit: AuditRow[];
  products: Owned<Product>[];
  sales: Owned<Sale & { idempotency_key: string }>[];
  transactions: Owned<Transaction>[];
  notifications: Owned<AppNotification & { dedupe_key: string | null }>[];
  usage: Record<string, { seconds_used: number; last_heartbeat: number | null }>;
  reminders: Owned<Reminder>[];
  prefs: Record<string, NotificationPrefs>;
  events: DemoEvent[];
}

const DB_VERSION = 3;

/** SHA-256 do e-mail do proprietário (o endereço não fica no código). Igual à migração 0005. */
const OWNER_EMAIL_SHA256 = "4509403e4c921552071da7e7675ed002736378a7ab3817c6b9947b44ab757dd6";

// Mesma definição da migração 0003 do banco
const defaultPlans = (): Plan[] => [
  {
    id: "basico", name: "Plano Básico", description: "Cobrança mensal", price: 40, billing_period: "mensal", duration_months: 1,
    features: ["Até 10 horas de uso por dia", "Gestão de produtos", "Controle de estoque", "Registro de vendas", "Entradas e saídas", "Gráficos financeiros", "Notificações gerais"],
    highlight: null, is_active: true, sort_order: 1,
    daily_limit_seconds: 36000, allow_push: true, allow_reminders: false, priority_support: false, featured: false, compare_to_plan_id: null,
  },
  {
    id: "avancado", name: "Plano Avançado", description: "Cobrança mensal", price: 70, billing_period: "mensal", duration_months: 1,
    features: ["Uso ilimitado", "Todas as funcionalidades do Plano Básico", "Notificações gerais", "Lembretes personalizados de pagamentos", "Lembretes de compras", "Agendamento de compromissos", "Prioridade no suporte"],
    highlight: "Mais popular", is_active: true, sort_order: 2,
    daily_limit_seconds: null, allow_push: true, allow_reminders: true, priority_support: true, featured: true, compare_to_plan_id: null,
  },
  {
    id: "completo", name: "Plano Completo Anual", description: "Pagamento anual à vista (12 meses)", price: 240, billing_period: "anual", duration_months: 12,
    features: ["Uso ilimitado", "Todos os benefícios do Plano Avançado", "Lembretes personalizados e notificações", "Prioridade no suporte", "Acesso completo durante 12 meses"],
    highlight: "Oferta promocional", is_active: true, sort_order: 3,
    daily_limit_seconds: null, allow_push: true, allow_reminders: true, priority_support: true, featured: false, compare_to_plan_id: "avancado",
  },
];

const DEFAULT_PREFS: NotificationPrefs = { estoque: true, vendas: true, despesas: true, assinatura: true, lembretes: true, comunicados: true, sistema: true };

const defaultSettings = (): AppSettings => ({
  whatsapp_number: "5511959311513",
  support_email: null,
  instagram_url: null,
  satisfied_clients_value: 120,
  satisfied_clients_is_demo: true,
  free_daily_seconds: 3600,
  expiry_notice_days: 3,
});

const empty = (): DemoDB => ({
  version: DB_VERSION,
  users: [],
  session: null,
  codes: {},
  plans: defaultPlans(),
  settings: defaultSettings(),
  subscriptions: [],
  payments: [],
  expenses: [],
  audit: [],
  products: [],
  sales: [],
  transactions: [],
  notifications: [],
  usage: {},
  reminders: [],
  prefs: {},
  events: [],
});

let cache: DemoDB | null = null;
const authListeners = new Set<(u: SessionUser | null) => void>();
const notifListeners = new Set<() => void>();
const usageListeners = new Set<(s: number) => void>();

function load(): DemoDB {
  if (cache) return cache;
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...empty(), ...(JSON.parse(raw) as DemoDB) } : empty();
  } catch {
    cache = empty();
  }
  // Atualização da demonstração salva antes dos novos planos
  if (!cache!.version || cache!.version < DB_VERSION) {
    const db = cache!;
    db.plans = defaultPlans();
    // Versão pública: Gratuito 1 h/dia, WhatsApp oficial, vendas com situação
    db.settings = { ...defaultSettings(), ...db.settings, free_daily_seconds: 3600, whatsapp_number: "5511959311513", instagram_url: db.settings?.instagram_url ?? null };
    db.payments = (db.payments ?? []).map((p) => {
      const old = p as unknown as Partial<DemoPayment> & { created_at: string; user_id: string };
      const u = db.users.find((x) => x.id === old.user_id);
      return {
        id: old.id ?? uid(), user_id: old.user_id ?? null, customer_name: old.customer_name ?? u?.full_name ?? "", customer_email: old.customer_email ?? u?.email ?? "",
        plan_id: old.plan_id ?? "", amount: old.amount ?? 0, method: old.method ?? null, status: old.status ?? "confirmado", kind: old.kind ?? null,
        paid_at: old.paid_at ?? old.created_at, period_end: old.period_end ?? null, payment_ref: old.payment_ref ?? null, notes: old.notes ?? null,
        status_reason: old.status_reason ?? null, subscription_id: old.subscription_id ?? null, created_at: old.created_at, idempotency_key: old.idempotency_key ?? null,
      };
    });
    db.expenses = db.expenses ?? [];
    db.audit = db.audit ?? [];
    db.version = DB_VERSION;
  }
  return cache!;
}

function save() {
  if (!cache || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    throw new AppError("ARMAZENAMENTO_CHEIO", "O armazenamento do navegador está cheio. Remova imagens ou reinicie a demonstração.");
  }
}

// Outras abas do mesmo navegador (simula a sincronização entre aparelhos)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    cache = null;
    const db = load();
    const me = db.users.find((u) => u.id === db.session);
    authListeners.forEach((fn) => fn(me ? toSession(me) : null));
    notifListeners.forEach((fn) => fn());
    if (me) {
      const u = db.usage[`${me.id}:${brDateKey(new Date())}`];
      if (u) usageListeners.forEach((fn) => fn(u.seconds_used));
    }
  });
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const toSession = (u: DemoUser): SessionUser => ({ id: u.id, email: u.email, name: u.full_name });

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
const hashPassword = (email: string, password: string) => sha256(`estilos-gestor-demo:${email}:${password}`);

function me(): DemoUser {
  const db = load();
  const u = db.users.find((x) => x.id === db.session);
  if (!u) throw new AppError("NAO_AUTENTICADO");
  return u;
}

async function refreshOwnerFlag(u: DemoUser) {
  u.owner = (await sha256(u.email.trim().toLowerCase())) === OWNER_EMAIL_SHA256;
}

/** Proprietário: e-mail autorizado e confirmado (mesma regra do banco) */
function isOwnerId(userId: string | null | undefined) {
  const u = load().users.find((x) => x.id === userId);
  return Boolean(u && u.verified && u.owner);
}

/** Na demonstração, a administração segue a mesma regra da versão publicada: só o proprietário. */
function assertOwner() {
  if (!isOwnerId(me().id)) throw new AppError("ACESSO_NEGADO");
}

function audit(action: string, entity: string, summary: string) {
  const db = load();
  const actor = db.users.find((u) => u.id === db.session);
  db.audit.unshift({ id: uid(), action, entity, summary, actor_email: actor?.email ?? null, created_at: now() });
  if (db.audit.length > 500) db.audit.length = 500;
}

function notify(userId: string, kind: NotificationKind, title: string, body: string, link: string | null = null, dedupe: string | null = null) {
  const db = load();
  if (dedupe && db.notifications.some((n) => n.user_id === userId && n.dedupe_key === dedupe)) return;
  db.notifications.unshift({ id: uid(), user_id: userId, kind, title, body, link, read_at: null, created_at: now(), dedupe_key: dedupe });
  notifListeners.forEach((fn) => setTimeout(fn, 0));
}

function newCode(email: string, kind: "signup" | "recovery") {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  load().codes[email] = { code, kind, expires: Date.now() + 30 * 60_000 };
  return code;
}

function activePlan(userId: string) {
  return load().subscriptions.find((s) => s.user_id === userId && s.status === "ativa" && new Date(s.expires_at) > new Date());
}

function refreshSubscriptions(userId: string) {
  const db = load();
  const days = db.settings.expiry_notice_days;
  for (const s of db.subscriptions.filter((x) => x.user_id === userId && x.status === "ativa")) {
    const exp = new Date(s.expires_at).getTime();
    if (exp <= Date.now()) {
      s.status = "vencida";
      logEvent(userId, s.id, s.plan_id, "vencimento", `Venceu em ${new Date(s.expires_at).toLocaleDateString("pt-BR")}`);
      notify(userId, "plano", "Seu plano venceu", "Renove sua assinatura para voltar a aproveitar todos os recursos do seu plano.", "/app/meu-plano", `vencido-${s.id}`);
    } else if (exp <= Date.now() + days * 86_400_000) {
      notify(userId, "plano", "Seu plano está próximo do vencimento!", "Renove sua assinatura para continuar aproveitando todas as funcionalidades.", "/app/meu-plano", `aviso-${s.id}-${s.expires_at.slice(0, 10)}`);
    }
  }
}

function usageRow(userId: string) {
  const db = load();
  const key = `${userId}:${brDateKey(new Date())}`;
  if (!db.usage[key]) db.usage[key] = { seconds_used: 0, last_heartbeat: null };
  return db.usage[key];
}

function planOf(userId: string) {
  const sub = activePlan(userId);
  return sub ? load().plans.find((p) => p.id === sub.plan_id) ?? null : null;
}

/** Limite diário em segundos (null = ilimitado), como no banco */
function dailyLimit(userId: string): number | null {
  if (isOwnerId(userId)) return null;
  const plan = planOf(userId);
  if (plan) return plan.daily_limit_seconds;
  return load().settings.free_daily_seconds;
}

function hasFeature(userId: string, feature: "push" | "lembretes" | "suporte") {
  if (isOwnerId(userId)) return true;
  const plan = planOf(userId);
  if (!plan) return false;
  return feature === "push" ? plan.allow_push : feature === "lembretes" ? plan.allow_reminders : plan.priority_support;
}

function entitlements(userId: string): Entitlements {
  const plan = planOf(userId);
  return {
    plan_id: plan?.id ?? null,
    plan_name: isOwnerId(userId) ? "Proprietário" : plan?.name ?? "Gratuito",
    daily_limit_seconds: dailyLimit(userId),
    push: hasFeature(userId, "push"),
    reminders: hasFeature(userId, "lembretes"),
    priority_support: hasFeature(userId, "suporte"),
  };
}

function hasAccess(userId: string) {
  const limit = dailyLimit(userId);
  if (limit == null) return true;
  const u = usageRow(userId);
  return u.seconds_used < limit && u.last_heartbeat != null && Date.now() - u.last_heartbeat < 60_000;
}

function requireFeature(userId: string, feature: "lembretes") {
  if (!hasFeature(userId, feature)) throw new AppError("RECURSO_DO_PLANO");
}

function logEvent(userId: string, subscriptionId: string | null, planId: string | null, action: HistoryAction, details: string | null) {
  const db = load();
  const actor = db.users.find((u) => u.id === db.session);
  db.events.unshift({ id: uid(), user_id: userId, subscription_id: subscriptionId, plan_id: planId, action, details, actor_email: actor?.email ?? null, created_at: now() });
}

// ---------- Lembretes: mesmas regras de agenda do banco (fuso de Brasília, UTC-3) ----------
function reminderDueAt(date: string, time: string, repeat: ReminderRepeat, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  let month = m - 1;
  let day = d;
  if (repeat === "diaria") day += n;
  else if (repeat === "semanal") day += 7 * n;
  else if (repeat === "mensal") {
    month += n;
    day = Math.min(d, new Date(Date.UTC(y, month + 1, 0)).getUTCDate()); // 31/01 -> 28/02 -> 31/03
  }
  return new Date(Date.UTC(y, month, day, hh + 3, mm));
}

function scheduleReminder(r: Reminder) {
  if (r.status === "concluido") {
    r.next_notify_at = null;
    r.completed_at = r.completed_at ?? now();
    return;
  }
  r.completed_at = null;
  const nowMs = Date.now();
  let due = reminderDueAt(r.due_date, r.due_time, r.repeat, r.occurrence);
  if (r.repeat !== "unica") {
    let guard = 0;
    while (due.getTime() <= nowMs && guard++ < 20000) {
      r.occurrence += 1;
      due = reminderDueAt(r.due_date, r.due_time, r.repeat, r.occurrence);
    }
  }
  r.next_due_at = due.toISOString();
  r.next_notify_at = due.getTime() <= nowMs ? null : new Date(Math.max(due.getTime() - r.notify_before_minutes * 60_000, nowMs)).toISOString();
}

const brClock = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString();

/** Na demonstração os lembretes são verificados enquanto o app está aberto (no servidor real: a cada minuto). */
function processDueReminders() {
  const db = load();
  let changed = false;
  for (const r of db.reminders) {
    if (r.status !== "ativo" || !r.next_notify_at || new Date(r.next_notify_at).getTime() > Date.now()) continue;
    if (hasFeature(r.user_id, "lembretes") && r.next_due_at) {
      const due = new Date(r.next_due_at);
      const iso = brClock(due);
      const hm = iso.slice(11, 16);
      const when =
        brDateKey(due) === brDateKey(new Date())
          ? `Hoje às ${hm}`
          : brDateKey(due) === brDateKey(addDays(new Date(), 1))
            ? `Amanhã às ${hm}`
            : `Dia ${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${hm}`;
      const desc = (r.description ?? "").trim().replace(/\.+$/, "");
      const body = `${when}${desc ? ` — ${desc}` : ""}${r.amount != null ? `. Valor: ${formatBRL(r.amount)}` : ""}.`;
      notify(r.user_id, "lembrete", `🔔 Lembrete: ${r.title}`, body, "/app/lembretes", `lembrete-${r.id}-${r.next_due_at}`);
    }
    r.last_notified_at = now();
    if (r.repeat === "unica") r.next_notify_at = null;
    else {
      r.occurrence += 1;
      scheduleReminder(r);
    }
    changed = true;
  }
  if (changed) save();
}

function requireAccess(userId: string) {
  if (!hasAccess(userId)) throw new AppError("ACESSO_BLOQUEADO");
}

const strip = <T extends { user_id: string }>(row: T): Omit<T, "user_id"> => {
  const { user_id: _ignored, ...rest } = row;
  void _ignored;
  return rest;
};

function checkLowStock(p: Owned<Product>) {
  if (p.stock <= p.min_stock) {
    notify(p.user_id, "estoque", `Estoque baixo: ${p.name}`, p.stock === 0 ? "O produto está sem estoque." : `Restam ${p.stock} unidade(s) em estoque.`, "/app/produtos", `estoque-${p.id}-${brDateKey(new Date())}`);
  }
}

function checkBigExpense(t: Owned<Transaction>) {
  if (t.type !== "saida") return;
  const user = load().users.find((u) => u.id === t.user_id);
  if (user && user.expense_alert_threshold > 0 && t.amount >= user.expense_alert_threshold) {
    notify(t.user_id, "despesa", "Despesa importante registrada", `${t.description} — ${formatBRL(t.amount)}`, "/app/entradas-saidas");
  }
}

function subView(s: DemoSub): MySubscription {
  const plan = load().plans.find((p) => p.id === s.plan_id)!;
  return {
    id: s.id,
    plan_id: s.plan_id,
    plan_name: plan?.name ?? s.plan_id,
    status: s.status,
    price: s.price,
    started_at: s.started_at,
    expires_at: s.expires_at,
    billing_period: plan?.billing_period ?? "mensal",
  };
}

// ---------- Vendas de assinaturas (mesmas regras da migração 0005) ----------
function saleView(p: DemoPayment): SubscriptionSaleRow {
  const { idempotency_key: _k, ...rest } = p;
  return { ...rest, plan_name: load().plans.find((x) => x.id === p.plan_id)?.name ?? p.plan_id };
}

function paymentDesc(p: DemoPayment) {
  return `${load().plans.find((x) => x.id === p.plan_id)?.name ?? p.plan_id} · ${formatBRL(p.amount)} · ${p.customer_email || "conta excluída"}`;
}

function newPayment(a: {
  user: DemoUser; plan: Plan; amount: number; method: DemoPayment["method"]; status: PaymentStatus; paid_at: string;
  payment_ref: string | null; notes: string | null; idempotency_key: string | null; customer_name?: string;
}): DemoPayment {
  const p: DemoPayment = {
    id: uid(), user_id: a.user.id, customer_name: a.customer_name ?? a.user.full_name, customer_email: a.user.email, plan_id: a.plan.id,
    amount: a.amount, method: a.method, status: a.status, kind: null, paid_at: a.paid_at, period_end: null, payment_ref: a.payment_ref,
    notes: a.notes, status_reason: null, subscription_id: null, created_at: now(), idempotency_key: a.idempotency_key,
  };
  load().payments.push(p);
  audit("venda_registrada", "pagamento", `Venda registrada (${p.status}): ${paymentDesc(p)}`);
  return p;
}

/** Mesmo plano ativo -> renovação (soma a partir do vencimento). Senão -> ativação (substitui o anterior). */
function applyConfirmedPayment(p: DemoPayment) {
  if (p.kind) return;
  const db = load();
  const plan = db.plans.find((x) => x.id === p.plan_id)!;
  const userId = p.user_id!;
  let sub = db.subscriptions
    .filter((s) => s.user_id === userId && s.plan_id === plan.id && s.status === "ativa" && new Date(s.expires_at) > new Date())
    .sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0];
  let kind: "ativacao" | "renovacao";
  if (sub) {
    kind = "renovacao";
    sub.expires_at = addMonths(new Date(sub.expires_at), plan.duration_months).toISOString();
    sub.price = p.amount;
    if (p.payment_ref) sub.payment_ref = p.payment_ref;
  } else {
    kind = "ativacao";
    db.subscriptions.forEach((s) => {
      if (s.user_id === userId && (s.status === "ativa" || s.status === "suspensa")) {
        s.status = "cancelada";
        logEvent(userId, s.id, s.plan_id, "substituicao", `Encerrada para ativar ${plan.name}`);
      }
    });
    sub = {
      id: uid(), user_id: userId, plan_id: plan.id, status: "ativa", price: p.amount, started_at: now(),
      expires_at: addMonths(new Date(), plan.duration_months).toISOString(), payment_ref: p.payment_ref, notes: p.notes, created_at: now(),
    };
    db.subscriptions.push(sub);
  }
  p.status = "confirmado";
  p.kind = kind;
  p.subscription_id = sub.id;
  p.period_end = sub.expires_at;
  const until = new Date(sub.expires_at).toLocaleDateString("pt-BR");
  logEvent(userId, sub.id, plan.id, kind, `${formatBRL(p.amount)} · pago em ${new Date(p.paid_at).toLocaleDateString("pt-BR")} · válido até ${until}${p.payment_ref ? ` · pagamento ${p.payment_ref}` : ""}`);
  audit(kind === "renovacao" ? "assinatura_renovada" : "assinatura_ativada", "assinatura", `${plan.name} ${kind === "renovacao" ? "renovado" : "ativado"} para ${p.customer_email} até ${until}`);
  notify(userId, "plano", kind === "renovacao" ? "Assinatura renovada" : `${plan.name} ativado!`, `Pagamento confirmado. Seu ${plan.name} está ativo até ${until}.`, "/app/meu-plano");
}

const addMonths = (d: Date, months: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
};

export const demoBackend: Backend = {
  mode: "demo",

  // ---------------- Autenticação ----------------
  async getSessionUser() {
    const db = load();
    const u = db.users.find((x) => x.id === db.session);
    return u ? toSession(u) : null;
  },

  onAuthChange(cb) {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  },

  async signUp({ name, email, password }) {
    await delay(400);
    const db = load();
    if (db.users.some((u) => u.email === email)) throw new AppError("EMAIL_JA_CADASTRADO");
    db.users.push({
      id: uid(),
      email,
      password_hash: await hashPassword(email, password),
      full_name: name,
      business_name: null,
      phone: null,
      expense_alert_threshold: 500,
      verified: false,
      created_at: now(),
    });
    newCode(email, "signup");
    save();
    return { needsVerification: true };
  },

  async verifySignupCode(email, code) {
    await delay(350);
    const db = load();
    const entry = db.codes[email];
    const user = db.users.find((u) => u.email === email);
    if (!user || !entry || entry.kind !== "signup" || entry.code !== code || entry.expires < Date.now()) throw new AppError("CODIGO_INVALIDO");
    user.verified = true;
    await refreshOwnerFlag(user);
    delete db.codes[email];
    db.session = user.id;
    notify(user.id, "sistema", "Bem-vindo ao Estilos Gestor!", "Cadastre seus produtos e registre suas movimentações para acompanhar o seu negócio.", "/app/produtos", "boas-vindas");
    save();
    authListeners.forEach((fn) => fn(toSession(user)));
  },

  async resendSignupCode(email) {
    await delay(300);
    if (!load().users.some((u) => u.email === email)) throw new AppError("USUARIO_NAO_EXISTE");
    newCode(email, "signup");
    save();
  },

  async signIn(email, password) {
    await delay(400);
    const db = load();
    const user = db.users.find((u) => u.email === email);
    if (!user || user.password_hash !== (await hashPassword(email, password))) throw new AppError("CREDENCIAIS_INVALIDAS");
    if (!user.verified) {
      newCode(email, "signup");
      save();
      throw new AppError("EMAIL_NAO_CONFIRMADO");
    }
    await refreshOwnerFlag(user);
    db.session = user.id;
    save();
    authListeners.forEach((fn) => fn(toSession(user)));
  },

  async requestPasswordReset(email) {
    await delay(400);
    // Por segurança, não revela se o e-mail existe
    if (load().users.some((u) => u.email === email)) {
      newCode(email, "recovery");
      save();
    }
  },

  async resetPasswordWithCode(email, code, newPassword) {
    await delay(400);
    const db = load();
    const entry = db.codes[email];
    const user = db.users.find((u) => u.email === email);
    if (!user || !entry || entry.kind !== "recovery" || entry.code !== code || entry.expires < Date.now()) throw new AppError("CODIGO_INVALIDO");
    user.password_hash = await hashPassword(email, newPassword);
    user.verified = true;
    await refreshOwnerFlag(user);
    delete db.codes[email];
    db.session = user.id;
    save();
    authListeners.forEach((fn) => fn(toSession(user)));
  },

  async updatePassword(newPassword) {
    await delay();
    const u = me();
    u.password_hash = await hashPassword(u.email, newPassword);
    save();
  },

  async signOut() {
    const db = load();
    db.session = null;
    save();
    authListeners.forEach((fn) => fn(null));
  },

  async deleteAccount() {
    await delay(300);
    const db = load();
    const id = me().id;
    db.users = db.users.filter((u) => u.id !== id);
    db.products = db.products.filter((r) => r.user_id !== id);
    db.sales = db.sales.filter((r) => r.user_id !== id);
    db.transactions = db.transactions.filter((r) => r.user_id !== id);
    db.notifications = db.notifications.filter((r) => r.user_id !== id);
    db.subscriptions = db.subscriptions.filter((r) => r.user_id !== id);
    // Histórico financeiro da plataforma é preservado (como no banco): só desvincula a conta
    db.payments.forEach((r) => {
      if (r.user_id === id) {
        r.user_id = null;
        r.subscription_id = null;
      }
    });
    db.reminders = db.reminders.filter((r) => r.user_id !== id);
    db.events = db.events.filter((r) => r.user_id !== id);
    delete db.prefs[id];
    db.session = null;
    save();
    authListeners.forEach((fn) => fn(null));
  },

  // ---------------- Conta ----------------
  async getProfile() {
    const u = me();
    return { id: u.id, email: u.email, full_name: u.full_name, business_name: u.business_name, phone: u.phone, expense_alert_threshold: u.expense_alert_threshold } satisfies Profile;
  },

  async updateProfile(patch) {
    await delay();
    const u = me();
    Object.assign(u, patch);
    save();
    authListeners.forEach((fn) => fn(toSession(u)));
  },

  async getMyStatus() {
    const u = me();
    refreshSubscriptions(u.id);
    save();
    const subs = load()
      .subscriptions.filter((s) => s.user_id === u.id)
      .sort((a, b) => Number(b.status === "ativa") - Number(a.status === "ativa") || b.created_at.localeCompare(a.created_at));
    const owner = isOwnerId(u.id);
    return { is_admin: owner, role: owner ? "owner" : "cliente", subscription: subs[0] ? subView(subs[0]) : null, entitlements: entitlements(u.id) };
  },

  async heartbeat() {
    const u = me();
    refreshSubscriptions(u.id);
    const today = brDateKey(new Date());
    const resets = brMidnight(brDateKey(addDays(brMidnight(today), 1))).toISOString();
    processDueReminders();
    const plan = planOf(u.id);
    const limit = dailyLimit(u.id);
    if (limit == null) {
      save();
      return { unlimited: true, remaining_seconds: null, limit_seconds: null, server_now: now(), resets_at: resets, scope: "plano", plan_name: plan?.name ?? null };
    }
    const row = usageRow(u.id);
    const delta = row.last_heartbeat == null ? 0 : Math.min(Math.max((Date.now() - row.last_heartbeat) / 1000, 0), 30);
    row.seconds_used = Math.min(Math.max(limit, row.seconds_used), Math.round(row.seconds_used + delta));
    row.last_heartbeat = Date.now();
    if (row.seconds_used >= limit) {
      if (!plan) {
        notify(u.id, "tempo", "Seu tempo gratuito de hoje terminou!", "Volte amanhã ou escolha um dos nossos planos para continuar utilizando a plataforma.", "/planos", `tempo-${today}`);
      } else {
        const hours = Number.isInteger(limit / 3600) ? String(limit / 3600) : (limit / 3600).toFixed(1).replace(".", ",");
        notify(u.id, "tempo", `Seu limite diário de ${hours} horas terminou`, `O acesso ao ${plan.name} será renovado à meia-noite (horário de Brasília). Para usar sem limite diário, conheça o Plano Avançado.`, "/app/meu-plano", `tempo-${today}`);
      }
    }
    save();
    return { unlimited: false, remaining_seconds: Math.max(0, limit - row.seconds_used), limit_seconds: limit, server_now: now(), resets_at: resets, scope: plan ? "plano" : "gratuito", plan_name: plan?.name ?? null };
  },

  subscribeUsage(cb) {
    usageListeners.add(cb);
    return () => usageListeners.delete(cb);
  },

  async exportMyData() {
    return {
      exported_at: now(),
      profile: await this.getProfile(),
      products: await this.listProducts(),
      sales: await this.listSales(),
      transactions: await this.listTransactions(),
      reminders: await this.listReminders(),
    };
  },

  // ---------------- Público ----------------
  async getPlans() {
    return [...load().plans].sort((a, b) => a.sort_order - b.sort_order);
  },

  async getSettings() {
    return { ...load().settings };
  },

  // ---------------- Produtos ----------------
  async listProducts() {
    await delay(80);
    const id = me().id;
    return load()
      .products.filter((p) => p.user_id === id)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map(strip);
  },

  async createProduct(input) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const p: Owned<Product> = { ...input, id: uid(), user_id: id, created_at: now(), updated_at: now() };
    load().products.push(p);
    checkLowStock(p);
    save();
    return strip(p);
  },

  async updateProduct(pid, input) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const p = load().products.find((x) => x.id === pid && x.user_id === id);
    if (!p) throw new AppError("PRODUTO_NAO_ENCONTRADO");
    const stockChanged = input.stock !== undefined && input.stock !== p.stock;
    Object.assign(p, input, { updated_at: now() });
    if (stockChanged || input.min_stock !== undefined) checkLowStock(p);
    save();
    return strip(p);
  },

  async deleteProduct(pid) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const db = load();
    db.products = db.products.filter((x) => !(x.id === pid && x.user_id === id));
    db.sales.forEach((s) => {
      if (s.product_id === pid) s.product_id = null;
    });
    save();
  },

  async uploadProductImage(image) {
    // Na demonstração a imagem fica no próprio navegador
    return blobToDataUrl(image);
  },

  // ---------------- Vendas ----------------
  async registerSale({ productId, quantity, paymentMethod, idempotencyKey }) {
    await delay(300);
    const id = me().id;
    const db = load();
    const existing = db.sales.find((s) => s.user_id === id && s.idempotency_key === idempotencyKey);
    if (existing) return strip(existing);
    requireAccess(id);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError("QUANTIDADE_INVALIDA");
    const p = db.products.find((x) => x.id === productId && x.user_id === id);
    if (!p) throw new AppError("PRODUTO_NAO_ENCONTRADO");
    if (p.stock < quantity) throw new AppError("ESTOQUE_INSUFICIENTE");
    p.stock -= quantity;
    p.updated_at = now();
    const total = Math.round(p.price * quantity * 100) / 100;
    const sale = {
      id: uid(),
      user_id: id,
      product_id: p.id,
      product_name: p.name,
      quantity,
      unit_price: p.price,
      total,
      payment_method: paymentMethod,
      status: "confirmada" as const,
      created_at: now(),
      canceled_at: null,
      idempotency_key: idempotencyKey,
    };
    db.sales.unshift(sale);
    if (total > 0) {
      db.transactions.push({
        id: uid(),
        user_id: id,
        type: "entrada",
        description: `Venda: ${p.name} (${quantity} un.)`,
        amount: total,
        category: "Vendas",
        occurred_at: sale.created_at,
        notes: null,
        sale_id: sale.id,
        created_at: now(),
      });
    }
    notify(id, "venda", "Venda registrada", `${quantity} × ${p.name} — ${formatBRL(total)}`, "/app/produtos");
    checkLowStock(p);
    save();
    const { idempotency_key: _k, ...rest } = strip(sale);
    void _k;
    return rest;
  },

  async listSales() {
    await delay(80);
    const id = me().id;
    return load()
      .sales.filter((s) => s.user_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => {
        const { idempotency_key: _k, ...rest } = strip(s);
        void _k;
        return rest;
      });
  },

  async cancelSale(saleId) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const db = load();
    const s = db.sales.find((x) => x.id === saleId && x.user_id === id);
    if (!s) throw new AppError("VENDA_NAO_ENCONTRADA");
    if (s.status === "cancelada") return;
    const p = db.products.find((x) => x.id === s.product_id && x.user_id === id);
    if (p) p.stock += s.quantity;
    db.transactions = db.transactions.filter((t) => t.sale_id !== s.id);
    s.status = "cancelada";
    s.canceled_at = now();
    save();
  },

  // ---------------- Entradas e saídas ----------------
  async listTransactions(range) {
    await delay(80);
    const id = me().id;
    return load()
      .transactions.filter((t) => {
        if (t.user_id !== id) return false;
        if (!range) return true;
        const d = new Date(t.occurred_at).getTime();
        return d >= range.from.getTime() && d <= range.to.getTime();
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map(strip);
  },

  async createTransaction(input) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const t: Owned<Transaction> = { ...input, id: uid(), user_id: id, sale_id: null, created_at: now() };
    load().transactions.push(t);
    checkBigExpense(t);
    save();
    return strip(t);
  },

  async updateTransaction(tid, input) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const t = load().transactions.find((x) => x.id === tid && x.user_id === id);
    if (!t || t.sale_id) throw new AppError("ACESSO_NEGADO");
    Object.assign(t, input);
    save();
    return strip(t);
  },

  async deleteTransaction(tid) {
    await delay();
    const id = me().id;
    requireAccess(id);
    const db = load();
    const t = db.transactions.find((x) => x.id === tid && x.user_id === id);
    if (!t || t.sale_id) throw new AppError("ACESSO_NEGADO");
    db.transactions = db.transactions.filter((x) => x.id !== tid);
    save();
  },

  // ---------------- Lembretes ----------------
  async listReminders() {
    await delay(80);
    processDueReminders();
    const id = me().id;
    return load()
      .reminders.filter((r) => r.user_id === id)
      .map(strip);
  },

  async createReminder(input) {
    await delay();
    const id = me().id;
    requireFeature(id, "lembretes");
    const r: Owned<Reminder> = {
      ...input,
      id: uid(),
      user_id: id,
      status: "ativo",
      occurrence: 0,
      next_due_at: null,
      next_notify_at: null,
      last_notified_at: null,
      completed_at: null,
      created_at: now(),
      updated_at: now(),
    };
    scheduleReminder(r);
    load().reminders.push(r);
    save();
    return strip(r);
  },

  async updateReminder(rid, input) {
    await delay();
    const id = me().id;
    requireFeature(id, "lembretes");
    const r = load().reminders.find((x) => x.id === rid && x.user_id === id);
    if (!r) throw new AppError("LEMBRETE_NAO_ENCONTRADO");
    const scheduleChanged = (["due_date", "due_time", "repeat", "notify_before_minutes"] as const).some((k) => input[k] !== undefined && input[k] !== r[k]);
    if (input.due_date !== undefined && input.due_date !== r.due_date) r.occurrence = 0;
    if (input.due_time !== undefined && input.due_time !== r.due_time) r.occurrence = 0;
    if (input.repeat !== undefined && input.repeat !== r.repeat) r.occurrence = 0;
    Object.assign(r, input, { updated_at: now() });
    if (scheduleChanged) scheduleReminder(r);
    save();
    return strip(r);
  },

  async completeReminder(rid) {
    await delay();
    const id = me().id;
    requireFeature(id, "lembretes");
    const r = load().reminders.find((x) => x.id === rid && x.user_id === id);
    if (!r) throw new AppError("LEMBRETE_NAO_ENCONTRADO");
    if (r.repeat === "unica") r.status = "concluido";
    else r.occurrence += 1;
    r.updated_at = now();
    scheduleReminder(r);
    save();
    return strip(r);
  },

  async reopenReminder(rid) {
    await delay();
    const id = me().id;
    requireFeature(id, "lembretes");
    const r = load().reminders.find((x) => x.id === rid && x.user_id === id);
    if (!r) throw new AppError("LEMBRETE_NAO_ENCONTRADO");
    r.status = "ativo";
    r.updated_at = now();
    scheduleReminder(r);
    save();
    return strip(r);
  },

  async deleteReminder(rid) {
    await delay();
    const db = load();
    const id = me().id;
    db.reminders = db.reminders.filter((x) => !(x.id === rid && x.user_id === id));
    save();
  },

  // ---------------- Notificações ----------------
  async listNotifications(limit = 60) {
    processDueReminders();
    const id = me().id;
    return load()
      .notifications.filter((n) => n.user_id === id)
      .slice(0, limit)
      .map((n) => {
        const { dedupe_key: _d, ...rest } = strip(n);
        void _d;
        return rest;
      });
  },

  async markNotificationRead(nid) {
    const n = load().notifications.find((x) => x.id === nid && x.user_id === me().id);
    if (n && !n.read_at) n.read_at = now();
    save();
  },

  async markAllNotificationsRead() {
    const id = me().id;
    load().notifications.forEach((n) => {
      if (n.user_id === id && !n.read_at) n.read_at = now();
    });
    save();
  },

  async deleteNotification(nid) {
    const db = load();
    const id = me().id;
    db.notifications = db.notifications.filter((n) => !(n.id === nid && n.user_id === id));
    save();
  },

  subscribeNotifications(cb) {
    notifListeners.add(cb);
    return () => notifListeners.delete(cb);
  },

  // ---------------- Notificações no aparelho ----------------
  // Sem servidor não existe envio real: a demonstração não simula notificações no aparelho.
  pushAvailable: false,

  async getNotificationPrefs() {
    return { ...DEFAULT_PREFS, ...(load().prefs[me().id] ?? {}) };
  },

  async updateNotificationPrefs(patch) {
    const id = me().id;
    const db = load();
    db.prefs[id] = { ...DEFAULT_PREFS, ...(db.prefs[id] ?? {}), ...patch };
    save();
  },

  async listPushDevices() {
    return [];
  },

  async savePushSubscription() {
    throw new AppError("PUSH_INDISPONIVEL_DEMO");
  },

  async removePushSubscription() {
    return;
  },

  async sendTestPush() {
    throw new AppError("PUSH_INDISPONIVEL_DEMO");
  },

  // ---------------- Administração (somente o proprietário, como na versão publicada) ----------------
  admin: {
    async overview() {
      assertOwner();
      const db = load();
      const monthStart = brMidnight(brDateKey(new Date()).slice(0, 8) + "01").getTime();
      const confirmed = db.payments.filter((p) => p.status === "confirmado");
      return {
        total_users: db.users.length,
        active_subs: db.subscriptions.filter((s) => s.status === "ativa" && new Date(s.expires_at) > new Date() && !isOwnerId(s.user_id)).length,
        expiring_7d: db.subscriptions.filter((s) => s.status === "ativa" && new Date(s.expires_at) > new Date() && new Date(s.expires_at).getTime() <= Date.now() + 7 * 86_400_000).length,
        revenue_month: confirmed.filter((p) => new Date(p.paid_at).getTime() >= monthStart).reduce((a, p) => a + p.amount, 0),
        revenue_total: confirmed.reduce((a, p) => a + p.amount, 0),
      };
    },
    async listUsers(search) {
      assertOwner();
      const db = load();
      const q = (search ?? "").toLowerCase();
      return db.users
        .filter((u) => !q || u.email.includes(q) || u.full_name.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))   // mais recentes primeiro, como no banco
        .map((u) => {
          const sub = db.subscriptions
            .filter((s) => s.user_id === u.id)
            .sort((a, b) => Number(b.status === "ativa") - Number(a.status === "ativa") || b.created_at.localeCompare(a.created_at))[0];
          const plan = sub ? db.plans.find((p) => p.id === sub.plan_id) : null;
          return {
            user_id: u.id,
            email: u.email,
            full_name: u.full_name,
            business_name: u.business_name,
            created_at: u.created_at,
            email_confirmed: u.verified,
            is_admin: isOwnerId(u.id),
            subscription_id: sub?.id ?? null,
            plan_id: sub?.plan_id ?? null,
            plan_name: plan?.name ?? null,
            status: sub?.status ?? null,
            started_at: sub?.started_at ?? null,
            expires_at: sub?.expires_at ?? null,
            price: sub?.price ?? null,
            priority_support: Boolean(sub && sub.status === "ativa" && new Date(sub.expires_at) > new Date() && plan?.priority_support),
          };
        });
    },
    async listSubscriptions(status) {
      assertOwner();
      const db = load();
      return db.subscriptions
        .filter((s) => !status || s.status === status)
        .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
        .map((s): AdminSubscriptionRow => {
          const u = db.users.find((x) => x.id === s.user_id);
          const plan = db.plans.find((p) => p.id === s.plan_id);
          return { ...s, email: u?.email ?? "—", full_name: u?.full_name ?? "", plan_name: plan?.name ?? s.plan_id };
        });
    },
    async listPayments() {
      assertOwner();
      const db = load();
      return db.payments
        .filter((p) => p.status === "confirmado")
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        .map((p) => ({
          id: p.id,
          email: p.customer_email,
          plan_name: db.plans.find((x) => x.id === p.plan_id)?.name ?? p.plan_id,
          amount: p.amount,
          kind: p.kind ?? "ativacao",
          payment_ref: p.payment_ref,
          period_end: p.period_end ?? p.paid_at,
          created_at: p.paid_at,
        }));
    },
    async activatePlan(userId, planId, paymentRef, notes) {
      await delay(300);
      assertOwner();
      const db = load();
      const plan = db.plans.find((p) => p.id === planId);
      const user = db.users.find((u) => u.id === userId);
      if (!plan) throw new AppError("PLANO_NAO_ENCONTRADO");
      if (!user) throw new AppError("USUARIO_NAO_ENCONTRADO");
      const pay = newPayment({ user, plan, amount: plan.price, method: null, status: "confirmado", paid_at: now(), payment_ref: paymentRef || null, notes: notes || null, idempotency_key: null });
      applyConfirmedPayment(pay);
      save();
    },
    async renewSubscription(subId, paymentRef) {
      await delay(300);
      assertOwner();
      const db = load();
      const s = db.subscriptions.find((x) => x.id === subId);
      if (!s) throw new AppError("ASSINATURA_NAO_ENCONTRADA");
      if (s.status === "cancelada") throw new AppError("ASSINATURA_CANCELADA");
      const plan = db.plans.find((p) => p.id === s.plan_id)!;
      const user = db.users.find((u) => u.id === s.user_id)!;
      if (s.status !== "ativa" || new Date(s.expires_at) <= new Date()) {
        s.status = "ativa";
        s.expires_at = new Date(Math.max(new Date(s.expires_at).getTime(), Date.now())).toISOString();
      }
      const pay = newPayment({ user, plan, amount: plan.price, method: null, status: "confirmado", paid_at: now(), payment_ref: paymentRef || null, notes: null, idempotency_key: null });
      applyConfirmedPayment(pay);
      save();
    },
    async setSubscriptionStatus(subId, status) {
      await delay(200);
      assertOwner();
      const db = load();
      const s = db.subscriptions.find((x) => x.id === subId);
      if (!s) throw new AppError("ASSINATURA_NAO_ENCONTRADA");
      if (status === "ativa" && new Date(s.expires_at) <= new Date()) throw new AppError("ASSINATURA_EXPIRADA_USE_RENOVAR");
      if (s.status === status) return;
      logEvent(s.user_id, s.id, s.plan_id, status === "ativa" ? "reativacao" : status === "suspensa" ? "suspensao" : "cancelamento", `Status anterior: ${s.status}`);
      const email = db.users.find((u) => u.id === s.user_id)?.email ?? "?";
      audit(`assinatura_${status}`, "assinatura", `Assinatura ${s.status} → ${status}: ${db.plans.find((p) => p.id === s.plan_id)?.name ?? s.plan_id} · ${email}`);
      s.status = status;
      notify(s.user_id, "plano", status === "ativa" ? "Assinatura reativada" : status === "suspensa" ? "Assinatura suspensa" : "Assinatura cancelada", "Em caso de dúvidas, fale com o suporte.", "/app/meu-plano");
      save();
    },
    async updatePlan(id, patch) {
      await delay(200);
      assertOwner();
      const p = load().plans.find((x) => x.id === id);
      if (!p) throw new AppError("PLANO_NAO_ENCONTRADO");
      const oldPrice = p.price;
      Object.assign(p, patch);
      audit("plano_alterado", "plano", `Plano alterado: ${p.name}${p.price !== oldPrice ? ` · preço ${formatBRL(oldPrice)} → ${formatBRL(p.price)}` : ""}`);
      save();
    },
    async createPlan(input) {
      await delay(200);
      assertOwner();
      const db = load();
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(input.id)) throw new AppError("plans_id_format");
      if (db.plans.some((p) => p.id === input.id)) throw new AppError("plans_pkey");
      db.plans.push({ ...input });
      audit("plano_criado", "plano", `Plano criado: ${input.name} · ${formatBRL(input.price)}`);
      save();
    },
    async userHistory(userId) {
      assertOwner();
      const db = load();
      return db.events
        .filter((e) => e.user_id === userId)
        .map(
          (e): AdminHistoryRow => ({
            id: e.id,
            action: e.action,
            plan_name: db.plans.find((p) => p.id === e.plan_id)?.name ?? e.plan_id,
            details: e.details,
            actor_email: e.actor_email,
            created_at: e.created_at,
          }),
        );
    },
    async updateSettings(patch) {
      await delay(200);
      assertOwner();
      if (patch.instagram_url && !/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/.test(patch.instagram_url)) throw new AppError("instagram_url");
      if (patch.whatsapp_number && !/^[0-9]{10,15}$/.test(patch.whatsapp_number)) throw new AppError("whatsapp_number");
      Object.assign(load().settings, patch);
      audit("configuracoes_alteradas", "configuracoes", "Configurações da plataforma alteradas");
      save();
    },
    async broadcast(title, body) {
      await delay(200);
      assertOwner();
      if (!title.trim() || !body.trim()) throw new AppError("COMUNICADO_VAZIO");
      const db = load();
      const key = `comunicado-${uid()}`;
      db.users.forEach((u) => notify(u.id, "admin", title.trim(), body.trim(), null, key));
      audit("comunicado_enviado", "comunicado", `Comunicado enviado: ${title.trim()}`);
      save();
      return db.users.length;
    },

    // ---------------- Minhas Vendas ----------------
    async salesReport(range) {
      await delay(120);
      assertOwner();
      const db = load();
      const inRange = (iso: string) => (!range.from || iso >= new Date(range.from).toISOString()) && (!range.to || iso <= new Date(range.to).toISOString());
      const pays = db.payments.filter((p) => inRange(new Date(p.paid_at).toISOString()));
      const conf = pays.filter((p) => p.status === "confirmado");
      const sum = (xs: DemoPayment[]) => Math.round(xs.reduce((a, p) => a + p.amount, 0) * 100) / 100;
      const firstPay = new Map<string, string>();
      db.payments
        .filter((p) => p.status === "confirmado" && p.user_id)
        .forEach((p) => {
          const cur = firstPay.get(p.user_id!);
          if (!cur || p.paid_at < cur) firstPay.set(p.user_id!, p.paid_at);
        });
      const fromDay = range.from ? brDateKey(new Date(range.from)) : null;
      const toDay = range.to ? brDateKey(new Date(range.to)) : null;
      const expenses = db.expenses.filter((e) => (!fromDay || e.spent_on >= fromDay) && (!toDay || e.spent_on <= toDay));
      const expensesTotal = Math.round(expenses.reduce((a, e) => a + e.amount, 0) * 100) / 100;
      const received = sum(conf);
      const byPlan = new Map<string, { plan_id: string; plan_name: string; count: number; amount: number }>();
      conf.forEach((p) => {
        const b = byPlan.get(p.plan_id) ?? { plan_id: p.plan_id, plan_name: db.plans.find((x) => x.id === p.plan_id)?.name ?? p.plan_id, count: 0, amount: 0 };
        b.count += 1;
        b.amount = Math.round((b.amount + p.amount) * 100) / 100;
        byPlan.set(p.plan_id, b);
      });
      const report: SalesReport = {
        sales_count: conf.length,
        total_received: received,
        renewals: conf.filter((p) => p.kind === "renovacao").length,
        new_customers: [...firstPay.values()].filter((iso) => inRange(new Date(iso).toISOString())).length,
        pending_count: pays.filter((p) => p.status === "pendente").length,
        pending_amount: sum(pays.filter((p) => p.status === "pendente")),
        refunded_amount: sum(pays.filter((p) => p.status === "estornado")),
        active_subscribers: new Set(db.subscriptions.filter((s) => s.status === "ativa" && new Date(s.expires_at) > new Date() && !isOwnerId(s.user_id)).map((s) => s.user_id)).size,
        expenses_total: expensesTotal,
        net_profit: Math.round((received - expensesTotal) * 100) / 100,
        by_plan: [...byPlan.values()].sort((a, b) => b.amount - a.amount),
      };
      return report;
    },
    async listSubscriptionSales(range) {
      assertOwner();
      const db = load();
      return db.payments
        .filter((p) => (!range.from || p.paid_at >= new Date(range.from).toISOString()) && (!range.to || p.paid_at <= new Date(range.to).toISOString()))
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))
        .map((p) => saleView(p));
    },
    async registerSubscriptionSale(input) {
      await delay(300);
      assertOwner();
      const db = load();
      if (!input.idempotency_key || input.idempotency_key.length < 8) throw new AppError("CHAVE_INVALIDA");
      const again = db.payments.find((p) => p.idempotency_key === input.idempotency_key);
      if (again) return saleView(again);
      if (!["confirmado", "pendente"].includes(input.status)) throw new AppError("STATUS_INVALIDO");
      if (!(input.amount > 0) || input.amount > 100000) throw new AppError("VALOR_INVALIDO");
      const today = brDateKey(new Date());
      const oldest = brDateKey(addDays(new Date(), -366));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paid_on) || input.paid_on > today || input.paid_on < oldest) throw new AppError("DATA_INVALIDA");
      if (!input.method) throw new AppError("FORMA_PAGAMENTO_INVALIDA");
      const plan = db.plans.find((p) => p.id === input.plan_id);
      if (!plan) throw new AppError("PLANO_NAO_ENCONTRADO");
      const user = db.users.find((u) => u.email === input.email.trim().toLowerCase());
      if (!user) throw new AppError("USUARIO_NAO_ENCONTRADO");
      const ref = input.payment_ref?.trim() || null;
      if (ref && db.payments.some((p) => p.payment_ref?.toLowerCase() === ref.toLowerCase() && (p.status === "confirmado" || p.status === "pendente"))) {
        throw new AppError("PAGAMENTO_DUPLICADO");
      }
      const paidAt = input.paid_on === today ? now() : new Date(`${input.paid_on}T12:00:00-03:00`).toISOString();
      const pay = newPayment({
        user, plan, amount: Math.round(input.amount * 100) / 100, method: input.method, status: input.status, paid_at: paidAt,
        payment_ref: ref, notes: input.notes?.trim() || null, idempotency_key: input.idempotency_key, customer_name: input.customer_name.trim() || user.full_name,
      });
      if (input.status === "confirmado") applyConfirmedPayment(pay);
      save();
      return saleView(pay);
    },
    async confirmPayment(id) {
      await delay(250);
      assertOwner();
      const p = load().payments.find((x) => x.id === id);
      if (!p) throw new AppError("PAGAMENTO_NAO_ENCONTRADO");
      if (p.status === "confirmado") return;
      if (p.status !== "pendente") throw new AppError("TRANSICAO_INVALIDA");
      p.status = "confirmado";
      audit("pagamento_confirmado", "pagamento", `Pagamento confirmado: ${paymentDesc(p)}`);
      applyConfirmedPayment(p);
      save();
    },
    async cancelPayment(id, reason) {
      await delay(200);
      assertOwner();
      const p = load().payments.find((x) => x.id === id);
      if (!p) throw new AppError("PAGAMENTO_NAO_ENCONTRADO");
      if (p.status === "cancelado") return;
      if (p.status !== "pendente") throw new AppError("TRANSICAO_INVALIDA");
      p.status = "cancelado";
      p.status_reason = reason?.trim() || null;
      audit("pagamento_cancelado", "pagamento", `Pagamento pendente cancelado: ${paymentDesc(p)}${p.status_reason ? ` · motivo: ${p.status_reason}` : ""}`);
      save();
    },
    async refundPayment(id, reason) {
      await delay(200);
      assertOwner();
      if (!reason.trim()) throw new AppError("MOTIVO_OBRIGATORIO");
      const p = load().payments.find((x) => x.id === id);
      if (!p) throw new AppError("PAGAMENTO_NAO_ENCONTRADO");
      if (p.status === "estornado") return;
      if (p.status !== "confirmado") throw new AppError("TRANSICAO_INVALIDA");
      p.status = "estornado";
      p.status_reason = reason.trim();
      audit("pagamento_estornado", "pagamento", `Pagamento estornado: ${paymentDesc(p)} · motivo: ${p.status_reason}`);
      save();
    },
    async listExpenses(range) {
      assertOwner();
      const fromDay = range.from ? brDateKey(new Date(range.from)) : null;
      const toDay = range.to ? brDateKey(new Date(range.to)) : null;
      return load()
        .expenses.filter((e) => (!fromDay || e.spent_on >= fromDay) && (!toDay || e.spent_on <= toDay))
        .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
    },
    async createExpense(input) {
      await delay(200);
      assertOwner();
      const description = input.description.trim();
      if (description.length < 2 || !(input.amount > 0)) throw new AppError("VALOR_INVALIDO");
      const e: PlatformExpense = { id: uid(), description, category: input.category, amount: Math.round(input.amount * 100) / 100, spent_on: input.spent_on, notes: input.notes?.trim() || null, created_at: now() };
      load().expenses.push(e);
      audit("despesa_registrada", "despesa", `Despesa registrada: ${e.description} · ${formatBRL(e.amount)}`);
      save();
      return e;
    },
    async deleteExpense(id) {
      await delay(150);
      assertOwner();
      const db = load();
      const e = db.expenses.find((x) => x.id === id);
      if (!e) return;
      db.expenses = db.expenses.filter((x) => x.id !== id);
      audit("despesa_excluida", "despesa", `Despesa excluída: ${e.description} · ${formatBRL(e.amount)}`);
      save();
    },
    async listAudit(limit = 200) {
      assertOwner();
      return load().audit.slice(0, limit);
    },
  },

  // ---------------- Ferramentas da demonstração ----------------
  demo: {
    peekCode(email) {
      return load().codes[email.trim().toLowerCase()]?.code ?? null;
    },
    async loadSampleData() {
      const id = me().id;
      const db = load();
      // Apaga somente os dados de negócio deste usuário e gera um conjunto de exemplo
      db.products = db.products.filter((p) => p.user_id !== id);
      db.sales = db.sales.filter((s) => s.user_id !== id);
      db.transactions = db.transactions.filter((t) => t.user_id !== id);

      let seed = 42;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const catalog: Array<[string, string, number, number, number, number]> = [
        ["Camiseta Básica Algodão", "Vestuário", 59.9, 24, 34, 8],
        ["Calça Jeans Slim", "Vestuário", 149.9, 68, 18, 5],
        ["Tênis Casual Branco", "Calçados", 229.9, 110, 9, 4],
        ["Boné Aba Curva", "Acessórios", 49.9, 18, 26, 6],
        ["Mochila Urbana", "Acessórios", 189.9, 85, 4, 5],
        ["Moletom Canguru", "Vestuário", 169.9, 72, 15, 5],
        ["Meia Kit 3 Pares", "Acessórios", 34.9, 12, 2, 6],
        ["Jaqueta Corta-Vento", "Vestuário", 259.9, 120, 7, 3],
      ];
      const products = catalog.map(([name, category, price, cost, stock, min]) => ({
        id: uid(), user_id: id, name, category, price, cost, stock, min_stock: min, image_url: null,
        created_at: addDays(new Date(), -80).toISOString(), updated_at: now(),
      }));
      db.products.push(...products);

      const methods = ["pix", "pix", "credito", "debito", "dinheiro"] as const;
      for (let day = 75; day >= 0; day--) {
        const base = addDays(new Date(), -day);
        const salesToday = Math.floor(rnd() * 4) + (base.getDay() === 6 ? 3 : 1);
        for (let i = 0; i < salesToday; i++) {
          const p = products[Math.floor(rnd() * products.length)];
          const qty = 1 + Math.floor(rnd() * 2);
          const when = new Date(base);
          when.setHours(9 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0);
          if (when > new Date()) continue;
          const total = Math.round(p.price * qty * 100) / 100;
          const saleId = uid();
          db.sales.push({ id: saleId, user_id: id, product_id: p.id, product_name: p.name, quantity: qty, unit_price: p.price, total, payment_method: methods[Math.floor(rnd() * methods.length)], status: "confirmada", created_at: when.toISOString(), canceled_at: null, idempotency_key: uid() });
          db.transactions.push({ id: uid(), user_id: id, type: "entrada", description: `Venda: ${p.name} (${qty} un.)`, amount: total, category: "Vendas", occurred_at: when.toISOString(), notes: null, sale_id: saleId, created_at: when.toISOString() });
        }
        const at = (h: number) => {
          const d = new Date(base);
          d.setHours(h, 0, 0, 0);
          return d.toISOString();
        };
        const add = (type: "entrada" | "saida", description: string, amount: number, category: string, h = 11) => {
          if (new Date(at(h)) > new Date()) return;
          db.transactions.push({ id: uid(), user_id: id, type, description, amount, category, occurred_at: at(h), notes: null, sale_id: null, created_at: at(h) });
        };
        const dom = base.getDate();
        if (dom === 5) add("saida", "Aluguel da loja", 1800, "Aluguel", 10);
        if (dom === 10) add("saida", "Energia e internet", 389.9, "Contas", 14);
        if (dom === 12 || dom === 26) add("saida", "Reposição de estoque", 900 + Math.round(rnd() * 600), "Compra de mercadorias", 15);
        if (dom === 18) add("saida", "Fornecedor de embalagens", 260, "Fornecedores", 16);
        if (rnd() < 0.18) add("saida", "Entregas e motoboy", 25 + Math.round(rnd() * 40), "Transporte", 17);
        if (rnd() < 0.1) add("entrada", "Ajuste e personalização", 80 + Math.round(rnd() * 120), "Serviços", 13);
      }
      save();
    },
    async reset() {
      cache = empty();
      save();
      authListeners.forEach((fn) => fn(null));
    },
  },
};

