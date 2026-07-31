// Modo Cockpit (Fase 3 do handoff de design) — triagem por urgência.
// Lê do mesmo store que o Kanban (CHAMADOS, de app.js) e reusa as regras de
// escrita já existentes (pedirExecutor, fluxoEncerrar, reabrirChamado, api()).
// Régua de urgência por IDADE (urgenciaInfo, de common.js) — sem SLA novo.

const CP_QUEUE_KEY = "kanban_cockpit_fila";
const CP_TEAM_KEY = "kanban_cockpit_equipe";
let cockpitQueue = (function () {
  try { return localStorage.getItem(CP_QUEUE_KEY) || "triage"; } catch { return "triage"; }
})();
// Filtro de equipe é INDEPENDENTE da fila (combina em AND): dá pra escolher
// "Sem responsável" e clicar numa equipe pra ver só os sem-executor dela.
let cockpitTeam = (function () {
  try { return localStorage.getItem(CP_TEAM_KEY) || null; } catch { return null; }
})();
// Migração do modelo antigo, em que a equipe era uma "fila" (team:Nome) gravada
// em cockpitQueue e que substituía a fila inteligente ao ser clicada.
if (cockpitQueue.startsWith("team:")) {
  cockpitTeam = cockpitQueue.slice(5);
  cockpitQueue = "triage";
  try { localStorage.setItem(CP_QUEUE_KEY, cockpitQueue); localStorage.setItem(CP_TEAM_KEY, cockpitTeam); } catch {}
}
let cockpitSel = null;
let cockpitBusca = "";
let cockpitRowIds = [];

// ----------------------------- ícones (compactos, tamanhos próprios) ------
const SVG_BOLT = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>`;
const SVG_ALERT = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>`;
const SVG_USERPLUS = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 8-5.66"/><path d="M17 15v6M14 18h6"/></svg>`;
const SVG_MINE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const SVG_CLOCK15 = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const SVG_PLUS = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
const SVG_EMPTY = `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`;
const SVG_QUEUE_OK = `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`;
const SVG_LIST = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
const SVG_TEAM = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

const STATUS_COLOR = { 1: "var(--st-aberta)", 2: "var(--st-processo)", 3: "var(--st-encerrada)" };
// mesma paleta usada em indicadores.js pras 4 equipes conhecidas; outras (se
// surgirem) caem no hash de cor por nome (avatarColor), igual aos avatares.
const TEAM_COLOR = { "Sistemas": "var(--primary)", "Service Desk": "var(--sla-ok)", "Infraestrutura": "#8b7bff", "BI": "var(--st-processo)" };

// ----------------------------- filas inteligentes --------------------------
const CP_SMART = [
  { key: "triage", label: "Precisam de você", color: "var(--p-emerg)", icon: SVG_BOLT,
    filtro: (c) => c.ie_status_ordem !== 3 },
  { key: "mine", label: "Minha fila", color: "var(--primary)", icon: SVG_MINE,
    filtro: (c) => c.ie_status_ordem !== 3 && c.nm_exec_atual === currentUsername },
  { key: "emerg", label: "Emergências", color: "var(--p-emerg)", icon: SVG_ALERT,
    filtro: (c) => (c.ie_prioridade === "E" || c.ie_prioridade === "U") && c.ie_status_ordem !== 3 },
  { key: "unassigned", label: "Sem responsável", color: "#8b7bff", icon: SVG_USERPLUS,
    filtro: (c) => execLabel(c) === "Sem Executor" && c.ie_status_ordem !== 3 },
  { key: "overdue", label: "Mais antigos", color: "var(--sla-warn)", icon: SVG_CLOCK15,
    filtro: (c) => c.ie_status_ordem !== 3 && urgenciaInfo(c).vencido },
];
const CP_QUEUE_META = {
  triage: ["Precisam de você agora", "Ordenado por tempo em aberto"],
  mine: ["Minha fila", "Chamados sob sua responsabilidade"],
  emerg: ["Emergências", "Prioridade máxima"],
  unassigned: ["Sem responsável", "Aguardando atribuição de executor"],
  overdue: ["Mais antigos", "Mais de 15 dias em aberto, sem encerrar"],
};

