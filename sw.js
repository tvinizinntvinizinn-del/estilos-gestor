/* Estilos Gestor — service worker simples (PWA instalável + funcionamento básico offline).
   Dados financeiros NUNCA são guardados em cache: chamadas ao Supabase vão sempre para a rede. */
const VERSION = "eg-v2";
const SHELL = ["/", "/app", "/entrar", "/brand/logo-e.png", "/brand/logo-e-sm.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Páginas: rede primeiro, cache como reserva
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/app").then((a) => a || caches.match("/")))),
    );
    return;
  }

  // Arquivos estáticos do Next e imagens da marca: cache primeiro
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});

// ---------------- Notificações push (Web Push) ----------------
// A mensagem chega criptografada do servidor do Estilos Gestor e só este navegador consegue lê-la.
self.addEventListener("push", (event) => {
  let data = { title: "Estilos Gestor", body: "Você tem um novo aviso.", url: "/app", tag: undefined, kind: "sistema" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (__) {
      /* sem conteúdo */
    }
  }
  const urgent = data.kind === "lembrete" || data.kind === "plano" || data.kind === "tempo";
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: data.kind === "lembrete",
      vibrate: urgent ? [120, 60, 120] : undefined,
      timestamp: Date.now(),
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/app" },
    }),
  );
});

// Toque na notificação: reaproveita uma aba aberta do app ou abre uma nova na tela certa
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then((c) => (c && "navigate" in c ? c.navigate(target) : c));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
