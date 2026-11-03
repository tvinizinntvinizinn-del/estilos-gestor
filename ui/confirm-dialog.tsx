"use client";

import { TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Input } from "./input";

/** Confirmação obrigatória para operações destrutivas. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  danger = true,
  typeToConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Exige digitar uma palavra (ex.: "EXCLUIR") antes de liberar o botão. */
  typeToConfirm?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const locked = typeToConfirm ? typed.trim().toUpperCase() !== typeToConfirm : false;

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setTyped("");
      onClose();
    } catch {
      // o chamador já mostrou o erro; a janela continua aberta
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !loading && onClose()}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={handle} loading={loading} disabled={locked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 pt-2">
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${danger ? "bg-expense-soft text-expense" : "bg-brand-50 text-brand-600"}`}>
          <TriangleAlert className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
          {typeToConfirm && (
            <div className="mt-4">
              <p className="mb-2 text-sm">
                Digite <strong>{typeToConfirm}</strong> para confirmar:
              </p>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