function queueFiltro(key, c) {
  const def = CP_SMART.find((q) => q.key === key);
  if (def) return def.filtro(c);
  if (key.startsWith("st:")) return c.ie_status_ordem === Number(key.slice(3));
  return true;
}
// Filtro de equipe (independente da fila). Sem equipe selecionada, passa tudo.
function teamMatch(c) {
  if (!cockpitTeam) return true;
  return (equipeCurta(c.ds_grupo_trabalho) || "Sem equipe") === cockpitTeam;
}
function filtroBuscaCockpit(c) {
  if (!cockpitBusca) return true;
  const blob = [
    c.nr_sequencia, c.ds_dano_breve, c.nm_solicitante, c.nm_pessoa_solicitante,
    c.ds_setor_solicitante, c.ds_usuario_exec_correto,
  ].join(" ").toLowerCase();
  return blob.includes(cockpitBusca);
}
function ordenarCockpit(itens) {
  return itens.slice().sort((a, b) => {
    const ra = a.ie_status_ordem === 3 ? -1 : urgenciaInfo(a).pct;
    const rb = b.ie_status_ordem === 3 ? -1 : urgenciaInfo(b).pct;
    return rb - ra;
  });
}
function urgenciaLabel(c, u) {
  if (c.ie_status_ordem === 3) return "resolvido";
  return (u.vencido ? "vencido há " : "aberto há ") + ageLabel(u.dias);
}

// ----------------------------- ações (reusam app.js / common.js) ----------
async function moverCockpit(c, novoStatus) {
  if (novoStatus === c.ie_status_ordem) return;
  if (!podeTrabalhar(c)) {
    toast("Somente consulta: você não pertence ao grupo de trabalho deste chamado.", true);
    return;
  }
  try {
    if (novoStatus === 1) { await reabrirChamado(c.nr_sequencia); return; }
    if (novoStatus === 2) {
      if (!c.nm_exec_atual) {
        const exec = await pedirExecutor(c.nr_sequencia,
          "Defina o <b>executor</b> para colocar o chamado em <b>Processo</b>. Obrigatório.");
        if (!exec) return;
        await api(`/api/chamados/${c.nr_sequencia}/status`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ie_status_ordem: 2, nm_usuario_exec: exec }),
        });
      } else {
        await api(`/api/chamados/${c.nr_sequencia}/status`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ie_status_ordem: 2 }),
        });
      }
      toast(`Chamado #${c.nr_sequencia} → Processo`);
      await carregar();
      return;
    }
    if (novoStatus === 3) {
      const ok = await fluxoEncerrar(c.nr_sequencia);
      if (ok) await carregar();
      return;
    }
  } catch (e) {
    toast("Erro ao mover: " + e.message, true);
    await carregar();
  }
}

async function atribuirAMim(c) {
  if (!currentUsername) { toast("Usuário não identificado.", true); return; }
  if (!podeTrabalhar(c)) {
    toast("Somente consulta: você não pertence ao grupo de trabalho deste chamado.", true);
    return;
  }
  try {
    if (c.ie_status_ordem === 1) {
      await api(`/api/chamados/${c.nr_sequencia}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ie_status_ordem: 2, nm_usuario_exec: currentUsername }),
      });
    } else {
      await api(`/api/chamados/${c.nr_sequencia}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nm_usuario_exec: currentUsername }),
      });
    }
    toast(`Chamado #${c.nr_sequencia} atribuído a você`);
    await carregar();
  } catch (e) { toast("Erro ao atribuir: " + e.message, true); }
}

// transfere grupo de planejamento (obrigatório) e/ou de trabalho (opcional) —
// mesmo PATCH /api/chamados/{nr} usado pelo modal de edição do Kanban.
async function transferirGrupoCockpit(c, planejValue, trabValue) {
  if (!planejValue) { toast("Selecione o grupo de planejamento.", true); return; }
  const payload = {};
  const planejAtual = c.nr_grupo_planej != null ? String(c.nr_grupo_planej) : "";
  const trabAtual = c.nr_grupo_trabalho != null ? String(c.nr_grupo_trabalho) : "";
  if (planejValue !== planejAtual) payload.nr_grupo_planej = parseInt(planejValue, 10);
  if (trabValue !== trabAtual) payload.nr_grupo_trabalho = trabValue ? parseInt(trabValue, 10) : null;
  if (!Object.keys(payload).length) return;
  try {
    await api(`/api/chamados/${c.nr_sequencia}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    toast(`Chamado #${c.nr_sequencia} transferido`);
    await carregar();
  } catch (e) { toast("Erro ao transferir: " + e.message, true); }
}

// histórico de interação — mesmos endpoints/HTML do modal do Kanban
// (GET/PUT .../historico e .../relato, historicoItemHTML de app.js)
async function carregarHistoricoCockpit(id) {
  const ul = document.getElementById("cp-historico");
  if (!ul) return;
  ul.innerHTML = `<li class="vazio">carregando…</li>`;
  try {
    const { historico } = await api(`/api/chamados/${id}/historico`);
    ul.innerHTML = historico.length
      ? historico.map(historicoItemHTML).join("")
      : `<li class="vazio">Nenhuma interação registrada ainda.</li>`;
    ul.scrollTop = ul.scrollHeight;
  } catch (e) {
    ul.innerHTML = `<li class="vazio">Erro ao carregar o histórico: ${esc(e.message)}</li>`;
  }
}
async function adicionarNotaCockpit(id, ta) {
  const texto = ta.value.trim();
  if (!texto) { toast("Escreva algo antes de adicionar.", true); ta.focus(); return; }
  try {
    await api(`/api/chamados/${id}/relato`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ds_relato: texto }),
    });
    ta.value = "";
    await carregarHistoricoCockpit(id);
    toast("Interação adicionada ao histórico");
  } catch (e) { toast("Erro ao adicionar: " + e.message, true); }
}

