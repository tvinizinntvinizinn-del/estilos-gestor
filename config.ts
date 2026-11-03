/**
 * Configuração central da plataforma.
 * Valores sensíveis ou que mudam por ambiente vêm de variáveis NEXT_PUBLIC_*.
 * WhatsApp, e-mail de suporte e preços também podem ser alterados no painel administrativo.
 */
export const siteConfig = {
  name: "Estilos Gestor",
  tagline: "Gestão financeira e de negócios",
  description:
    "Produtos, vendas, entradas, saídas e gráficos financeiros do seu negócio em um só lugar.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  /** WhatsApp oficial (+55 11 95931-1513). O painel administrativo pode trocar. */
  whatsappNumber: "5511959311513",
  /**
   * Imagem de destaque do dashboard (ex.: a foto da referência).
   * Coloque o arquivo em /public/hero/ e informe o caminho aqui, ex.: "/hero/destaque.png".
   * Use somente imagens com direito de uso. Enquanto for null, o "E" da marca aparece no lugar.
   */
  heroImage: null as string | null,
  timeZone: "America/Sao_Paulo",
} as const;

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Chave PÚBLICA das notificações push (a privada fica só no servidor). */
export const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Sem Supabase configurado, o app roda em modo demonstração (dados só no navegador). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Intervalo dos pulsos do contador diário (o servidor aceita no máximo 30s por pulso). */
export const HEARTBEAT_MS = 20_000;

/** Sem mexer no app por este tempo (mouse, teclado, toque), o contador pausa: só conta uso ativo. */
export const IDLE_MS = 5 * 60_000;

export const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "debito", label: "Cartão de débito" },
  { value: "boleto", label: "Boleto" },
  { value: "outro", label: "Outro" },
] as const;

export const REMINDER_CATEGORIES = [
  { value: "pagamento", label: "Pagamento" },
  { value: "compra", label: "Compra" },
  { value: "outro", label: "Outro" },
] as const;

export const REMINDER_REPEATS = [
  { value: "unica", label: "Uma vez" },
  { value: "diaria", label: "Todo dia" },
  { value: "semanal", label: "Toda semana" },
  { value: "mensal", label: "Todo mês" },
] as const;

export const REMINDER_ADVANCE = [
  { value: 0, label: "No horário" },
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
  { value: 2880, label: "2 dias antes" },
  { value: 10080, label: "1 semana antes" },
] as const;

export const INCOME_CATEGORIES = ["Vendas", "Serviços", "Recebimentos", "Outras receitas"] as const;
export const EXPENSE_CATEGORIES = [
  "Compra de mercadorias",
  "Fornecedores",
  "Aluguel",
  "Transporte",
  "Contas",
  "Outras despesas",
] as const;
