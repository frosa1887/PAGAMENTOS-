// Service worker: funciona offline e verifica vencimentos em segundo plano
importScripts("./db.js");
const CACHE = "pagamentos-v2";
const ARQUIVOS = ["./", "./index.html", "./db.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Rede primeiro (pega atualizações), cache se estiver sem internet
  e.respondWith(
    fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

async function verificarEAvisar() {
  const ativo = await DB.getCfg("avisos");
  if (!ativo) return;
  const hoje = hojeIso();
  if ((await DB.getCfg("ultimoAviso")) === hoje) return; // no máximo 1 aviso por dia
  const dias = (await DB.getCfg("diasAntes")) ?? 2;
  const lista = contasParaAvisar(await DB.todas(), dias, hoje);
  if (!lista.length) return;
  const { titulo, corpo } = textoAviso(lista, hoje);
  await self.registration.showNotification(titulo, {
    body: corpo, icon: "./icon-192.png", badge: "./icon-192.png", tag: "vencimentos", renotify: true,
  });
  await DB.setCfg("ultimoAviso", hoje);
}

self.addEventListener("periodicsync", e => { if (e.tag === "checar-contas") e.waitUntil(verificarEAvisar()); });
self.addEventListener("message", e => { if (e.data === "checar") e.waitUntil(verificarEAvisar()); });
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("./")));
});