// atividade derivada — não há endpoint de histórico (ver README)
function montarAtividade(c) {
  const itens = [];
  itens.push({
    icon: SVG_PLUS, color: "var(--primary)",
    texto: `Aberto por ${c.nm_solicitante || c.nm_usuario_solic || "solicitante"}`,
    tempo: fmtData(c.dt_ordem_servico),
  });
  if (execLabel(c) !== "Sem Executor") {
    itens.push({ icon: SVG_MINE, color: "#8b7bff", texto: `Atribuído a ${c.ds_usuario_exec_correto}`, tempo: fmtData(c.dt_atualizacao) });
  }
  if (c.ie_status_ordem === 2) {
    itens.push({ icon: SVG_CLOCK15, color: "var(--st-processo)", texto: "Em atendimento", tempo: fmtData(c.dt_atualizacao) });
  }
  if (c.ie_status_ordem === 3) {
    itens.push({ icon: SVG_CHECK, color: "var(--st-encerrada)", texto: "Encerrado — solução registrada", tempo: fmtData(c.dt_atualizacao) });
  }
  return itens.map((ev) => `
    <div class="cp-ev">
      <span class="cp-ev-ic" style="background:color-mix(in srgb, ${ev.color} 16%, transparent);color:${ev.color}">${ev.icon}</span>
      <div class="cp-ev-txt"><div>${esc(ev.texto)}</div><small>${esc(ev.tempo || "—")}</small></div>
    </div>`).join("");
}

function contatoBotoes(login) {
  const e = emailDe(login);
  if (!e) return `<span class="muted" style="font-size:11px">sem usuário p/ contato</span>`;
  return `<a class="cp-contato-btn" href="mailto:${esc(e)}">${SVG_MAIL}Email</a>
    <a class="cp-contato-btn tms" href="${esc(teamsDe(login))}" target="_blank" rel="noopener">${SVG_CHAT}Teams</a>`;
}

// ----------------------------- render: shell -------------------------------
function cockpitShellHTML() {
  return `
    <div class="cp-layout">
      <aside class="cp-rail" id="cp-rail"></aside>
      <section class="cp-center">
        <div class="cp-center-head" id="cp-center-head"></div>
        <div class="cp-list" id="cp-list"></div>
        <div class="cp-list-foot" id="cp-list-foot"></div>
      </section>
      <aside class="cp-detail" id="cp-detail"></aside>
    </div>`;
}

