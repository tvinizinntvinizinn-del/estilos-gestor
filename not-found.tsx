import Link from "next/link";
import { EMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="bg-brand-night grid min-h-dvh place-items-center px-6 text-center text-white">
      <div>
        <EMark glow className="mx-auto size-28" />
        <h1 className="mt-6 text-3xl font-extrabold">Página não encontrada</h1>
        <p className="mt-2 text-white/65">O endereço pode ter mudado ou não existe mais.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
