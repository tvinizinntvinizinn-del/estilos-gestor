/**
 * Envio da fila de notificações push (executado a cada minuto pelo agendamento).
 * A lógica não depende do Supabase diretamente: recebe as operações do banco
 * por parâmetro, o que permite testá-la de ponta a ponta.
 */
import type { PushTarget, SendOptions, SendResult } from "./web-push";

if (typeof window !== "undefined") {
  throw new Error("lib/server/push-dispatch só pode ser usado no servidor.");
}

export interface QueuedNotification {
  notification_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
  subscriptions: PushTarget[];
}

export type FinishStatus = "enviada" | "sem_destino" | "falhou" | "pendente";

export interface DispatchDeps {
  processReminders(): Promise<number>;
  claim(limit: number): Promise<QueuedNotification[]>;
  finish(notificationId: string, status: FinishStatus): Promise<void>;
  subscriptionResult(endpoint: string, ok: boolean, gone: boolean): Promise<void>;
  send(target: PushTarget, payload: string, opts: SendOptions): Promise<SendResult>;
}

export interface DispatchSummary {
  reminders: number;
  notifications: number;
  delivered: number;
  devices_ok: number;
  devices_removed: number;
  devices_failed: number;
}

const URGENT_KINDS = new Set(["lembrete", "plano", "tempo"]);

/** Conteúdo que o service worker recebe (sem dados financeiros além do texto do próprio aviso). */
export function buildPushPayload(n: Pick<QueuedNotification, "notification_id" | "kind" | "title" | "body" | "link">) {
  return JSON.stringify({
    title: n.title.slice(0, 120),
    body: n.body.slice(0, 400),
    url: n.link && n.link.startsWith("/") ? n.link : "/app",
    tag: `eg-${n.notification_id}`,
    kind: n.kind,
  });
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

export async function runDispatch(deps: DispatchDeps, opts: { batchSize?: number; maxBatches?: number; concurrency?: number } = {}): Promise<DispatchSummary> {
  const summary: DispatchSummary = { reminders: 0, notifications: 0, delivered: 0, devices_ok: 0, devices_removed: 0, devices_failed: 0 };

  // 1) Lembretes que chegaram no horário viram notificações (o banco evita duplicidade)
  summary.reminders = await deps.processReminders();

  // 2) Envia a fila em lotes
  for (let batch = 0; batch < (opts.maxBatches ?? 5); batch++) {
    const queue = await deps.claim(opts.batchSize ?? 100);
    if (!queue.length) break;
    summary.notifications += queue.length;

    await mapLimit(queue, opts.concurrency ?? 8, async (n) => {
      const targets = Array.isArray(n.subscriptions) ? n.subscriptions : [];
      if (!targets.length) {
        await deps.finish(n.notification_id, "sem_destino");
        return;
      }
      const payload = buildPushPayload(n);
      let anyOk = false;
      let anyRetry = false;
      for (const t of targets) {
        const r = await deps.send(t, payload, {
          urgency: URGENT_KINDS.has(n.kind) ? "high" : "normal",
          ttlSeconds: n.kind === "lembrete" ? 6 * 3600 : 24 * 3600,
        });
        if (r.ok) {
          anyOk = true;
          summary.devices_ok++;
        } else if (r.gone) {
          summary.devices_removed++;
        } else {
          summary.devices_failed++;
          if (r.retry) anyRetry = true;
        }
        await deps.subscriptionResult(t.endpoint, r.ok, r.gone);
      }
      if (anyOk) summary.delivered++;
      await deps.finish(n.notification_id, anyOk ? "enviada" : anyRetry ? "pendente" : "falhou");
    });

    if (queue.length < (opts.batchSize ?? 100)) break;
  }
  return summary;
}
