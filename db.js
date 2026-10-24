// Armazenamento local (IndexedDB) — usado pelo app e pelo service worker
const DB_NAME = "controle-pagamentos";
function abrirDB() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("contas")) db.createObjectStore("contas", { keyPath: "id" });
      if (!db.objectStoreNames.contains("config")) db.createObjectStore("config");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}
async function tx(store, modo, fn) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => ok(r && "result" in r ? r.result : undefined);
    t.onerror = () => erro(t.error);
  });
}
const DB = {
  todas: () => tx("contas", "readonly", s => s.getAll()),
  salvar: c => tx("contas", "readwrite", s => s.put(c)),
  excluir: id => tx("contas", "readwrite", s => s.delete(id)),
  limpar: () => tx("contas", "readwrite", s => s.clear()),
  getCfg: k => tx("config", "readonly", s => s.get(k)),
  setCfg: (k, v) => tx("config", "readwrite", s => s.put(v, k)),
};

// Datas e situação
const pad2 = n => String(n).padStart(2, "0");
const isoData = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const hojeIso = () => isoData(new Date());
function somaDias(iso, n) { const [y, m, d] = iso.split("-").map(Number); return isoData(new Date(y, m - 1, d + n)); }
function situacao(c, hoje = hojeIso()) {
  if (c.pgto) return { k: "pago", t: "Pago" };
  if (c.vcto < hoje) return { k: "vencido", t: "Vencido" };
  if (c.vcto === hoje) return { k: "hoje", t: "Vence hoje" };
  return { k: "prazo", t: "No prazo" };
}
// Contas que merecem aviso: vencidas ou vencendo em até `dias` dias
function contasParaAvisar(contas, dias, hoje = hojeIso()) {
  const limite = somaDias(hoje, dias);
  return contas.filter(c => !c.pgto && !c.oculta && c.vcto <= limite).sort((a, b) => a.vcto.localeCompare(b.vcto));
}
function textoAviso(lista, hoje = hojeIso()) {
  const brl = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const venc = lista.filter(c => c.vcto < hoje).length;
  const titulo = venc ? `${venc} conta(s) vencida(s)` : `${lista.length} conta(s) para pagar`;
  const corpo = lista.slice(0, 4).map(c => {
    const q = c.vcto < hoje ? "venceu" : c.vcto === hoje ? "vence hoje" : "vence " + c.vcto.split("-").reverse().slice(0, 2).join("/");
    return `${c.conta}${c.valor != null ? " " + brl(c.valor) : ""} · ${q}`;
  }).join("\n") + (lista.length > 4 ? `\n+ ${lista.length - 4} outra(s)` : "");
  return { titulo, corpo };
}
