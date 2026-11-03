/** Barramento simples para avisar telas que os dados mudaram (sem dependências externas). */
export type Topic = "products" | "sales" | "transactions" | "notifications" | "status" | "settings" | "reminders" | "platform-sales";

type Listener = () => void;
const listeners = new Map<Topic, Set<Listener>>();

export function emit(...topics: Topic[]) {
  for (const t of topics) listeners.get(t)?.forEach((fn) => fn());
}

export function on(topics: Topic[], fn: Listener) {
  for (const t of topics) {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(fn);
  }
  return () => {
    for (const t of topics) listeners.get(t)?.delete(fn);
  };
}
