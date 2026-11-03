import { cn } from "@/lib/utils";

/** Ícone do WhatsApp (balão com telefone), em traço, para usar sobre o verde da marca. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5", className)}>
      <path
        d="M3.6 20.4l1.2-4.3A8.6 8.6 0 1 1 8 19.3l-4.4 1.1z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        fill="currentColor"
        d="M9.1 7.6c.2 0 .4 0 .5.4l.7 1.6c.1.2.1.4 0 .6l-.5.7c-.1.2-.1.4 0 .5.6 1.1 1.5 2 2.6 2.6.2.1.4.1.5 0l.7-.6c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5 0 .5-.2 1.2-.7 1.5-.6.4-1.4.5-2.2.2-2.4-.8-4.3-2.7-5.1-5.1-.3-.8-.2-1.6.2-2.2.3-.5.9-.7 1.4-.7h.5z"
      />
    </svg>
  );
}

/** Ícone do Instagram (câmera com cantos arredondados). */
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5", className)}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.3" cy="6.7" r="1.25" fill="currentColor" />
    </svg>
  );
}
