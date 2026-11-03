"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_METHODS } from "@/lib/config";
import { backend, friendlyError, type PaymentMethod, type Product } from "@/lib/data";
import { emit } from "@/lib/events";
import { useAccess } from "@/lib/hooks/use-access";
import { cn, formatBRL, uid } from "@/lib/utils";
import { fieldErrors, saleSchema } from "@/lib/validation";

/**
 * Registro de venda. A chave de idempotência é criada quando a janela abre e
 * reaproveitada em novas tentativas: clique duplo ou rede instável não duplicam a venda.
 */
export function SaleDialog({
  open,
  onClose,
  products,
  initialProductId,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  initialProductId?: string | null;
}) {
  const toast = useToast();
  const { ensureAccess } = useAccess();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const idemKey = useRef(uid());

  // Reinicia só quando o diálogo abre (recarregar a lista de produtos não apaga o que foi escolhido).
  useEffect(() => {
    if (!open) return;
    idemKey.current = uid();
    setProductId(initialProductId ?? "");
    setQuantity(1);
    setMethod("");
    setErrors({});
  }, [open, initialProductId]);
  useEffect(() => {
    if (open && !productId) {
      const first = products.find((p) => p.stock > 0)?.id;
      if (first) setProductId(first);
    }
  }, [open, productId, products]);

  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const total = product ? Math.round(product.price * quantity * 100) / 100 : 0;
  const overStock = product ? quantity > product.stock : false;

  const submit = async () => {
    const parsed = saleSchema.safeParse({ productId, quantity, paymentMethod: method });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (overStock) return setErrors({ quantity: `Estoque disponível: ${product?.stock ?? 0}` });
    setErrors({});
    setSaving(true);
    try {
      await ensureAccess();
      await backend.registerSale({
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        paymentMethod: parsed.data.paymentMethod,
        idempotencyKey: idemKey.current,
      });
      emit("sales", "products", "transactions", "notifications");
      toast.success("Venda registrada!", `${quantity} × ${product?.name} — ${formatBRL(total)}`);
      onClose();
    } catch (err) {
      toast.error("Venda não registrada", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title="Registrar venda"
      description="O estoque, as entradas e os gráficos são atualizados automaticamente."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="success" onClick={submit} loading={saving} disabled={!product || overStock}>
            Confirmar venda · {formatBRL(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Produto" error={errors.productId}>
          {(p) => (
            <Select {...p} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione…</option>
              {products.map((x) => (
                <option key={x.id} value={x.id} disabled={x.stock === 0}>
                  {x.name} — {formatBRL(x.price)} ({x.stock === 0 ? "sem estoque" : `${x.stock} em estoque`})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium">Quantidade</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl ring-1 ring-line">
              <button
                type="button"
                className="grid size-11 place-items-center text-ink disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Diminuir quantidade"
              >
                <Minus className="size-4" />
              </button>
              <input
                value={quantity}
                inputMode="numeric"
                aria-label="Quantidade"
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))}
                className="h-11 w-16 border-x border-line text-center text-lg font-bold tabular-nums focus:outline-none"
              />
              <button
                type="button"
                className="grid size-11 place-items-center text-ink disabled:opacity-40"
                onClick={() => setQuantity((q) => q + 1)}
                disabled={product ? quantity >= product.stock : true}
                aria-label="Aumentar quantidade"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {product && <p className={cn("text-sm", overStock ? "font-semibold text-expense" : "text-muted")}>Disponível: {product.stock}</p>}
          </div>
          {errors.quantity && <p className="mt-1.5 text-[13px] font-medium text-expense">{errors.quantity}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition",
                  method === m.value ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-ink ring-line hover:ring-brand-300",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {errors.paymentMethod && <p className="mt-1.5 text-[13px] font-medium text-expense">{errors.paymentMethod}</p>}
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
          <span className="text-sm text-muted">
            Valor total{product ? ` (${quantity} × ${formatBRL(product.price)})` : ""}
          </span>
          <span className="text-xl font-extrabold tabular-nums text-ink">{formatBRL(total)}</span>
        </div>
      </div>
    </Dialog>
  );
}