// ----------------------------- render: rail --------------------------------
function renderRail() {
  const el = document.getElementById("cp-rail");
  if (!el) return;
  const todos = (typeof CHAMADOS !== "undefined" ? CHAMADOS : []);

  const smartBtns = CP_SMART.map((q) => {
    const n = todos.filter((c) => q.filtro(c) && teamMatch(c)).length;
    const ativo = cockpitQueue === q.key;
    return `<button type="button" class="cp-qbtn ${ativo ? "active" : ""}" data-queue="${q.key}">
      <span class="cp-qic" style="${ativo ? `background:color-mix(in srgb, ${q.color} 15%, transparent);color:${q.color}` : ""}">${q.icon}</span>
      <span class="cp-qlbl">${esc(q.label)}</span>
      <span class="cp-qcount ${ativo ? "active" : ""}">${n}</span>
    </button>`;
  }).join("");

  const statusBtns = COLUNAS.map((col) => {
    const n = todos.filter((c) => c.ie_status_ordem === col.id && teamMatch(c)).length;
    const ativo = cockpitQueue === "st:" + col.id;
    return `<button type="button" class="cp-qbtn cp-qbtn-status ${ativo ? "active" : ""}" data-queue="st:${col.id}">
      <span class="sdot" style="background:${STATUS_COLOR[col.id]}"></span>
      <span class="cp-qlbl">${esc(col.label)}</span>
      <span class="cp-qcount ${ativo ? "active" : ""}">${n}</span>
    </button>`;
  }).join("");

  // carga por equipe (grupo de trabalho) — clicável, filtra a lista central
  const cargaMap = new Map();
  todos.filter((c) => c.ie_status_ordem !== 3).forEach((c) => {
    const equipe = equipeCurta(c.ds_grupo_trabalho) || "Sem equipe";
    cargaMap.set(equipe, (cargaMap.get(equipe) || 0) + 1);
  });
  const carga = [...cargaMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxCarga = Math.max(1, ...carga.map(([, n]) => n));
  const cargaHTML = carga.length ? carga.map(([equipe, n]) => {
    const ativo = cockpitTeam === equipe;
    return `<button type="button" class="cp-carga-btn ${ativo ? "active" : ""}" data-team="${esc(equipe)}">
      <div class="cp-carga-top"><span title="${esc(equipe)}">${esc(equipe)}</span><b>${n}</b></div>
      <div class="cp-carga-track"><span style="width:${Math.round((n / maxCarga) * 100)}%;background:${ativo ? "var(--primary)" : "var(--text-3)"}"></span></div>
    </button>`;
  }).join("") : `<div class="cp-carga-vazio">Sem chamados em aberto.</div>`;

  el.innerHTML = `
    <div class="cp-rail-lbl">Filas inteligentes</div>
    ${smartBtns}
    <div class="cp-rail-lbl">Por status</div>
    ${statusBtns}
    <div class="cp-rail-lbl cp-rail-lbl-row">
      <span>Carga por equipe</span>
      ${cockpitTeam ? `<button type="button" class="cp-rail-clear" id="cp-team-clear">limpar</button>` : ``}
    </div>
    <div class="cp-carga">${cargaHTML}</div>`;

  el.querySelectorAll("[data-queue]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cockpitQueue = btn.dataset.queue;
      try { localStorage.setItem(CP_QUEUE_KEY, cockpitQueue); } catch {}
      cockpitSel = null;
      renderCockpit();
    });
  });

  // Equipe é um filtro adicional (combina com a fila). Clicar de novo na mesma
  // equipe — ou em "limpar" — remove o filtro.
  el.querySelectorAll("[data-team]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.team;
      cockpitTeam = (cockpitTeam === t) ? null : t;
      try {
        if (cockpitTeam) localStorage.setItem(CP_TEAM_KEY, cockpitTeam);
        else localStorage.removeItem(CP_TEAM_KEY);
      } catch {}
      cockpitSel = null;
      renderCockpit();
    });
  });
  const btnClear = document.getElementById("cp-team-clear");
  if (btnClear) btnClear.addEventListener("click", () => {
    cockpitTeam = null;
    try { localStorage.removeItem(CP_TEAM_KEY); } catch {}
    cockpitSel = null;
    renderCockpit();
  });
}

// ----------------------------- render: lista central -----------------------
function cockpitRowHTML(c, selecionado) {
  const u = urgenciaInfo(c);
  const prioCor = PRIO_COLOR[c.ie_prioridade] || "var(--p-sem)";
  const semExec = execLabel(c) === "Sem Executor";
  const execNome = semExec ? "Sem responsável" : c.ds_usuario_exec_correto;
  const equipe = equipeCurta(c.ds_grupo_trabalho);
  const col = COLUNAS.find((x) => x.id === c.ie_status_ordem);
  return `
    <article class="cp-row ${selecionado ? "sel" : ""}" data-id="${c.nr_sequencia}">
      <div class="cp-ring" style="background:conic-gradient(${u.color} ${Math.round(u.pct * 360)}deg, var(--track) 0deg)">
        <span class="cp-ring-inner" style="color:var(--text-2)">${esc(c.ie_prioridade || "S")}</span>
      </div>
      <div class="cp-row-mid">
        <div class="cp-row-top">
          <span class="cp-row-num">#${c.nr_sequencia}</span>
          <span class="cp-row-title">${esc(c.ds_dano_breve || "(sem descrição)")}</span>
        </div>
        <div class="cp-row-sub">
          <span class="cp-row-req">${esc(c.nm_solicitante || c.nm_usuario_solic || "—")}</span>
          <span class="sep">·</span>
          <span class="cp-row-setor">${esc(c.ds_setor_solicitante || "—")}</span>
          ${equipe ? `<span class="team-tag cp-row-team">${esc(equipe)}</span>` : ""}
        </div>
      </div>
      <div class="cp-row-end">
        <span class="cp-row-urg" style="color:${u.color}">${urgenciaLabel(c, u)}</span>
        <span class="cp-row-badges">
          <span class="cp-status-chip">${col ? esc(col.label) : ""}</span>
          <span class="avatar cp-av ${semExec ? "sem" : ""}" title="${esc(execNome)}">${iniciais(semExec ? "" : execNome)}</span>
        </span>
      </div>
    </article>`;
}

