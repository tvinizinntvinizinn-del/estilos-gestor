import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl, vapidPublicKey } from "../config";
import { uid } from "../utils";
import type { Backend } from "./backend";
import { AppError } from "./errors";
import type {
  AdminHistoryRow,
  AdminOverview,
  AdminPaymentRow,
  AdminSubscriptionRow,
  AdminUserRow,
  AppNotification,
  AppSettings,
  AuditRow,
  DateRange,
  Entitlements,
  MyStatus,
  NotificationPrefs,
  Plan,
  PlatformExpense,
  Product,
  Profile,
  PushDevice,
  Reminder,
  Sale,
  SalesReport,
  SessionUser,
  SubscriptionSaleRow,
  Transaction,
  UsageState,
} from "./types";

let client: SupabaseClient | null = null;
function sb() {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (error) throw new AppError(error.code ?? "ERRO", error.message);
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

const toSessionUser = (u: User | null | undefined): SessionUser | null =>
  u ? { id: u.id, email: u.email ?? "", name: String(u.user_metadata?.full_name ?? "") } : null;

const mapProduct = (r: Record<string, unknown>): Product => ({
  id: String(r.id),
  name: String(r.name),
  category: String(r.category),
  price: num(r.price),
  cost: num(r.cost),
  stock: num(r.stock),
  min_stock: num(r.min_stock),
  image_url: (r.image_url as string) ?? null,
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

const mapSale = (r: Record<string, unknown>): Sale => ({
  id: String(r.id),
  product_id: (r.product_id as string) ?? null,
  product_name: String(r.product_name),
  quantity: num(r.quantity),
  unit_price: num(r.unit_price),
  total: num(r.total),
  payment_method: r.payment_method as Sale["payment_method"],
  status: r.status as Sale["status"],
  created_at: String(r.created_at),
  canceled_at: (r.canceled_at as string) ?? null,
});

const mapTx = (r: Record<string, unknown>): Transaction => ({
  id: String(r.id),
  type: r.type as Transaction["type"],
  description: String(r.description),
  amount: num(r.amount),
  category: String(r.category),
  occurred_at: String(r.occurred_at),
  notes: (r.notes as string) ?? null,
  sale_id: (r.sale_id as string) ?? null,
  created_at: String(r.created_at),
});

const mapPlan = (r: Record<string, unknown>): Plan => ({
  id: String(r.id),
  name: String(r.name),
  description: String(r.description ?? ""),
  price: num(r.price),
  billing_period: r.billing_period as Plan["billing_period"],
  duration_months: num(r.duration_months),
  features: (r.features as string[]) ?? [],
  highlight: (r.highlight as string) ?? null,
  is_active: Boolean(r.is_active),
  sort_order: num(r.sort_order),
  daily_limit_seconds: r.daily_limit_seconds == null ? null : num(r.daily_limit_seconds),
  allow_push: r.allow_push == null ? true : Boolean(r.allow_push),
  allow_reminders: Boolean(r.allow_reminders),
  priority_support: Boolean(r.priority_support),
  featured: Boolean(r.featured),
  compare_to_plan_id: (r.compare_to_plan_id as string) ?? null,
});

const mapReminder = (r: Record<string, unknown>): Reminder => ({
  id: String(r.id),
  title: String(r.title),
  description: (r.description as string) ?? null,
  category: r.category as Reminder["category"],
  due_date: String(r.due_date),
  due_time: String(r.due_time).slice(0, 5),
  amount: r.amount == null ? null : num(r.amount),
  repeat: r.repeat as Reminder["repeat"],
  notify_before_minutes: num(r.notify_before_minutes),
  status: r.status as Reminder["status"],
  occurrence: num(r.occurrence),
  next_due_at: (r.next_due_at as string) ?? null,
  next_notify_at: (r.next_notify_at as string) ?? null,
  last_notified_at: (r.last_notified_at as string) ?? null,
  completed_at: (r.completed_at as string) ?? null,
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

const DEFAULT_PREFS: NotificationPrefs = {
  estoque: true,
  vendas: true,
  despesas: true,
  assinatura: true,
  lembretes: true,
  comunicados: true,
  sistema: true,
};

async function currentUserId() {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError("NAO_AUTENTICADO");
  return id;
}

/** Busca todas as páginas (o PostgREST limita a 1000 linhas por requisição). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>, map: (r: Record<string, unknown>) => T) {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += page) {
    const { data, error } = await build(from, from + page - 1);
    fail(error);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows.map(map));
    if (rows.length < page) break;
  }
  return out;
}

export const supabaseBackend: Backend = {
  mode: "supabase",

  // ---------------- Autenticação ----------------
  async getSessionUser() {
    const { data } = await sb().auth.getSession();
    return toSessionUser(data.session?.user);
  },

  onAuthChange(cb) {
    const { data } = sb().auth.onAuthStateChange((_event, session) => cb(toSessionUser(session?.user)));
    return () => data.subscription.unsubscribe();
  },

  async signUp({ name, email, password }) {
    const { data, error } = await sb().auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    fail(error);
    // Com "Confirm email" ativo no Supabase, a sessão só existe após o código.
    return { needsVerification: !data.session };
  },

  async verifySignupCode(email, code) {
    let { error } = await sb().auth.verifyOtp({ email, token: code, type: "email" });
    if (error) ({ error } = await sb().auth.verifyOtp({ email, token: code, type: "signup" }));
    fail(error);
  },

  async resendSignupCode(email) {
    const { error } = await sb().auth.resend({ type: "signup", email });
    fail(error);
  },

  async signIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error && /not confirmed/i.test(error.message)) throw new AppError("EMAIL_NAO_CONFIRMADO", error.message);
    fail(error);
  },

  async requestPasswordReset(email) {
    const { error } = await sb().auth.resetPasswordForEmail(email);
    fail(error);
  },

  async resetPasswordWithCode(email, code, newPassword) {
    const { error } = await sb().auth.verifyOtp({ email, token: code, type: "recovery" });
    fail(error);
    const { error: upd } = await sb().auth.updateUser({ password: newPassword });
    fail(upd);
  },

  async updatePassword(newPassword) {
    const { error } = await sb().auth.updateUser({ password: newPassword });
    fail(error);
  },

  async signOut() {
    await sb().auth.signOut();
  },

  async deleteAccount() {
    const { error } = await sb().rpc("delete_my_account");
    fail(error);
    await sb().auth.signOut({ scope: "local" });
  },

  // ---------------- Conta ----------------
  async getProfile() {
    const { data: sess } = await sb().auth.getSession();
    const user = sess.session?.user;
    if (!user) throw new AppError("NAO_AUTENTICADO");
    const { data, error } = await sb()
      .from("profiles")
      .select("id, full_name, business_name, phone, expense_alert_threshold")
      .eq("id", user.id)
      .single();
    fail(error);
    return {
      id: data.id,
      email: user.email ?? "",
      full_name: data.full_name ?? "",
      business_name: data.business_name,
      phone: data.phone,
      expense_alert_threshold: num(data.expense_alert_threshold),
    } satisfies Profile;
  },

  async updateProfile(patch) {
    const id = await currentUserId();
    const { error } = await sb().from("profiles").update(patch).eq("id", id);
    fail(error);
    if (patch.full_name) await sb().auth.updateUser({ data: { full_name: patch.full_name } });
  },

  async getMyStatus() {
    const { data, error } = await sb().rpc("get_my_status");
    fail(error);
    const s = data as MyStatus;
    const e = (s.entitlements ?? {}) as Partial<Entitlements>;
    return {
      is_admin: Boolean(s.is_admin),
      role: s.role === "owner" && s.is_admin ? "owner" : "cliente",
      subscription: s.subscription ? { ...s.subscription, price: num(s.subscription.price) } : null,
      entitlements: {
        plan_id: e.plan_id ?? null,
        plan_name: e.plan_name ?? "Gratuito",
        daily_limit_seconds: e.daily_limit_seconds == null ? null : num(e.daily_limit_seconds),
        push: Boolean(e.push),
        reminders: Boolean(e.reminders),
        priority_support: Boolean(e.priority_support),
      },
    };
  },

  async heartbeat() {
    const { data, error } = await sb().rpc("usage_heartbeat");
    fail(error);
    return data as UsageState;
  },

  subscribeUsage(cb) {
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let cancelled = false;
    currentUserId()
      .then((id) => {
        if (cancelled) return;
        channel = sb()
          .channel(`usage-${id}-${uid()}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "daily_usage", filter: `user_id=eq.${id}` },
            (payload) => {
              const row = payload.new as { seconds_used?: number } | null;
              if (row && typeof row.seconds_used === "number") cb(row.seconds_used);
            },
          )
          .subscribe();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (channel) void sb().removeChannel(channel);
    };
  },

  async exportMyData() {
    const [profile, products, sales, transactions, reminders] = await Promise.all([
      this.getProfile(),
      this.listProducts(),
      this.listSales(),
      this.listTransactions(),
      this.listReminders().catch(() => [] as Reminder[]),
    ]);
    return { exported_at: new Date().toISOString(), profile, products, sales, transactions, reminders };
  },

  // ---------------- Público ----------------
  async getPlans() {
    const { data, error } = await sb().from("plans").select("*").order("sort_order");
    fail(error);
    return (data ?? []).map(mapPlan);
  },

  async getSettings() {
    const { data, error } = await sb().from("app_settings").select("*").eq("id", 1).single();
    fail(error);
    return {
      whatsapp_number: data.whatsapp_number,
      support_email: data.support_email,
      instagram_url: data.instagram_url ?? null,
      satisfied_clients_value: num(data.satisfied_clients_value),
      satisfied_clients_is_demo: Boolean(data.satisfied_clients_is_demo),
      free_daily_seconds: num(data.free_daily_seconds),
      expiry_notice_days: num(data.expiry_notice_days),
    } satisfies AppSettings;
  },

  // ---------------- Produtos ----------------
  async listProducts() {
    return fetchAll((a, b) => sb().from("products").select("*").order("name").range(a, b), mapProduct);
  },

  async createProduct(input) {
    const { data, error } = await sb().from("products").insert(input).select().single();
    fail(error);
    return mapProduct(data);
  },

  async updateProduct(id, input) {
    const { data, error } = await sb().from("products").update(input).eq("id", id).select().single();
    fail(error);
    return mapProduct(data);
  },

  async deleteProduct(id) {
    const { error } = await sb().from("products").delete().eq("id", id);
    fail(error);
  },

  async uploadProductImage(image) {
    const userId = await currentUserId();
    const path = `${userId}/${uid()}.jpg`;
    const { error } = await sb().storage.from("product-images").upload(path, image, {
      contentType: "image/jpeg",
      upsert: false,
    });
    fail(error);
    return sb().storage.from("product-images").getPublicUrl(path).data.publicUrl;
  },

  // ---------------- Vendas ----------------
  async registerSale({ productId, quantity, paymentMethod, idempotencyKey }) {
    const { data, error } = await sb().rpc("register_sale", {
      p_product_id: productId,
      p_quantity: quantity,
      p_payment_method: paymentMethod,
      p_idempotency_key: idempotencyKey,
    });
    fail(error);
    return mapSale(data as Record<string, unknown>);
  },

  async listSales() {
    const { data, error } = await sb().from("sales").select("*").order("created_at", { ascending: false }).limit(300);
    fail(error);
    return (data ?? []).map(mapSale);
  },

  async cancelSale(id) {
    const { error } = await sb().rpc("cancel_sale", { p_sale_id: id });
    fail(error);
  },

  // ---------------- Entradas e saídas ----------------
  async listTransactions(range?: DateRange) {
    return fetchAll((a, b) => {
      let q = sb().from("transactions").select("*").order("occurred_at", { ascending: false });
      if (range) q = q.gte("occurred_at", range.from.toISOString()).lte("occurred_at", range.to.toISOString());
      return q.range(a, b);
    }, mapTx);
  },

  async createTransaction(input) {
    const { data, error } = await sb().from("transactions").insert(input).select().single();
    fail(error);
    return mapTx(data);
  },

  async updateTransaction(id, input) {
    const { data, error } = await sb().from("transactions").update(input).eq("id", id).select().single();
    fail(error);
    return mapTx(data);
  },

  async deleteTransaction(id) {
    const { error } = await sb().from("transactions").delete().eq("id", id);
    fail(error);
  },

  // ---------------- Lembretes ----------------
  async listReminders() {
    const { data, error } = await sb().from("reminders").select("*").order("next_due_at", { ascending: true, nullsFirst: false }).limit(1000);
    fail(error);
    return (data ?? []).map(mapReminder);
  },

  async createReminder(input) {
    const { data, error } = await sb().from("reminders").insert(input).select().single();
    fail(error);
    return mapReminder(data);
  },

  async updateReminder(id, input) {
    const { data, error } = await sb().from("reminders").update(input).eq("id", id).select().single();
    fail(error);
    return mapReminder(data);
  },

  async completeReminder(id) {
    const { data, error } = await sb().rpc("complete_reminder", { p_id: id });
    fail(error);
    return mapReminder(data as Record<string, unknown>);
  },

  async reopenReminder(id) {
    const { data, error } = await sb().from("reminders").update({ status: "ativo" }).eq("id", id).select().single();
    fail(error);
    return mapReminder(data);
  },

  async deleteReminder(id) {
    const { error } = await sb().from("reminders").delete().eq("id", id);
    fail(error);
  },

  // ---------------- Notificações ----------------
  async listNotifications(limit = 60) {
    const { data, error } = await sb()
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    fail(error);
    return (data ?? []) as AppNotification[];
  },

  async markNotificationRead(id) {
    const { error } = await sb().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    fail(error);
  },

  async markAllNotificationsRead() {
    const { error } = await sb()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    fail(error);
  },

  async deleteNotification(id) {
    const { error } = await sb().from("notifications").delete().eq("id", id);
    fail(error);
  },

  subscribeNotifications(cb) {
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let cancelled = false;
    currentUserId()
      .then((id) => {
        if (cancelled) return;
        channel = sb()
          .channel(`notifications-${id}-${uid()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${id}` }, () => cb())
          .subscribe();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (channel) void sb().removeChannel(channel);
    };
  },

  // ---------------- Notificações no aparelho (Web Push) ----------------
  pushAvailable: Boolean(vapidPublicKey),

  async getNotificationPrefs() {
    const { data, error } = await sb().from("notification_preferences").select("*").maybeSingle();
    fail(error);
    if (!data) return { ...DEFAULT_PREFS };
    const out = { ...DEFAULT_PREFS };
    for (const k of Object.keys(DEFAULT_PREFS) as Array<keyof NotificationPrefs>) out[k] = Boolean(data[k]);
    return out;
  },

  async updateNotificationPrefs(patch) {
    const userId = await currentUserId();
    const { data: existing, error: readError } = await sb().from("notification_preferences").select("user_id").maybeSingle();
    fail(readError);
    const { error } = existing
      ? await sb().from("notification_preferences").update(patch).eq("user_id", userId)
      : await sb().from("notification_preferences").insert(patch);
    fail(error);
  },

  async listPushDevices() {
    const { data, error } = await sb().from("push_subscriptions").select("id, user_agent, created_at, last_success_at").order("created_at", { ascending: false });
    fail(error);
    return (data ?? []) as PushDevice[];
  },

  async savePushSubscription(keys, userAgent) {
    const { error } = await sb().rpc("save_push_subscription", {
      p_endpoint: keys.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: userAgent,
    });
    fail(error);
  },

  async removePushSubscription(endpoint) {
    const { error } = await sb().rpc("remove_push_subscription", { p_endpoint: endpoint });
    fail(error);
  },

  async sendTestPush() {
    const { data } = await sb().auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AppError("NAO_AUTENTICADO");
    const res = await fetch("/api/push/test", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as { error?: string; sent?: number };
    if (!res.ok) throw new AppError(body.error ?? "ERRO_PUSH", body.error ?? `HTTP ${res.status}`);
    return { sent: Number(body.sent ?? 0) };
  },

  // ---------------- Administração ----------------
  admin: {
    async overview() {
      const { data, error } = await sb().rpc("admin_overview");
      fail(error);
      const o = data as AdminOverview;
      return { ...o, revenue_month: num(o.revenue_month), revenue_total: num(o.revenue_total) };
    },
    async listUsers(search) {
      const { data, error } = await sb().rpc("admin_list_users", { p_search: search || null });
      fail(error);
      return ((data ?? []) as AdminUserRow[]).map((r) => ({
        ...r,
        started_at: r.started_at ?? null,
        price: r.price == null ? null : num(r.price),
        priority_support: Boolean(r.priority_support),
      }));
    },
    async listSubscriptions(status) {
      const { data, error } = await sb().rpc("admin_list_subscriptions", { p_status: status || null });
      fail(error);
      return ((data ?? []) as AdminSubscriptionRow[]).map((r) => ({ ...r, price: num(r.price) }));
    },
    async listPayments() {
      const { data, error } = await sb().rpc("admin_list_payments");
      fail(error);
      return ((data ?? []) as AdminPaymentRow[]).map((r) => ({ ...r, amount: num(r.amount) }));
    },
    async activatePlan(userId, planId, paymentRef, notes) {
      const { error } = await sb().rpc("admin_activate_plan", {
        p_user_id: userId,
        p_plan_id: planId,
        p_payment_ref: paymentRef || null,
        p_notes: notes || null,
      });
      fail(error);
    },
    async renewSubscription(subscriptionId, paymentRef) {
      const { error } = await sb().rpc("admin_renew_subscription", {
        p_subscription_id: subscriptionId,
        p_payment_ref: paymentRef || null,
      });
      fail(error);
    },
    async setSubscriptionStatus(subscriptionId, status) {
      const { error } = await sb().rpc("admin_set_subscription_status", {
        p_subscription_id: subscriptionId,
        p_status: status,
      });
      fail(error);
    },
    async updatePlan(id, patch) {
      const { error } = await sb().from("plans").update(patch).eq("id", id);
      fail(error);
    },
    async createPlan(input) {
      const { error } = await sb().from("plans").insert(input);
      fail(error);
    },
    async userHistory(userId) {
      const { data, error } = await sb().rpc("admin_user_history", { p_user_id: userId });
      fail(error);
      return (data ?? []) as AdminHistoryRow[];
    },
    async updateSettings(patch) {
      const { error } = await sb().from("app_settings").update(patch).eq("id", 1);
      fail(error);
    },
    async broadcast(title, body) {
      const { data, error } = await sb().rpc("admin_broadcast", { p_title: title, p_body: body });
      fail(error);
      return Number(data ?? 0);
    },

    // ---------------- Minhas Vendas (proprietário) ----------------
    async salesReport(range) {
      const { data, error } = await sb().rpc("admin_sales_report", { p_from: range.from, p_to: range.to });
      fail(error);
      const r = data as SalesReport;
      return {
        sales_count: num(r.sales_count),
        total_received: num(r.total_received),
        renewals: num(r.renewals),
        new_customers: num(r.new_customers),
        pending_count: num(r.pending_count),
        pending_amount: num(r.pending_amount),
        refunded_amount: num(r.refunded_amount),
        active_subscribers: num(r.active_subscribers),
        expenses_total: num(r.expenses_total),
        net_profit: num(r.net_profit),
        by_plan: (r.by_plan ?? []).map((p) => ({ ...p, count: num(p.count), amount: num(p.amount) })),
      };
    },
    async listSubscriptionSales(range) {
      const { data, error } = await sb().rpc("admin_list_subscription_sales", { p_from: range.from, p_to: range.to });
      fail(error);
      return ((data ?? []) as SubscriptionSaleRow[]).map(saleRow);
    },
    async registerSubscriptionSale(input) {
      const { data, error } = await sb().rpc("admin_register_subscription_sale", {
        p_email: input.email.trim(),
        p_customer_name: input.customer_name.trim(),
        p_plan_id: input.plan_id,
        p_amount: input.amount,
        p_paid_on: input.paid_on,
        p_method: input.method,
        p_status: input.status,
        p_payment_ref: input.payment_ref?.trim() || null,
        p_notes: input.notes?.trim() || null,
        p_idempotency_key: input.idempotency_key,
      });
      fail(error);
      return saleRow(data as SubscriptionSaleRow);
    },
    async confirmPayment(id) {
      const { error } = await sb().rpc("admin_confirm_payment", { p_payment_id: id });
      fail(error);
    },
    async cancelPayment(id, reason) {
      const { error } = await sb().rpc("admin_cancel_payment", { p_payment_id: id, p_reason: reason?.trim() || null });
      fail(error);
    },
    async refundPayment(id, reason) {
      const { error } = await sb().rpc("admin_refund_payment", { p_payment_id: id, p_reason: reason });
      fail(error);
    },
    async listExpenses(range) {
      let q = sb().from("platform_expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false });
      if (range.from) q = q.gte("spent_on", isoToBrDay(range.from));
      if (range.to) q = q.lte("spent_on", isoToBrDay(range.to));
      const { data, error } = await q.limit(2000);
      fail(error);
      return ((data ?? []) as PlatformExpense[]).map((e) => ({ ...e, amount: num(e.amount) }));
    },
    async createExpense(input) {
      const { data, error } = await sb()
        .from("platform_expenses")
        .insert({ ...input, description: input.description.trim(), notes: input.notes?.trim() || null })
        .select("*")
        .single();
      fail(error);
      return { ...(data as PlatformExpense), amount: num((data as PlatformExpense).amount) };
    },
    async deleteExpense(id) {
      const { error } = await sb().from("platform_expenses").delete().eq("id", id);
      fail(error);
    },
    async listAudit(limit = 200) {
      const { data, error } = await sb()
        .from("admin_audit_log")
        .select("id, action, entity, summary, actor_email, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      fail(error);
      return (data ?? []) as AuditRow[];
    },
  },
};

function saleRow(r: SubscriptionSaleRow): SubscriptionSaleRow {
  return { ...r, amount: num(r.amount) };
}

/** Data (AAAA-MM-DD) no horário de Brasília de um instante ISO */
function isoToBrDay(iso: string) {
  return new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}
