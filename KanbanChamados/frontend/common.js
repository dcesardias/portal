// Utilitários compartilhados entre o quadro (app.js) e a página de indicadores
// (metricas.js). Carregue ESTE arquivo ANTES dos demais em cada página.

const COLUNAS = [
  { id: 1, key: "aberta", label: "Aberta" },
  { id: 2, key: "processo", label: "Processo" },
  { id: 3, key: "encerrada", label: "Encerrada" },
];
const PRIORIDADES = [
  { v: "E", t: "Emergência" }, { v: "U", t: "Urgente" }, { v: "A", t: "Alta" },
  { v: "M", t: "Média" }, { v: "B", t: "Baixa" }, { v: "S", t: "Sem prioridade" },
];
const PRIO_ORDEM = { E: 0, U: 1, A: 2, M: 3, B: 4, S: 5 };
const DIA_MS = 86400000;

const $ = (s) => document.querySelector(s);

// ----------------------------- ícones compartilhados (KPIs do Kanban e pills
// da tela inicial) — SVG só, sem emoji. Tamanho fixo 14px; quem precisar de
// outro tamanho define o próprio (ex.: SVG_CLOCK de app.js, maior, no card).
const SVG_INBOX = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
const SVG_LOOP = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;
const SVG_USERX = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>`;
const SVG_TIMER = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const SVG_SPARKLES = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`;

// idade em DIAS DE CALENDÁRIO desde a abertura (meia-noite a meia-noite) —
// não em períodos de 24h decorridos. Assim uma OS aberta ontem à tarde conta
// como "1 dia" hoje, e não "hoje" só porque ainda não completou 24h.
function idadeDias(c) {
  if (!c.dt_ordem_servico) return 0;
  const d = new Date(c.dt_ordem_servico);
  if (isNaN(d)) return 0;
  const abertura = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((hoje - abertura) / DIA_MS);
}
function isNovo(c) { return idadeDias(c) <= 2; }
function execLabel(c) {
  const v = c.ds_usuario_exec_correto;
  return (!v || v === "Sem Executor" || v === "TASY") ? "Sem Executor" : v;
}

// Urgência (usada por Cockpit/Indicadores): régua por IDADE em aberto, não SLA por
// prioridade (decisão de produto — sem novo conceito no backend). Meta de referência:
// 7 dias = alerta, 15 dias = urgência "vencida" (mesmos limiares de ageBucket/app.js).
const URGENCIA_META_DIAS = 15;
function urgenciaInfo(c) {
  const dias = idadeDias(c);
  const pct = Math.min(dias / URGENCIA_META_DIAS, 1);
  const vencido = c.ie_status_ordem !== 3 && dias > URGENCIA_META_DIAS;
  const color = c.ie_status_ordem === 3 ? "var(--sla-ok)"
    : vencido ? "var(--sla-crit)" : dias > 7 ? "var(--sla-warn)" : "var(--sla-ok)";
  return { dias, pct, vencido, color };
}