function renderCenter() {
  const head = document.getElementById("cp-center-head");
  const list = document.getElementById("cp-list");
  const foot = document.getElementById("cp-list-foot");
  if (!head || !list || !foot) return;
  const todos = (typeof CHAMADOS !== "undefined" ? CHAMADOS : []);
  const filtrados = todos.filter((c) => queueFiltro(cockpitQueue, c) && teamMatch(c) && filtroBuscaCockpit(c));
  const itens = ordenarCockpit(filtrados);

  // ícone/cor do cabeçalho seguem a fila ativa (antes ficavam travados no
  // vermelho de "Precisam de você" mesmo com outra fila selecionada)
  let meta = CP_QUEUE_META[cockpitQueue];
  let headIcon = SVG_BOLT, headColor = "var(--p-emerg)";
  const smartDef = CP_SMART.find((q) => q.key === cockpitQueue);
  if (smartDef) {
    headIcon = smartDef.icon; headColor = smartDef.color;
  } else if (!meta) {
    const col = COLUNAS.find((c) => "st:" + c.id === cockpitQueue);
    meta = [col ? col.label : "Chamados", "Todos os chamados neste status"];
    headIcon = SVG_LIST; headColor = col ? STATUS_COLOR[col.id] : "var(--text-3)";
  }
  // Chip da equipe ativa: combina (AND) com a fila e pode ser removido aqui.
  const teamCor = cockpitTeam ? (TEAM_COLOR[cockpitTeam] || avatarColor(cockpitTeam)) : "";
  const teamChip = cockpitTeam
    ? `<button type="button" class="cp-team-chip" id="cp-head-team-clear" title="Remover filtro de equipe"
         style="background:color-mix(in srgb, ${teamCor} 16%, transparent);color:${teamCor}">
         ${SVG_TEAM}<span>${esc(cockpitTeam)}</span><span class="x">×</span>
       </button>`
    : "";
  head.innerHTML = `
    <div class="cp-head-title">
      <span class="cp-head-icon" style="background:color-mix(in srgb, ${headColor} 15%, transparent);color:${headColor}">${headIcon}</span>
      <div><div class="cp-head-h">${esc(meta[0])}</div><div class="cp-head-sub">${esc(meta[1])}</div></div>
      ${teamChip}
    </div>
    <div class="cp-head-legend">
      <span><i style="background:var(--sla-ok)"></i>No prazo</span>
      <span><i style="background:var(--sla-warn)"></i>Atenção</span>
      <span><i style="background:var(--sla-crit)"></i>Vencido</span>
    </div>`;
  const btnHeadTeamClear = document.getElementById("cp-head-team-clear");
  if (btnHeadTeamClear) btnHeadTeamClear.addEventListener("click", () => {
    cockpitTeam = null;
    try { localStorage.removeItem(CP_TEAM_KEY); } catch {}
    cockpitSel = null;
    renderCockpit();
  });

  // Se uma ação do próprio usuário (transferir equipe, atribuir, mudar status)
  // fez o chamado selecionado sair da fila ativa, ele deixa de aparecer na
  // LISTA — mas o painel de detalhe continua nele (não pula pra outro chamado
  // "aleatório", que parecia "desfazer" a ação). Só troca a seleção quando o
  // chamado nem existe mais, ou quando nunca havia seleção.
  const selAindaExiste = cockpitSel != null && todos.some((c) => c.nr_sequencia === cockpitSel);
  if (!itens.length) {
    if (!selAindaExiste) cockpitSel = null;
    list.innerHTML = `<div class="cp-list-empty">${SVG_QUEUE_OK}<div>Fila zerada. Nada pendente aqui.</div></div>`;
  } else {
    if (!selAindaExiste) {
      cockpitSel = itens[0].nr_sequencia;
    }
    list.innerHTML = itens.map((c) => cockpitRowHTML(c, c.nr_sequencia === cockpitSel)).join("");
    list.querySelectorAll(".cp-row").forEach((row) => {
      row.addEventListener("click", () => {
        cockpitSel = parseInt(row.dataset.id, 10);
        renderCockpit();
      });
    });
  }
  foot.innerHTML = `
    <span><kbd>J</kbd><kbd>K</kbd> navegar</span>
    <span><kbd>E</kbd> atribuir a mim</span>
    <span><kbd>F</kbd> encerrar</span>
    <span class="cp-list-total">${itens.length} chamado${itens.length === 1 ? "" : "s"}</span>`;

  cockpitRowIds = itens.map((c) => c.nr_sequencia);
}

