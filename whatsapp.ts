import type { Plan } from "./data/types";
import { formatBRLShort } from "./utils";

/** Mensagem automática personalizada para cada plano. */
export function planWhatsappMessage(plan: Plan, email?: string | null) {
  const period = plan.billing_period === "anual" ? "por ano" : plan.duration_months > 1 ? `a cada ${plan.duration_months} meses` : "por mês";
  let msg = `Olá! Gostaria de contratar o ${plan.name} de ${formatBRLShort(plan.price)} ${period}. Como posso realizar o pagamento?`;
  if (email) msg += ` Meu e-mail de cadastro é ${email}.`;
  return msg;
}

export function whatsappLink(number: string | null | undefined, message: string) {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
