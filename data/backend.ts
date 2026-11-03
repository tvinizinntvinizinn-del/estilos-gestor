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
  ExportBundle,
  MyStatus,
  NotificationPrefs,
  IsoRange,
  Plan,
  PlanCreate,
  PlatformExpense,
  PlatformExpenseInput,
  PlanPatch,
  Product,
  ProductInput,
  Profile,
  PushDevice,
  RegisterSaleInput,
  PushKeys,
  Reminder,
  ReminderInput,
  Sale,
  SaleInput,
  SalesReport,
  SessionUser,
  SettingsPatch,
  SubscriptionSaleRow,
  SubscriptionStatus,
  Transaction,
  TransactionInput,
  UsageState,
} from "./types";

/**
 * Contrato único de dados. Há duas implementações:
 *  - SupabaseBackend: produção (Auth, PostgreSQL com RLS, Storage, Realtime)
 *  - DemoBackend: demonstração local, usada quando o Supabase não está configurado
 */
export interface Backend {
  readonly mode: "supabase" | "demo";

  // Autenticação
  getSessionUser(): Promise<SessionUser | null>;
  onAuthChange(cb: (user: SessionUser | null) => void): () => void;
  signUp(input: { name: string; email: string; password: string }): Promise<{ needsVerification: boolean }>;
  verifySignupCode(email: string, code: string): Promise<void>;
  resendSignupCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;

  // Conta
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, "id" | "email">>): Promise<void>;
  getMyStatus(): Promise<MyStatus>;
  heartbeat(): Promise<UsageState>;
  /** Avisa quando outro aparelho atualiza o uso diário (segundos usados hoje). */
  subscribeUsage(cb: (secondsUsed: number) => void): () => void;
  exportMyData(): Promise<ExportBundle>;

  // Público
  getPlans(): Promise<Plan[]>;
  getSettings(): Promise<AppSettings>;

  // Produtos
  listProducts(): Promise<Product[]>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: Partial<ProductInput>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  uploadProductImage(image: Blob): Promise<string>;

  // Vendas
  registerSale(input: SaleInput): Promise<Sale>;
  listSales(): Promise<Sale[]>;
  cancelSale(id: string): Promise<void>;

  // Entradas e saídas
  listTransactions(range?: DateRange): Promise<Transaction[]>;
  createTransaction(input: TransactionInput): Promise<Transaction>;
  updateTransaction(id: string, input: Partial<TransactionInput>): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;

  // Lembretes (Plano Avançado e Completo — permissão verificada no banco)
  listReminders(): Promise<Reminder[]>;
  createReminder(input: ReminderInput): Promise<Reminder>;
  updateReminder(id: string, input: Partial<ReminderInput>): Promise<Reminder>;
  /** Único: conclui. Repetido: conclui a ocorrência atual e agenda a próxima. */
  completeReminder(id: string): Promise<Reminder>;
  reopenReminder(id: string): Promise<Reminder>;
  deleteReminder(id: string): Promise<void>;

  // Notificações
  listNotifications(limit?: number): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  subscribeNotifications(cb: () => void): () => void;

  // Notificações no celular e no computador (Web Push)
  /** false quando o envio real não está disponível (demonstração ou chave VAPID ausente) */
  readonly pushAvailable: boolean;
  getNotificationPrefs(): Promise<NotificationPrefs>;
  updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void>;
  listPushDevices(): Promise<PushDevice[]>;
  savePushSubscription(keys: PushKeys, userAgent: string): Promise<void>;
  removePushSubscription(endpoint: string): Promise<void>;
  /** Envia uma notificação real de teste para os aparelhos do próprio usuário */
  sendTestPush(): Promise<{ sent: number }>;

  // Administração (autorização verificada no servidor)
  admin: {
    overview(): Promise<AdminOverview>;
    listUsers(search?: string): Promise<AdminUserRow[]>;
    listSubscriptions(status?: SubscriptionStatus | ""): Promise<AdminSubscriptionRow[]>;
    listPayments(): Promise<AdminPaymentRow[]>;
    activatePlan(userId: string, planId: string, paymentRef?: string, notes?: string): Promise<void>;
    renewSubscription(subscriptionId: string, paymentRef?: string): Promise<void>;
    setSubscriptionStatus(subscriptionId: string, status: "ativa" | "suspensa" | "cancelada"): Promise<void>;
    updatePlan(id: string, patch: PlanPatch): Promise<void>;
    /** Cria um plano. Não ativa nada para nenhum cliente. */
    createPlan(input: PlanCreate): Promise<void>;
    userHistory(userId: string): Promise<AdminHistoryRow[]>;
    updateSettings(patch: SettingsPatch): Promise<void>;
    broadcast(title: string, body: string): Promise<number>;

    // Minhas Vendas (somente o proprietário; verificado no banco)
    salesReport(range: IsoRange): Promise<SalesReport>;
    listSubscriptionSales(range: IsoRange): Promise<SubscriptionSaleRow[]>;
    /** Registra o pagamento; se confirmado, libera o plano e calcula o vencimento */
    registerSubscriptionSale(input: RegisterSaleInput): Promise<SubscriptionSaleRow>;
    confirmPayment(id: string): Promise<void>;
    cancelPayment(id: string, reason?: string): Promise<void>;
    refundPayment(id: string, reason: string): Promise<void>;
    listExpenses(range: IsoRange): Promise<PlatformExpense[]>;
    createExpense(input: PlatformExpenseInput): Promise<PlatformExpense>;
    deleteExpense(id: string): Promise<void>;
    listAudit(limit?: number): Promise<AuditRow[]>;
  };

  // Somente no modo demonstração
  demo?: {
    peekCode(email: string): string | null;
    loadSampleData(): Promise<void>;
    reset(): Promise<void>;
  };
}