// ----------------------------- render: detalhe inline -----------------------
function renderDetail(c) {
  const el = document.getElementById("cp-detail");
  if (!el) return;
  if (!c) {
    el.innerHTML = `<div class="cp-empty">${SVG_EMPTY}<div>Selecione um chamado<br><span>ou pressione J para começar a triagem</span></div></div>`;
    return;
  }
  const u = urgenciaInfo(c);
  const prioCor = PRIO_COLOR[c.ie_prioridade] || "var(--p-sem)";
  const prioLabel = PRIO_LABEL[c.ie_prioridade] || "Sem prioridade";
  const semExec = execLabel(c) === "Sem Executor";
  const execNome = semExec ? "Não atribuído" : c.ds_usuario_exec_correto;
  const equipe = equipeCurta(c.ds_grupo_trabalho);
  const reqNome = c.nm_solicitante || c.nm_pessoa_solicitante || "—";
  const ro = !podeTrabalhar(c);  // somente consulta: sem vínculo com o grupo de trabalho

  // Segmento só alterna entre os 2 estados "de trabalho" (Aberta/Processo) —
  // Encerrar é uma ação própria e deliberada (exige solução), feita só pelo
  // botão vermelho no rodapé. Ticket já encerrado não mostra o segmento
  // (a única saída dali é "Reabrir", no rodapé).
  const statusAtual = COLUNAS.find((col) => col.id === c.ie_status_ordem);
  const statusCor = STATUS_COLOR[c.ie_status_ordem] || "var(--text-3)";
  const statusBadge = `<span class="prio-pill" style="background:color-mix(in srgb, ${statusCor} 17%, transparent);color:${statusCor}"><span class="dot" style="background:${statusCor}"></span>${esc(statusAtual ? statusAtual.label : "—")}</span>`;
  const segmento = c.ie_status_ordem === 3 ? "" : `
    <div class="cp-seg-wrap">
      <span class="cp-seg-lbl">Mover para</span>
      <div class="cp-seg">
        ${COLUNAS.filter((col) => col.id !== 3).map((col) => `
          <button type="button" class="cp-stbtn ${c.ie_status_ordem === col.id ? "active" : ""}" data-status="${col.id}"
            title="Mover chamado para ${esc(col.label)}"
            style="${c.ie_status_ordem === col.id ? `background:${STATUS_COLOR[col.id]};color:#fff;` : ""}">${esc(col.label)}</button>
        `).join("")}
      </div>
    </div>`;

  el.innerHTML = `
    <div class="cp-detail-inner">
      <div class="cp-d-head">
        <div class="cp-d-top">
          <span class="cp-d-id">#${c.nr_sequencia}</span>
          ${statusBadge}
          <span class="prio-pill" style="background:color-mix(in srgb, ${prioCor} 17%, transparent);color:${prioCor}"><span class="dot" style="background:${prioCor}"></span>${esc(prioLabel)}</span>
        </div>
        <h2 class="cp-d-title">${esc(c.ds_dano_breve || "(sem descrição)")}</h2>
        ${ro ? `<div class="cp-ro">🔒 Somente consulta — você não pertence ao grupo de trabalho deste chamado.</div>` : segmento}
      </div>
      <div class="cp-d-body">
        <div class="cp-urg">
          <div class="cp-urg-head">
            <span>${c.ie_status_ordem === 3 ? "Tempo até o encerramento" : u.vencido ? "Tempo em aberto — atenção" : "Dentro da referência de urgência"}</span>
            <span style="color:${u.color}">${urgenciaLabel(c, u)}</span>
          </div>
          <div class="cp-urg-track"><span class="cp-urg-fill" style="width:${Math.round(u.pct * 100)}%;background:${u.color}"></span></div>
          <div class="cp-urg-note">Aberto em ${esc(fmtData(c.dt_ordem_servico))}${c.ie_status_ordem === 3 ? "" : " · referência: 15 dias sem tratativa"}</div>
        </div>

        <div class="cp-grid2">
          <div class="cp-mini">
            <div class="cp-mini-lbl">Solicitante</div>
            <div class="cp-mini-who">
              <span class="avatar" style="background:${avatarColor(reqNome)}">${iniciais(reqNome)}</span>
              <div class="cp-mini-txt"><div class="nm">${esc(reqNome)}</div><div class="sub">${esc(c.ds_setor_solicitante || "—")}</div></div>
            </div>
            <div class="cp-mini-actions">${contatoBotoes(c.nm_usuario_solic)}</div>
          </div>
          <div class="cp-mini">
            <div class="cp-mini-lbl">Responsável</div>
            <div class="cp-mini-who">
              <span class="avatar ${semExec ? "sem" : ""}" style="${semExec ? "" : `background:${avatarColor(execNome)}`}">${iniciais(semExec ? "" : execNome)}</span>
              <div class="cp-mini-txt"><div class="nm ${semExec ? "muted" : ""}">${esc(execNome)}</div><div class="sub">${esc(equipe || "—")}</div></div>
            </div>
            <button type="button" class="cp-btn-primary-sm" id="cp-assign-me">Atribuir a mim</button>
          </div>
        </div>

        <div class="cp-section">
          <div class="cp-section-lbl">Grupo de planejamento / trabalho</div>
          <div class="cp-grid2">
            <select id="cp-planej" class="cp-select" title="Grupo de planejamento"></select>
            <select id="cp-trab" class="cp-select" title="Grupo de trabalho"></select>
          </div>
          <button type="button" class="cp-btn-primary-sm" id="cp-transferir" style="margin-top:8px">Transferir</button>
        </div>

        <div class="cp-section">
          <div class="cp-section-lbl">Estágio do processo</div>
          <div class="busca-combo" id="cp-estagio-combo">
            <input id="cp-estagio-texto" type="text" class="cp-select" placeholder="Digite p/ buscar o estágio…" autocomplete="off" />
            <input type="hidden" id="cp-estagio-id" />
            <ul id="cp-estagio-opts" class="busca-combo-opts hidden"></ul>
          </div>
          <button type="button" class="cp-btn-primary-sm" id="cp-estagio-salvar" style="margin-top:8px">Salvar estágio</button>
        </div>

        <div class="cp-section">
          <div class="cp-section-lbl">Descrição</div>
          <div class="cp-desc">${esc(c.ds_dano || c.ds_dano_breve || "—")}</div>
        </div>

        <div class="cp-section">
          <div class="cp-section-lbl">Atividade</div>
          <div class="cp-timeline">${montarAtividade(c)}</div>
        </div>

        <div class="cp-section">
          <div class="cp-section-lbl">Histórico de interação</div>
          <ul id="cp-historico" class="historico-list"></ul>
          <div class="historico-compor">
            <textarea id="cp-nota" rows="3" placeholder="Adicionar uma interação: pedir mais informação, atualizar o andamento, registrar um passo do atendimento…"></textarea>
            <button type="button" class="cp-btn-primary-sm" id="cp-nota-add">Adicionar ao histórico</button>
          </div>
        </div>
      </div>
      <div class="cp-d-foot">
        <button type="button" class="cp-btn-danger" id="cp-encerrar">${c.ie_status_ordem === 3 ? "Reabrir chamado" : "Encerrar chamado"}</button>
        <button type="button" class="cp-btn-ghost" id="cp-anexos">Anexos · ${c.qt_anexos || 0}</button>
      </div>
    </div>`;

  carregarHistoricoCockpit(c.nr_sequencia);

  // grupo de planejamento/trabalho — mesmas opções/cascata de app.js (Novo
  // chamado e edição do Kanban); reusa GRUPOS/popularGruposTrabalho, sem
  // duplicar a lista. Só salva no clique de "Transferir" — trocar só o
  // planejamento não dispara nada sozinho, pra dar tempo de escolher o
  // trabalho antes de confirmar.
  const selPlanej = document.getElementById("cp-planej");
  const selTrab = document.getElementById("cp-trab");
  if (selPlanej && selTrab) {
    selPlanej.innerHTML = `<option value="">Selecione…</option>` +
      (GRUPOS.planej || []).map((g) => `<option value="${g.cd}">${esc(g.ds)}</option>`).join("");
    selPlanej.value = c.nr_grupo_planej != null ? String(c.nr_grupo_planej) : "";
    popularGruposTrabalho("#cp-planej", "#cp-trab");
    selTrab.value = c.nr_grupo_trabalho != null ? String(c.nr_grupo_trabalho) : "";
    selPlanej.addEventListener("change", () => popularGruposTrabalho("#cp-planej", "#cp-trab"));
    const btnTransferir = document.getElementById("cp-transferir");
    if (btnTransferir) {
      btnTransferir.addEventListener("click", () => transferirGrupoCockpit(c, selPlanej.value, selTrab.value));
    }
  }

  el.querySelectorAll(".cp-stbtn").forEach((btn) => {
    btn.addEventListener("click", () => moverCockpit(c, parseInt(btn.dataset.status, 10)));
  });
  const btnAssign = document.getElementById("cp-assign-me");
  if (btnAssign) btnAssign.addEventListener("click", () => atribuirAMim(c));
  const btnEncerrar = document.getElementById("cp-encerrar");
  if (btnEncerrar) btnEncerrar.addEventListener("click", () => {
    if (c.ie_status_ordem === 3) reabrirChamado(c.nr_sequencia);
    else fluxoEncerrar(c.nr_sequencia).then((ok) => { if (ok) carregar(); });
  });
  const btnAnexos = document.getElementById("cp-anexos");
  if (btnAnexos) btnAnexos.addEventListener("click", () => abrirModal(c.nr_sequencia));
  const btnNota = document.getElementById("cp-nota-add");
  const taNota = document.getElementById("cp-nota");
  if (btnNota && taNota) btnNota.addEventListener("click", () => adicionarNotaCockpit(c.nr_sequencia, taNota));

  // estágio do processo (mesmo combo de busca do modal do Kanban)
  const buscaEstagio = criarBuscaEstagio("cp");
  if (buscaEstagio) {
    buscaEstagio.setValor(c.nr_seq_estagio);
    const btnEstagio = document.getElementById("cp-estagio-salvar");
    if (btnEstagio) btnEstagio.addEventListener("click", () => salvarEstagioCockpit(c, buscaEstagio.getValor()));
  }

  // Somente consulta (sem vínculo com o grupo): desabilita toda ação de
  // escrita no painel. Anexos/histórico/contatos continuam liberados.
  if (ro) {
    ["cp-encerrar", "cp-assign-me", "cp-transferir", "cp-estagio-salvar",
     "cp-nota-add"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) { b.disabled = true; b.title = "Somente consulta — sem vínculo com o grupo de trabalho"; }
    });
    ["cp-planej", "cp-trab", "cp-nota", "cp-estagio-texto"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.disabled = true;
    });
  }
}

