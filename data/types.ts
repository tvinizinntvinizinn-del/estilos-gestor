export type PaymentMethod = "pix" | "dinheiro" | "credito" | "debito" | "boleto" | "outro";
export type TransactionType = "entrada" | "saida";
export type SubscriptionStatus = "ativa" | "suspensa" | "cancelada" | "vencida";
export type NotificationKind = "estoque" | "venda" | "despesa" | "plano" | "tempo" | "admin" | "sistema" | "lembrete";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  business_name: string | null;
  phone: string | null;
  expense_alert_threshold: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_period: "mensal" | "anual";
  duration_months: number;
  features: string[];
  highlight: string | null;
  is_active: boolean;
  sort_order: number;
  /** Limite de uso por dia em segundos. null = ilimitado */
  daily_limit_seconds: number | null;
  /** Notificações no celular e no computador (Web Push) */
  allow_push: boolean;
  /** Aba "Meus Lembretes" */
  allow_reminders: boolean;
  /** Atendimento humano prioritário */
  priority_support: boolean;
  /** Destaque visual no card (ex.: "Mais popular") */
  featured: boolean;
  /** Plano usado para calcular a economia exibida (ex.: anual x mensal) */
  compare_to_plan_id: string | null;
}

export interface AppSettings {
  whatsapp_number: string | null;
  support_email: string | null;
  /** Perfil oficial no Instagram (vazio = botão não aparece) */
  instagram_url: string | null;
  satisfied_clients_value: number;
  satisfied_clients_is_demo: boolean;
  free_daily_seconds: number;
  expiry_notice_days: number;
}

export interface MySubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  price: number;
  started_at: string;
  expires_at: string;
  billing_period: "mensal" | "anual";
}

/** O que o plano vigente libera para o usuário (calculado no servidor). */
export interface Entitlements {
  plan_id: string | null;
  plan_name: string;
  daily_limit_seconds: number | null;
  push: boolean;
  reminders: boolean;
  priority_support: boolean;
}

export interface MyStatus {
  /** true somente para a conta do proprietário (verificado no servidor) */
  is_admin: boolean;
  role: "owner" | "cliente";
  subscription: MySubscription | null;
  entitlements: Entitlements;
}

