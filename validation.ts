import { z } from "zod";
import { parseMoney } from "./utils";

const money = (label: string, opts: { min?: number; positive?: boolean } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => parseMoney(v))
    .refine((n) => Number.isFinite(n), `Informe ${label} válido`)
    .refine((n) => (opts.positive ? n > 0 : n >= (opts.min ?? 0)), opts.positive ? `${label[0].toUpperCase()}${label.slice(1)} deve ser maior que zero` : `${label[0].toUpperCase()}${label.slice(1)} não pode ser negativo`)
    .refine((n) => n <= 99_999_999, "Valor muito alto");

const intField = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/\D/g, "") || NaN)))
    .refine((n) => Number.isInteger(n) && n >= 0, `Informe ${label} válido`)
    .refine((n) => n <= 1_000_000, "Valor muito alto");

export const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido");

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(72, "Senha muito longa")
  .regex(/[A-Za-z]/, "Inclua pelo menos uma letra")
  .regex(/[0-9]/, "Inclua pelo menos um número");

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
    accept: z.literal(true, { errorMap: () => ({ message: "Aceite os termos para continuar" }) }),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem" });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha"),
});

export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, "Digite o código de 6 dígitos enviado por e-mail");

export const resetSchema = z
  .object({
    code: codeSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem" });

export const productSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do produto").max(120, "Nome muito longo"),
  category: z.string().trim().min(1, "Informe a categoria").max(60, "Categoria muito longa"),
  price: money("o preço de venda"),
  cost: money("o custo"),
  stock: intField("o estoque"),
  min_stock: intField("o estoque mínimo"),
});

export const saleSchema = z.object({
  productId: z.string().min(1, "Selecione o produto"),
  quantity: intField("a quantidade").refine((n) => n >= 1, "A quantidade mínima é 1"),
  paymentMethod: z.enum(["pix", "dinheiro", "credito", "debito", "boleto", "outro"], {
    errorMap: () => ({ message: "Escolha a forma de pagamento" }),
  }),
});

export const transactionSchema = z.object({
  type: z.enum(["entrada", "saida"]),
  description: z.string().trim().min(1, "Informe uma descrição").max(160, "Descrição muito longa"),
  amount: money("o valor", { positive: true }),
  category: z.string().trim().min(1, "Escolha uma categoria").max(60),
  occurred_at: z.string().min(1, "Informe a data"),
  notes: z
    .string()
    .trim()
    .max(500, "Observação muito longa")
    .transform((v) => (v ? v : null)),
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome").max(120),
  business_name: z.string().trim().max(120).transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v || null),
  expense_alert_threshold: money("o limite"),
});

export const planSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(60),
  description: z.string().trim().max(160),
  price: money("o preço"),
  billing_period: z.enum(["mensal", "anual"]),
  duration_months: intField("a duração").refine((n) => n >= 1 && n <= 36, "Entre 1 e 36 meses"),
  features: z.array(z.string().trim().min(1).max(120)).max(20),
  highlight: z.string().trim().max(40).transform((v) => v || null),
  is_active: z.boolean(),
  unlimited: z.boolean(),
  daily_limit_hours: z
    .union([z.string(), z.number()])
    .transform((v) => parseMoney(v))
    .refine((n) => Number.isFinite(n) && n > 0 && n <= 24, "Entre 0,5 e 24 horas"),
  allow_push: z.boolean(),
  allow_reminders: z.boolean(),
  priority_support: z.boolean(),
  featured: z.boolean(),
  compare_to_plan_id: z.string().transform((v) => v || null),
});

export const planIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Use letras minúsculas, números e hífen (ex.: plano-semestral)");

export const reminderSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do lembrete").max(120, "Título muito longo"),
  description: z
    .string()
    .trim()
    .max(500, "Descrição muito longa")
    .transform((v) => (v ? v : null)),
  category: z.enum(["pagamento", "compra", "outro"], { errorMap: () => ({ message: "Escolha a categoria" }) }),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data"),
  due_time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário"),
  amount: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : parseMoney(v)))
    .refine((n) => n === null || (Number.isFinite(n) && n >= 0 && n <= 99_999_999), "Informe um valor válido"),
  repeat: z.enum(["unica", "diaria", "semanal", "mensal"]),
  notify_before_minutes: z.coerce.number().int().min(0).max(10080),
});

export const settingsSchema = z.object({
  whatsapp_number: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || /^\d{10,15}$/.test(v), "Use DDI + DDD + número, ex.: 5511999999999")
    .transform((v) => v || null),
  support_email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "E-mail inválido")
    .transform((v) => v || null),
  satisfied_clients_value: intField("o número"),
  satisfied_clients_is_demo: z.boolean(),
  free_daily_hours: z
    .union([z.string(), z.number()])
    .transform((v) => parseMoney(v))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 24, "Entre 0 e 24 horas"),
  expiry_notice_days: intField("os dias").refine((n) => n >= 1 && n <= 30, "Entre 1 e 30 dias"),
  instagram_url: z
    .string()
    .trim()
    .transform((v) => {
      if (!v) return "";
      // Aceita "@perfil", "instagram.com/perfil" ou o endereço completo
      const handle = v.replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "");
      return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}` : "#invalido";
    })
    .refine((v) => v !== "#invalido", "Informe o perfil, ex.: @seuperfil ou https://www.instagram.com/seuperfil")
    .transform((v) => v || null),
});

const todayBr = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

/** "+ Registrar nova venda" (assinatura paga pelo WhatsApp) */
export const subscriptionSaleSchema = z.object({
  customer_name: z.string().trim().min(2, "Informe o nome do cliente").max(120),
  email: emailSchema,
  plan_id: z.string().min(1, "Escolha o plano"),
  amount: money("o valor pago", { positive: true }).refine((n) => n <= 100_000, "Valor muito alto"),
  paid_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento")
    .refine((d) => d <= todayBr(), "A data não pode ser no futuro"),
  method: z.enum(["pix", "dinheiro", "credito", "debito", "transferencia", "boleto", "outro"], {
    errorMap: () => ({ message: "Escolha a forma de pagamento" }),
  }),
  status: z.enum(["confirmado", "pendente"]),
  payment_ref: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const platformExpenseSchema = z.object({
  description: z.string().trim().min(2, "Descreva a despesa").max(120),
  category: z.enum(["hospedagem", "dominio", "ferramentas", "marketing", "impostos", "outros"]),
  amount: money("o valor", { positive: true }),
  spent_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data")
    .refine((d) => d <= todayBr(), "A data não pode ser no futuro"),
  notes: z.string().trim().max(500).optional(),
});

/** Converte erros do Zod em { campo: mensagem } para exibir nos formulários. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