async function salvarEstagioCockpit(c, novoId) {
  const atual = c.nr_seq_estagio != null ? String(c.nr_seq_estagio) : "";
  const novo = novoId != null ? String(novoId) : "";
  if (novo === atual) { toast("Nenhuma mudança no estágio."); return; }
  try {
    await api(`/api/chamados/${c.nr_sequencia}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nr_seq_estagio: novo ? parseInt(novo, 10) : null }),
    });
    toast(`Estágio do #${c.nr_sequencia} atualizado`);
    await carregar();
  } catch (e) { toast("Erro ao salvar estágio: " + e.message, true); }
}

// ----------------------------- orquestração ---------------------------------
function renderCockpit() {
  const shell = document.getElementById("view-cockpit");
  if (!shell) return;
  if (!shell.dataset.built) {
    shell.innerHTML = cockpitShellHTML();
    shell.dataset.built = "1";
  }
  // não sobrescreve enquanto o usuário está digitando uma nota (evita perder texto no auto-refresh)
  const focoAtivo = document.activeElement && document.activeElement.id;
  if (focoAtivo === "cp-nota" || focoAtivo === "cp-estagio-texto") return;
  const buscaEl = $("#busca");
  if (buscaEl) cockpitBusca = (buscaEl.value || "").toLowerCase().trim();
  renderRail();
  renderCenter();
  const todos = (typeof CHAMADOS !== "undefined" ? CHAMADOS : []);
  const sel = todos.find((c) => c.nr_sequencia === cockpitSel);
  renderDetail(sel || null);
}
onView("cockpit", renderCockpit);

// busca global (topbar) também filtra a lista do Cockpit
$("#busca")?.addEventListener("input", debounce(() => {
  if (viewAtual() !== "cockpit") return;
  cockpitBusca = ($("#busca").value || "").toLowerCase().trim();
  renderCenter();
  const todos = (typeof CHAMADOS !== "undefined" ? CHAMADOS : []);
  renderDetail(todos.find((c) => c.nr_sequencia === cockpitSel) || null);
}, 180));

// atalhos J/K/E/F — só com o Cockpit ativo e foco fora de input/textarea
document.addEventListener("keydown", (e) => {
  if (typeof viewAtual !== "function" || viewAtual() !== "cockpit") return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const ids = cockpitRowIds;
  if (!ids.length) return;
  const i = ids.indexOf(cockpitSel);
  const k = e.key.toLowerCase();
  if (k === "j") {
    e.preventDefault();
    cockpitSel = ids[Math.min(ids.length - 1, (i < 0 ? -1 : i) + 1)];
    renderCenter(); renderDetail(CHAMADOS.find((c) => c.nr_sequencia === cockpitSel) || null);
  } else if (k === "k") {
    e.preventDefault();
    cockpitSel = ids[Math.max(0, (i < 0 ? 1 : i) - 1)];
    renderCenter(); renderDetail(CHAMADOS.find((c) => c.nr_sequencia === cockpitSel) || null);
  } else if (k === "e" && cockpitSel != null) {
    const c = CHAMADOS.find((x) => x.nr_sequencia === cockpitSel);
    if (c) atribuirAMim(c);
  } else if (k === "f" && cockpitSel != null) {
    const c = CHAMADOS.find((x) => x.nr_sequencia === cockpitSel);
    if (c && !podeTrabalhar(c)) {
      toast("Somente consulta: você não pertence ao grupo de trabalho deste chamado.", true);
    } else if (c) {
      fluxoEncerrar(c.nr_sequencia).then((ok) => { if (ok) carregar(); });
    }
  }
});