// ----------------------------- datas e cálculos (usados por metricas.js e
// indicadores.js) -----------------------------------------------------------
function fmtISO(d) {
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function hojeISO() { return fmtISO(new Date()); }
function menosDias(n) { const d = new Date(); d.setDate(d.getDate() - n); return fmtISO(d); }
function fmtDuracao(h) {
  if (h == null || isNaN(h)) return "—";
  if (h < 1) return "<1h";
  if (h < 48) return Math.round(h) + "h";
  return (h / 24).toFixed(1).replace(".", ",") + " d";
}
function horas(ini, fim) {
  const a = new Date(ini), b = new Date(fim);
  return (isNaN(a) || isNaN(b)) ? null : (b - a) / 3600000;
}
function media(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function mediana(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function agrupaCont(arr, keyFn) {
  const m = new Map();
  arr.forEach((x) => { const k = keyFn(x); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
// resolução (horas) de um chamado encerrado — usa dt_atualizacao como proxy do fim
function resolHoras(c) { return c.ie_status_ordem === 3 ? horas(c.dt_ordem_servico, c.dt_atualizacao) : null; }

// ----------------------------- tema (claro/escuro) ------------------------
const SVG_SOL = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const SVG_LUA = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>`;
function temaAtual() { return document.documentElement.getAttribute("data-theme") || "dark"; }
function aplicarIconeTema() {
  const btn = $("#tema");
  if (!btn) return;
  // mostra o ícone do tema para o qual vai alternar
  btn.innerHTML = temaAtual() === "light" ? SVG_LUA : SVG_SOL;
}
function alternarTema() {
  const novo = temaAtual() === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", novo);
  try { localStorage.setItem("kanban_tema", novo); } catch {}
  aplicarIconeTema();
}

// ----------------------------- util ---------------------------------------
// toast simples; `acao` opcional = { label, fn } adiciona um botão (ex.: "Reabrir")
// e estende o tempo na tela para dar chance de clicar.
function toast(msg, erro = false, acao = null) {
  const t = $("#toast");
  if (!t) return;
  t.innerHTML = "";
  const span = document.createElement("span");
  span.className = "toast-msg";
  span.textContent = msg;
  t.appendChild(span);
  if (acao) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = acao.label;
    btn.addEventListener("click", () => {
      clearTimeout(t._h);
      t.classList.remove("show");
      acao.fn();
    });
    t.appendChild(btn);
  }
  t.classList.toggle("err", erro);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), acao ? 7000 : 2600);
}
// agrupa chamadas em rajada numa só (busca, etc.)
function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function fmtData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("pt-BR") + " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function iniciais(nome) {
  if (!nome) return "?";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
// cor estável por pessoa (hash -> hue agradável)
function avatarColor(nome) {
  let h = 0;
  for (const ch of (nome || "?")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 52%, 48%)`;
}
// nome curto da equipe (remove prefixo "TI - ")
function equipeCurta(ds) {
  if (!ds) return "";
  return ds.replace(/^TI\s*[-–]\s*/i, "").trim();
}
// ----------------------------- vínculo planej. × trabalho -----------------
// A partir de /api/grupos ({planej:[{cd,ds}], trabalho:[{planej,cd,ds}]}),
// monta ds_grupo_planej -> Set(ds_grupo_trabalho) para cascatear filtros.
function mapaTrabalhosPorPlanej(grupos) {
  const dsPorCd = new Map((grupos?.planej || []).map((p) => [p.cd, p.ds]));
  const mapa = new Map();
  (grupos?.trabalho || []).forEach((t) => {
    const dsPlanej = dsPorCd.get(t.planej);
    if (!dsPlanej) return;
    if (!mapa.has(dsPlanej)) mapa.set(dsPlanej, new Set());
    mapa.get(dsPlanej).add(t.ds);
  });
  return mapa;
}
// União dos grupos de trabalho vinculados aos grupos de planejamento selecionados.
// Retorna null quando não há seleção (= sem restrição, mostra todos).
function trabalhosPermitidosPorPlanej(mapa, dsPlanejSelecionados) {
  if (!dsPlanejSelecionados || !dsPlanejSelecionados.length) return null;
  const permitidos = new Set();
  dsPlanejSelecionados.forEach((ds) => { const s = mapa.get(ds); if (s) s.forEach((t) => permitidos.add(t)); });
  return permitidos;
}

async function api(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

// ----------------------------- vínculo usuário x grupo de trabalho --------
// Grupos de trabalho (nr_grupo_trabalho) do usuário logado — de
// MAN_GRUPO_TRAB_USUARIO, via /api/meus-grupos. Regra: só quem pertence ao
// grupo do chamado pode TRABALHÁ-LO (arrastar/encerrar/editar); os demais têm
// o chamado só para consulta. GATE_GRUPOS=false desliga a regra (usuário não
// identificado ou sem grant no Oracle) — aí tudo fica liberado (fail-open).
let MEUS_GRUPOS = new Set();
let GATE_GRUPOS = false;
async function carregarMeusGrupos() {
  try {
    const r = await api("/api/meus-grupos");
    MEUS_GRUPOS = new Set((r.grupos || []).map(Number));
    GATE_GRUPOS = !!r.gate;
  } catch { GATE_GRUPOS = false; }
}
// true = usuário PODE trabalhar o chamado. Sem gate, ou chamado sem grupo de
// trabalho, libera; com gate, exige vínculo com o grupo do chamado.
function podeTrabalhar(c) {
  if (!GATE_GRUPOS) return true;
  const g = c && c.nr_grupo_trabalho;
  if (g == null || g === "") return true;
  return MEUS_GRUPOS.has(Number(g));
}

// ----------------------------- multi-select (checkbox dropdown) -----------
// Substitui um <select> nativo quando é preciso permitir múltiplos valores.
// Uso:
//   const ms = criarMultiSelect(containerEl, { allLabel: "Todas as equipes" });
//   ms.setOptions([{ value: "A", label: "Equipe A" }, ...]);
//   ms.onChange((vals) => { ... });   // vals = array de value selecionados ([] = "todos")
//   ms.setValue(["A", "B"]);          // marca opções (ex.: restaurar filtro salvo)
//   ms.getValue();
function criarMultiSelect(root, opts) {
  opts = opts || {};
  const allLabel = opts.allLabel || "Todos";
  root.classList.add("msel");
  root.innerHTML = `
    <button type="button" class="msel-btn"><span class="msel-txt"></span><span class="msel-car">▾</span></button>
    <div class="msel-pop hidden">
      <div class="msel-actions">
        <button type="button" class="msel-all">Marcar todos</button>
        <button type="button" class="msel-none">Limpar</button>
      </div>
      <div class="msel-list"></div>
    </div>`;
  const btn = root.querySelector(".msel-btn");
  const txt = root.querySelector(".msel-txt");
  const pop = root.querySelector(".msel-pop");
  const list = root.querySelector(".msel-list");
  let itens = [];              // [{ value, label }]
  let selecionados = new Set();
  let onChangeCb = null;

  function atualizarTexto() {
    if (selecionados.size === 0) txt.textContent = allLabel;
    else if (selecionados.size === 1) {
      const it = itens.find((i) => i.value === [...selecionados][0]);
      txt.textContent = it ? it.label : "1 selecionado";
    } else txt.textContent = selecionados.size + " selecionados";
    root.classList.toggle("msel-ativo", selecionados.size > 0);
  }
  function renderLista() {
    list.innerHTML = itens.map((it) => `
      <label class="msel-item">
        <input type="checkbox" value="${esc(it.value)}" ${selecionados.has(it.value) ? "checked" : ""}/>
        <span>${esc(it.label)}</span>
      </label>`).join("") || `<div class="msel-vazio">Nenhuma opção.</div>`;
  }
  function fechar() { pop.classList.add("hidden"); }
  function abrir() { pop.classList.remove("hidden"); }
  function disparar() { if (onChangeCb) onChangeCb([...selecionados]); }

  list.addEventListener("change", (e) => {
    const cb = e.target;
    if (cb.tagName !== "INPUT") return;
    if (cb.checked) selecionados.add(cb.value); else selecionados.delete(cb.value);
    atualizarTexto();
    disparar();
  });
  root.querySelector(".msel-all").addEventListener("click", () => {
    itens.forEach((it) => selecionados.add(it.value));
    renderLista(); atualizarTexto(); disparar();
  });
  root.querySelector(".msel-none").addEventListener("click", () => {
    selecionados.clear();
    renderLista(); atualizarTexto(); disparar();
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const estavaAberto = !pop.classList.contains("hidden");
    document.querySelectorAll(".msel-pop").forEach((p) => p.classList.add("hidden"));
    if (!estavaAberto) abrir();
  });
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) fechar(); });

  atualizarTexto();

  return {
    setOptions(novos) {
      itens = novos || [];
      selecionados = new Set([...selecionados].filter((v) => itens.some((i) => i.value === v)));
      renderLista(); atualizarTexto();
    },
    setValue(vals) {
      selecionados = new Set(vals || []);
      renderLista(); atualizarTexto();
    },
    getValue() { return [...selecionados]; },
    onChange(fn) { onChangeCb = fn; },
  };
}
