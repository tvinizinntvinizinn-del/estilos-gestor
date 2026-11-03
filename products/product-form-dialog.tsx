"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { backend, friendlyError, type Product } from "@/lib/data";
import { emit } from "@/lib/events";
import { useAccess } from "@/lib/hooks/use-access";
import { compressImage, moneyToInput, parseMoney, formatBRL } from "@/lib/utils";
import { fieldErrors, productSchema } from "@/lib/validation";

const emptyForm = { name: "", category: "", price: "", cost: "", stock: "0", min_stock: "5" };

export function ProductFormDialog({
  open,
  onClose,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
  categories: string[];
}) {
  const toast = useToast();
  const { ensureAccess } = useAccess();
  const [form, setForm] = useState(emptyForm);
  const [image, setImage] = useState<{ preview: string; blob?: Blob } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (product) {
      setForm({
        name: product.name,
        category: product.category,
        price: moneyToInput(product.price),
        cost: moneyToInput(product.cost),
        stock: String(product.stock),
        min_stock: String(product.min_stock),
      });
      setImage(product.image_url ? { preview: product.image_url } : null);
    } else {
      setForm(emptyForm);
      setImage(null);
    }
  }, [open, product]);

  const pickImage = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Arquivo inválido", "Escolha uma imagem (JPG, PNG ou WEBP).");
    try {
      const blob = await compressImage(file, backend.mode === "demo" ? 420 : 800);
      setImage({ preview: URL.createObjectURL(blob), blob });
    } catch (e) {
      toast.error("Não foi possível usar a imagem", friendlyError(e));
    }
  };

  const price = parseMoney(form.price);
  const cost = parseMoney(form.cost);
  const margin = Number.isFinite(price) && Number.isFinite(cost) && price > 0 ? ((price - cost) / price) * 100 : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      await ensureAccess();
      let image_url = image ? (image.blob ? null : image.preview) : null;
      if (image?.blob) image_url = await backend.uploadProductImage(image.blob);
      const payload = { ...parsed.data, image_url };
      if (product) await backend.updateProduct(product.id, payload);
      else await backend.createProduct(payload);
      emit("products");
      toast.success(product ? "Produto atualizado" : "Produto cadastrado", parsed.data.name);
      onClose();
    } catch (err) {
      toast.error("Não foi possível salvar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title={product ? "Editar produto" : "Novo produto"}
      description="O cadastro do produto não altera os gráficos financeiros. Eles mudam apenas com vendas e movimentações."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="product-form" loading={saving}>
            {product ? "Salvar alterações" : "Cadastrar produto"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface text-muted transition hover:border-brand-400 hover:text-brand-600"
            aria-label="Adicionar imagem do produto"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                <ImagePlus className="size-6" /> Imagem
              </span>
            )}
          </button>
          <div className="text-sm text-muted">
            <p>Foto do produto (opcional).</p>
            <p className="text-xs">A imagem é reduzida automaticamente antes do envio.</p>
            {image && (
              <button type="button" onClick={() => setImage(null)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-expense">
                <Trash2 className="size-3.5" /> Remover imagem
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} />
        </div>

        <Field label="Nome do produto" error={errors.name}>
          {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Camiseta básica preta" />}
        </Field>
        <Field label="Categoria" error={errors.category}>
          {(p) => (
            <>
              <Input {...p} list="product-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Vestuário" />
              <datalist id="product-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço de venda (R$)" error={errors.price}>
            {(p) => <Input {...p} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0,00" />}
          </Field>
          <Field label="Custo (R$)" error={errors.cost}>
            {(p) => <Input {...p} inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0,00" />}
          </Field>
        </div>
        {margin !== null && (
          <p className="-mt-1 text-[13px] text-muted">
            Lucro por unidade: <strong className="text-ink">{formatBRL(price - cost)}</strong> ({margin.toFixed(0)}% de margem)
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade em estoque" error={errors.stock}>
            {(p) => <Input {...p} inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} />}
          </Field>
          <Field label="Avisar com estoque até" error={errors.min_stock} hint="Alerta de estoque baixo">
            {(p) => <Input {...p} inputMode="numeric" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value.replace(/\D/g, "") })} />}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