export interface UsageState {
  unlimited: boolean;
  remaining_seconds: number | null;
  limit_seconds: number | null;
  server_now: string;
  resets_at: string;
  /** "gratuito" | "plano" (plano com limite) | "admin" */
  scope?: "gratuito" | "plano" | "admin";
  plan_name?: string | null;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductInput = Pick<Product, "name" | "category" | "price" | "cost" | "stock" | "min_stock" | "image_url">;

export interface Sale {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  payment_method: PaymentMethod;
  status: "confirmada" | "cancelada";
  created_at: string;
  canceled_at: string | null;
}

export interface SaleInput {
  productId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  category: string;
  occurred_at: string;
  notes: string | null;
  sale_id: string | null;
  created_at: string;
}

export type TransactionInput = Pick<Transaction, "type" | "description" | "amount" | "category" | "occurred_at" | "notes">;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

// ---------- Lembretes (planos Avançado e Completo) ----------
export type ReminderCategory = "pagamento" | "compra" | "outro";
export type ReminderRepeat = "unica" | "diaria" | "semanal" | "mensal";

export interface Reminder {
  id: string;
  title: string;
  description: string | null;
  category: ReminderCategory;
  /** YYYY-MM-DD (horário de Brasília) */
  due_date: string;
  /** HH:MM (horário de Brasília) */
  due_time: string;
  amount: number | null;
  repeat: ReminderRepeat;
  notify_before_minutes: number;
  status: "ativo" | "concluido";
  occurrence: number;
  next_due_at: string | null;
  next_notify_at: string | null;
  last_notified_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReminderInput = Pick<Reminder, "title" | "description" | "category" | "due_date" | "due_time" | "amount" | "repeat" | "notify_before_minutes">;

// ---------- Notificações no aparelho ----------
export interface NotificationPrefs {
  estoque: boolean;
  vendas: boolean;
  despesas: boolean;
  assinatura: boolean;
  lembretes: boolean;
  comunicados: boolean;
  sistema: boolean;
}

export interface PushDevice {
  id: string;
  user_agent: string | null;
  created_at: string;
  last_success_at: string | null;
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

// ---------- Administração ----------
export interface AdminOverview {
  total_users: number;
  active_subs: number;
  expiring_7d: number;
  revenue_month: number;
  revenue_total: number;
}

export interface AdminUserRow {
  user_id: string;
  email: string;
  full_name: string;
  business_name: string | null;
  created_at: string;
  email_confirmed: boolean;
  is_admin: boolean;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  status: SubscriptionStatus | null;
  started_at: string | null;
  expires_at: string | null;
  price: number | null;
  priority_support: boolean;
}

export type HistoryAction = "ativacao" | "renovacao" | "suspensao" | "reativacao" | "cancelamento" | "vencimento" | "substituicao";

export interface AdminHistoryRow {
  id: string;
  action: HistoryAction;
  plan_name: string | null;
  details: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  plan_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  price: number;
  started_at: string;
  expires_at: string;
  payment_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface AdminPaymentRow {
  id: string;
  email: string;
  plan_name: string;
  amount: number;
  kind: "ativacao" | "renovacao";
  payment_ref: string | null;
  period_end: string;
  created_at: string;
}

export type PlanEditable = Pick<
  Plan,
  | "name"
  | "description"
  | "price"
  | "billing_period"
  | "duration_months"
  | "features"
  | "highlight"
  | "is_active"
  | "daily_limit_seconds"
  | "allow_push"
  | "allow_reminders"
  | "priority_support"
  | "featured"
  | "compare_to_plan_id"
>;
export type PlanPatch = Partial<PlanEditable>;
export type PlanCreate = PlanEditable & { id: string; sort_order: number };
export type SettingsPatch = Partial<AppSettings>;

export interface ExportBundle {
  exported_at: string;
  profile: Profile;
  products: Product[];
  sales: Sale[];
  transactions: Transaction[];
  reminders?: Reminder[];
}

// ------------------------------------------------------------------ Minhas Vendas (proprietário)
export type PaymentStatus = "confirmado" | "pendente" | "cancelado" | "estornado";
export type SubscriptionPaymentMethod = "pix" | "dinheiro" | "credito" | "debito" | "transferencia" | "boleto" | "outro";

/** Venda de assinatura = pagamento registrado pelo proprietário */
export interface SubscriptionSaleRow {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  plan_id: string;
  plan_name: string | null;
  amount: number;
  method: SubscriptionPaymentMethod | null;
  status: PaymentStatus;
  kind: "ativacao" | "renovacao" | null;
  paid_at: string;
  period_end: string | null;
  payment_ref: string | null;
  notes: string | null;
  status_reason: string | null;
  subscription_id: string | null;
  created_at: string;
}

export interface RegisterSaleInput {
  email: string;
  customer_name: string;
  plan_id: string;
  amount: number;
  /** AAAA-MM-DD (horário de Brasília) */
  paid_on: string;
  method: SubscriptionPaymentMethod;
  status: "confirmado" | "pendente";
  payment_ref?: string;
  notes?: string;
  /** Gerada ao abrir o formulário: reenviar a mesma operação não duplica a venda */
  idempotency_key: string;
}

export interface SalesReport {
  sales_count: number;
  total_received: number;
  renewals: number;
  new_customers: number;
  pending_count: number;
  pending_amount: number;
  refunded_amount: number;
  active_subscribers: number;
  expenses_total: number;
  net_profit: number;
  by_plan: Array<{ plan_id: string; plan_name: string; count: number; amount: number }>;
}

export type ExpenseCategory = "hospedagem" | "dominio" | "ferramentas" | "marketing" | "impostos" | "outros";

export interface PlatformExpense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  /** AAAA-MM-DD */
  spent_on: string;
  notes: string | null;
  created_at: string;
}

export type PlatformExpenseInput = Pick<PlatformExpense, "description" | "category" | "amount" | "spent_on"> & { notes?: string | null };

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  summary: string;
  actor_email: string | null;
  created_at: string;
}

export interface IsoRange {
  from: string | null;
  to: string | null;
}
