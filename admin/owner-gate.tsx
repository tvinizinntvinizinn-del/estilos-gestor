"use client";

import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useAccess } from "@/lib/hooks/use-access";

/**
 * Mostra o conteúdo só para o proprietário. Isto é só a interface:
 * a proteção real está no banco (cada função administrativa verifica o dono no servidor).
 */
export function OwnerGate({ children }: { children: ReactNode }) {
  const { status, ready } = useAccess();
  if (!ready) return <Skeleton className="h-96" />;
  if (!status?.is_admin) {
    return (
      <Card>
        <EmptyState icon={<ShieldAlert />} title="Acesso restrito" description="Esta área é exclusiva do proprietário da plataforma." />
      </Card>
    );
  }
  return <>{children}</>;
}
