import { AlarmClock, ArrowLeftRight, BadgeDollarSign, ChartLine, Crown, LayoutDashboard, Package, Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: ReactNode;
  /** Recurso que depende do plano: mostra um cadeado quando não está incluído */
  feature?: "reminders";
}

export const mainNav: NavItem[] = [
  { href: "/app", label: "Visão geral", short: "Início", icon: <LayoutDashboard /> },
  { href: "/app/graficos", label: "Gráficos", icon: <ChartLine /> },
  { href: "/app/produtos", label: "Produtos", icon: <Package /> },
  { href: "/app/entradas-saidas", label: "Entradas e Saídas", short: "Movimentos", icon: <ArrowLeftRight /> },
  { href: "/app/lembretes", label: "Meus Lembretes", short: "Lembretes", icon: <AlarmClock />, feature: "reminders" },
  { href: "/app/meu-plano", label: "Meu plano", icon: <Crown /> },
  { href: "/app/configuracoes", label: "Configurações", icon: <Settings /> },
];

export const adminNav: NavItem = { href: "/admin", label: "Administração", icon: <ShieldCheck /> };

/** Itens exclusivos do proprietário (o servidor também bloqueia qualquer outra conta). */
export const ownerNav: NavItem[] = [{ href: "/admin/vendas", label: "Minhas Vendas", icon: <BadgeDollarSign /> }, adminNav];

export const isActive = (pathname: string, href: string) =>
  href === "/app" || href === "/admin"
    ? pathname === href || pathname === href + "/"
    : pathname === href || pathname.startsWith(href + "/");
