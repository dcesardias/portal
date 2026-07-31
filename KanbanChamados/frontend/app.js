// Kanban de Chamados (Ordens de Serviço Tasy) - front
// Constantes/utilitários compartilhados (COLUNAS, PRIORIDADES, api, esc, tema…)
// vivem em common.js, carregado ANTES deste arquivo.

let CHAMADOS = [];        // lista crua da API
let filtroTexto = "";
let filtroPrio = [];
let filtroSetor = [];
let filtroExec = [];
let filtroPlanej = [];
let filtroTrabalho = [];
let filtroIdade = "0";    // "0" | "novo" | "7" | "15" | "30" | "90"
let filtroSemExec = false;
let filtroMeusChamados = false;
let currentUsername = null;   // login do usuário logado (ex.: "dcesar")
let ordenacao = "recentes";
let modalAtual = null;    // nr_sequencia em edição
let arrastando = false;   // true durante um drag (pausa o auto-refresh)
let msPrio, msSetor, msExec, msPlanej, msTrabalho;   // multi-selects (filtros)
let mapaPlanejTrabalho = new Map();   // ds_grupo_planej -> Set(ds_grupo_trabalho), de /api/grupos
let chamadoAvulso = null; // chamado achado pela busca global (fora da janela do quadro), pra abrir/editar
let buscaEstagioModal = null; // instância do combo de busca de estágio do modal do Kanban (ver criarBuscaEstagio)

// acha o chamado tanto na lista do quadro quanto no achado avulso pela busca global
function obterChamado(id) {
  return CHAMADOS.find((x) => x.nr_sequencia === id) ||
    (chamadoAvulso && chamadoAvulso.nr_sequencia === id ? chamadoAvulso : null);
}

// classe/cor do badge de idade
function ageBucket(dias) {
  if (dias <= 2) return { cls: "age-novo", aging: "" };
  if (dias <= 7) return { cls: "age-ok", aging: "" };
  if (dias <= 15) return { cls: "age-warn", aging: "" };
  if (dias <= 90) return { cls: "age-high", aging: "aging-high" };
  return { cls: "age-crit", aging: "aging-crit" };
}
function ageLabel(dias) {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "1 dia";
  if (dias < 60) return dias + " dias";
  const meses = Math.floor(dias / 30);
  if (meses < 24) return meses + " meses";
  return Math.floor(dias / 365) + " anos";
}

// ----------------------------- contato (email / teams) -------------------
// Login do Tasy + domínio => e-mail e conta do Teams (ex.: dcesar -> dcesar@aacd.org.br)
const EMAIL_DOMINIO = "@aacd.org.br";  // ajuste o domínio aqui se necessário
function emailDe(login) {
  login = (login || "").trim();
  return login ? login + EMAIL_DOMINIO : null;
}
function teamsDe(login) {
  const e = emailDe(login);
  return e ? "https://teams.microsoft.com/l/chat/0/0?users=" + encodeURIComponent(e) : null;
}
// ícones SVG (Lucide) — consistentes entre navegadores/SO, herdam currentColor
const SVG_MAIL = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>`;
const SVG_CHAT = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const SVG_CLOCK = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const SVG_USER = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const SVG_CLIP = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
const SVG_LOCK = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
// ícones compactos (card) — stopPropagation p/ não abrir o modal
function commIcons(login) {
  const e = emailDe(login);
  if (!e) return "";
  return `<span class="comm">
    <a href="mailto:${esc(e)}" title="E-mail para ${esc(e)}" aria-label="E-mail para ${esc(e)}" onclick="event.stopPropagation()">${SVG_MAIL}</a>
    <a class="tms" href="${esc(teamsDe(login))}" target="_blank" rel="noopener"
       title="Conversar no Teams com ${esc(e)}" aria-label="Teams com ${esc(e)}" onclick="event.stopPropagation()">${SVG_CHAT}</a>
  </span>`;
}
// linha de contato (modal) com botões rotulados
function commLinha(label, nome, login) {
  const e = emailDe(login);
  const acoes = e
    ? `<a class="comm-btn" href="mailto:${esc(e)}">${SVG_MAIL} Email</a>
       <a class="comm-btn tms" href="${esc(teamsDe(login))}" target="_blank" rel="noopener">${SVG_CHAT} Teams</a>`
    : `<span class="muted">sem usuário p/ contato</span>`;
  return `<div class="contato-row">
    <span class="lbl">${label}</span>
    <span class="nm">${esc(nome || "—")}${e ? ` · <span class="muted">${esc(e)}</span>` : ""}</span>
    <span class="comm-acoes">${acoes}</span>
  </div>`;
}
// ----------------------------- render -------------------------------------
function visivel(c) {
  if (filtroPrio.length && !filtroPrio.includes(c.ie_prioridade)) return false;
  if (filtroSetor.length && !filtroSetor.includes(c.ds_setor_solicitante || "")) return false;
  if (filtroPlanej.length && !filtroPlanej.includes(c.ds_grupo_planej || "")) return false;
  if (filtroTrabalho.length && !filtroTrabalho.includes(c.ds_grupo_trabalho || "")) return false;
  const semExec = execLabel(c) === "Sem Executor";
  if (filtroSemExec && !semExec) return false;
  if (filtroExec.length && !filtroExec.includes(execLabel(c))) return false;
  if (filtroMeusChamados && c.nm_exec_atual !== currentUsername) return false;
  if (filtroIdade !== "0") {
    const d = idadeDias(c);
    if (filtroIdade === "novo") { if (d > 2) return false; }
    else if (d < Number(filtroIdade)) return false;
  }
  if (filtroTexto) {
    const blob = [
      c.nr_sequencia, c.ds_dano_breve, c.nm_solicitante, c.nm_pessoa_solicitante,
      c.ds_setor_solicitante, c.ds_usuario_exec_correto, c.ds_situacao,
    ].join(" ").toLowerCase();
    if (!blob.includes(filtroTexto)) return false;
  }
  return true;
}

function ordenar(itens) {
  const arr = itens.slice();
  if (ordenacao === "recentes") {
    arr.sort((a, b) => new Date(b.dt_ordem_servico) - new Date(a.dt_ordem_servico));
  } else if (ordenacao === "antigos") {
    arr.sort((a, b) => new Date(a.dt_ordem_servico) - new Date(b.dt_ordem_servico));
  } else if (ordenacao === "prioridade") {
    arr.sort((a, b) =>
      (PRIO_ORDEM[a.ie_prioridade] ?? 9) - (PRIO_ORDEM[b.ie_prioridade] ?? 9) ||
      new Date(a.dt_ordem_servico) - new Date(b.dt_ordem_servico));
  }
  return arr;
}

const PRIO_COLOR = { E: "var(--p-emerg)", U: "var(--p-emerg)", A: "var(--p-alta)", M: "var(--p-media)", B: "var(--p-baixa)", S: "var(--p-sem)" };
const PRIO_LABEL = Object.fromEntries(PRIORIDADES.map((p) => [p.v, p.t]));

function cardHTML(c) {
  const semExec = execLabel(c) === "Sem Executor";
  const execNome = semExec ? "Sem responsável" : c.ds_usuario_exec_correto;
  const dias = idadeDias(c);
  const bucket = ageBucket(dias);
  const novo = isNovo(c);
  const equipe = equipeCurta(c.ds_grupo_trabalho);
  const cor = avatarColor(execNome);
  const prioCor = PRIO_COLOR[c.ie_prioridade] || "var(--p-sem)";
  const prioLabel = PRIO_LABEL[c.ie_prioridade] || "Sem prioridade";
  const ro = !podeTrabalhar(c);  // somente consulta: sem vínculo com o grupo de trabalho
  return `
  <div class="card prio-${esc(c.ie_prioridade)} ${bucket.aging} ${ro ? "card-ro" : ""}" data-id="${c.nr_sequencia}" draggable="${ro ? "false" : "true"}" title="${ro ? "Somente consulta — você não pertence ao grupo de trabalho deste chamado" : "Chamado #" + c.nr_sequencia}">
    <div class="c-head">
      <span class="prio-pill" style="background:color-mix(in srgb, ${prioCor} 17%, transparent);color:${prioCor}">
        <span class="dot" style="background:${prioCor}"></span>${esc(prioLabel)}
      </span>
      <span class="c-badges">
        ${ro ? `<span class="ro-tag" title="Somente consulta — sem vínculo com o grupo de trabalho">${SVG_LOCK}</span>` : ""}
        ${novo ? `<span class="novo-tag">NOVO</span>` : ""}
        <span class="age-tag ${bucket.cls}" title="Aberto há ${ageLabel(dias)}">${SVG_CLOCK}${esc(ageLabel(dias))}</span>
      </span>
    </div>
    <div class="title">${esc(c.ds_dano_breve || "(sem descrição)")}</div>
    <div class="c-meta">
      <span class="who">
        ${SVG_USER}
        <span class="who-nm">${esc(c.nm_solicitante || c.nm_usuario_solic || "—")}</span>
        ${commIcons(c.nm_usuario_solic)}
      </span>
      <span class="setor">${esc(c.ds_setor_solicitante || "—")}</span>
    </div>
    <div class="c-foot">
      <span class="exec ${semExec ? "sem" : ""}">
        <span class="avatar" style="${semExec ? "" : `background:${cor}`}">${iniciais(semExec ? "" : execNome)}</span>
        <span class="nm">${esc(execNome)}</span>
        ${semExec ? "" : commIcons(c.nm_exec_atual)}
      </span>
      <span class="c-tags">
        ${(c.qt_anexos || 0) > 0 ? `<span class="icon-badge" title="${c.qt_anexos} anexo(s)">${SVG_CLIP}${c.qt_anexos}</span>` : ""}
        ${equipe ? `<span class="team-tag" title="${esc(c.ds_grupo_trabalho)}">${esc(equipe)}</span>` : ""}
      </span>
    </div>
  </div>`;
}

function render() {
  const board = $("#board");
  let totalVisivel = 0;
  board.innerHTML = COLUNAS.map((col) => {
    const itens = ordenar(
      CHAMADOS.filter((c) => c.ie_status_ordem === col.id && visivel(c))
    );
    totalVisivel += itens.length;
    const corpo = itens.length
      ? itens.map(cardHTML).join("")
      : `<div class="cards-empty">Nenhum chamado aqui</div>`;
    return `
    <section class="column col-${col.key}">
      <div class="column-head">
        <span class="col-title"><span class="sdot"></span>${col.label}</span>
        <span class="count">${itens.length}</span>
      </div>
      <div class="cards" data-status="${col.id}">${corpo}</div>
    </section>`;
  }).join("");

  renderKPIs();
  const fc = $("#filter-count");
  if (fc) fc.textContent = `${totalVisivel} de ${CHAMADOS.length} chamados`;

  // drag & drop
  board.querySelectorAll(".cards").forEach((cont) => {
    new Sortable(cont, {
      group: "kanban",
      animation: 0,          // sem reanimar a lista (evita lag com muitos cards)
      delay: 0,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      fallbackTolerance: 4,
      filter: ".card-ro",     // sem vínculo com o grupo -> não arrasta (só consulta)
      preventOnFilter: false, // mas ainda deixa o clique abrir o modal
      onStart: () => { arrastando = true; },
      onEnd: (evt) => { arrastando = false; onDrop(evt); },
    });
  });
  // abrir modal ao clicar (ignora cliques nos links de contato)
  board.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      abrirModal(parseInt(el.dataset.id, 10));
    });
  });

  // mantém as demais views (home.js/cockpit.js) sincronizadas com o store
  if (typeof viewAtual === "function") {
    const v = viewAtual();
    if (v === "inicio" && typeof renderHome === "function") renderHome();
    if (v === "cockpit" && typeof renderCockpit === "function") renderCockpit();
  }
}

// ----------------------------- KPIs (filtros rápidos) ----------------------
// Abertos/Processo já aparecem nos cabeçalhos das colunas — não repetidos
// aqui. Só os 3 sinalizadores de atenção que também funcionam como filtro
// de 1 clique (mesma linguagem visual das filas do Cockpit: ícone + rótulo +
// contador).
const KPI_DEFS = [
  { key: "semresp", label: "Sem responsável", color: "#7c6cff", icon: SVG_USERX, action: "semexec",
    calc: (c) => c.ie_status_ordem !== 3 && execLabel(c) === "Sem Executor" },
  { key: "atrasados", label: "Atrasados +7d", color: "var(--p-emerg)", icon: SVG_TIMER, action: "idade7",
    calc: (c) => c.ie_status_ordem !== 3 && idadeDias(c) > 7 },
  { key: "novos", label: "Novos (≤2d)", color: "var(--st-encerrada)", icon: SVG_SPARKLES, action: "novo",
    calc: (c) => c.ie_status_ordem !== 3 && isNovo(c) },
];

function kpiAtivo(def) {
  if (def.action === "semexec") return filtroSemExec;
  if (def.action === "idade7") return filtroIdade === "7";
  if (def.action === "novo") return filtroIdade === "novo";
  return false;
}

function renderKPIs() {
  const box = $("#kpis");
  if (!box) return;
  box.innerHTML = KPI_DEFS.map((def) => {
    const n = CHAMADOS.filter(def.calc).length;
    const active = kpiAtivo(def) ? "active" : "";
    return `<button type="button" class="kpi ${active}" data-kpi="${def.key}">
      <span class="kpi-icon" style="background:color-mix(in srgb, ${def.color} 15%, transparent);color:${def.color}">${def.icon}</span>
      <span class="kpi-lbl">${esc(def.label)}</span>
      <span class="kpi-count ${active}">${n}</span>
    </button>`;
  }).join("");
  box.querySelectorAll(".kpi").forEach((el) => {
    el.addEventListener("click", () => onKpiClick(el.dataset.kpi));
  });
}

function onKpiClick(key) {
  const def = KPI_DEFS.find((d) => d.key === key);
  if (!def) return;
  if (def.action === "semexec") {
    filtroSemExec = !filtroSemExec;
    $("#filtro-semexec").checked = filtroSemExec;
  } else if (def.action === "idade7") {
    filtroIdade = filtroIdade === "7" ? "0" : "7";
    $("#filtro-idade").value = filtroIdade;
  } else if (def.action === "novo") {
    filtroIdade = filtroIdade === "novo" ? "0" : "novo";
    $("#filtro-idade").value = filtroIdade;
  }
  salvarFiltros();
  render();
}

// ----------------------------- filtros padrão por usuário -----------------
function _padraoKey() {
  return currentUsername ? "kanban_padrao_v1_" + currentUsername : null;
}

function salvarFiltrosPadrao() {
  const key = _padraoKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      filtroPrio, filtroSetor, filtroExec, filtroPlanej, filtroTrabalho,
      filtroIdade, filtroSemExec, filtroMeusChamados, ordenacao,
    }));
    const btn = $("#salvar-padrao");
    if (btn) btn.classList.add("tem-padrao");
    toast("Filtros padrão salvos");
  } catch {}
}

function restaurarFiltrosPadrao() {
  const key = _padraoKey();
  if (!key) return;
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (!s) return;
    if (Array.isArray(s.filtroPrio)) filtroPrio = s.filtroPrio;
    if (Array.isArray(s.filtroSetor)) filtroSetor = s.filtroSetor;
    if (Array.isArray(s.filtroExec)) filtroExec = s.filtroExec;
    if (Array.isArray(s.filtroPlanej)) filtroPlanej = s.filtroPlanej;
    if (Array.isArray(s.filtroTrabalho)) filtroTrabalho = s.filtroTrabalho;
    if (typeof s.filtroIdade === "string") filtroIdade = s.filtroIdade;
    if (typeof s.filtroSemExec === "boolean") filtroSemExec = s.filtroSemExec;
    if (typeof s.filtroMeusChamados === "boolean") filtroMeusChamados = s.filtroMeusChamados;
    if (typeof s.ordenacao === "string") ordenacao = s.ordenacao;
    // sync elementos simples (multi-selects são sincronizados por popularFiltrosDinamicos no próximo render)
    msPrio.setValue(filtroPrio); msSetor.setValue(filtroSetor); msExec.setValue(filtroExec);
    msPlanej.setValue(filtroPlanej); msTrabalho.setValue(filtroTrabalho);
    const elSemExec = $("#filtro-semexec"); if (elSemExec) elSemExec.checked = filtroSemExec;
    const elOrd = $("#ordenacao"); if (elOrd) elOrd.value = ordenacao;
    if (filtroMeusChamados) { const b = $("#meus-chamados"); if (b) b.classList.add("ativo"); }
    const btnP = $("#salvar-padrao"); if (btnP) btnP.classList.add("tem-padrao");
    if (CHAMADOS.length > 0) render(); // aplica imediatamente se dados já carregados
  } catch {}
}

// ----------------------------- persistência de filtros --------------------
const FILTROS_KEY = "kanban_chamados_filtros_v1";
function salvarFiltros() {
  try {
    localStorage.setItem(FILTROS_KEY, JSON.stringify({
      filtroTexto, filtroPrio, filtroSetor, filtroExec, filtroPlanej, filtroTrabalho,
      filtroIdade, filtroSemExec, ordenacao,
    }));
  } catch {}
}
function restaurarFiltros() {
  try {
    const s = JSON.parse(localStorage.getItem(FILTROS_KEY) || "{}");
    if (typeof s.filtroTexto === "string") filtroTexto = s.filtroTexto;
    if (Array.isArray(s.filtroPrio)) filtroPrio = s.filtroPrio;
    if (Array.isArray(s.filtroSetor)) filtroSetor = s.filtroSetor;
    if (Array.isArray(s.filtroExec)) filtroExec = s.filtroExec;
    if (Array.isArray(s.filtroPlanej)) filtroPlanej = s.filtroPlanej;
    if (Array.isArray(s.filtroTrabalho)) filtroTrabalho = s.filtroTrabalho;
    if (typeof s.filtroIdade === "string") filtroIdade = s.filtroIdade;
    if (typeof s.filtroSemExec === "boolean") filtroSemExec = s.filtroSemExec;
    if (typeof s.ordenacao === "string") ordenacao = s.ordenacao;
  } catch {}
  // reflete nos controles
  $("#busca").value = filtroTexto;
  msPrio.setValue(filtroPrio); msSetor.setValue(filtroSetor); msExec.setValue(filtroExec);
  msPlanej.setValue(filtroPlanej); msTrabalho.setValue(filtroTrabalho);
  $("#filtro-idade").value = filtroIdade;
  $("#ordenacao").value = ordenacao;
  $("#filtro-semexec").checked = filtroSemExec;
}

// ----------------------------- atribuição ---------------------------------
// Diálogo que pede o executor (com autocomplete). Resolve com nm_usuario ou null.
function pedirExecutor(id, msg) {
  return new Promise((resolve) => {
    const modal = $("#exec-modal");
    const inp = $("#x-exec");
    const erro = $("#x-erro");
    $("#x-num").textContent = "#" + id;
    if (msg) $("#x-msg").innerHTML = msg;
    inp.value = "";
    $("#x-exec-opts").classList.add("hidden");
    erro.classList.add("hidden");
    modal.classList.remove("hidden");
    setTimeout(() => inp.focus(), 50);

    function limpar() {
      $("#x-confirm").removeEventListener("click", ok);
      $("#x-cancel").removeEventListener("click", cancel);
      modal.removeEventListener("click", fora);
      modal.classList.add("hidden");
    }
    function ok() {
      const v = inp.value.trim();
      if (!v) { erro.classList.remove("hidden"); inp.focus(); return; }
      limpar(); resolve(v);
    }
    function cancel() { limpar(); resolve(null); }
    function fora(e) { if (e.target === modal) cancel(); }

    $("#x-confirm").addEventListener("click", ok);
    $("#x-cancel").addEventListener("click", cancel);
    modal.addEventListener("click", fora);
  });
}

// ----------------------------- encerramento -------------------------------
// Diálogo que pede a solução; resolve com o texto, ou null se cancelar.
function pedirEncerramento(id) {
  return new Promise((resolve) => {
    const modal = $("#close-modal");
    const ta = $("#c-relato");
    const erro = $("#c-erro");
    $("#c-num").textContent = "#" + id;
    ta.value = "";
    erro.classList.add("hidden");
    modal.classList.remove("hidden");
    setTimeout(() => ta.focus(), 50);

    function limpar() {
      $("#c-confirm").removeEventListener("click", ok);
      $("#c-cancel").removeEventListener("click", cancel);
      modal.removeEventListener("click", fora);
      modal.classList.add("hidden");
    }
    function ok() {
      const txt = ta.value.trim();
      if (!txt) { erro.classList.remove("hidden"); ta.focus(); return; }
      limpar(); resolve(txt);
    }
    function cancel() { limpar(); resolve(null); }
    function fora(e) { if (e.target === modal) cancel(); }

    $("#c-confirm").addEventListener("click", ok);
    $("#c-cancel").addEventListener("click", cancel);
    modal.addEventListener("click", fora);
  });
}

// Reabre um chamado (status -> Aberta). Correção rápida para encerramento por engano.
// Obs.: traz o card de volta ao fluxo, mas NÃO apaga o relato técnico já gravado.
async function reabrirChamado(id) {
  try {
    await api(`/api/chamados/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ie_status_ordem: 1 }),
    });
    toast(`Chamado #${id} reaberto`);
    await carregar();
  } catch (e) {
    toast("Erro ao reabrir: " + e.message, true);
  }
}

// Encerra via API. execOpcional atribui o executor junto (quando não havia).
async function encerrarChamado(id, relato, execOpcional) {
  const body = { ie_status_ordem: 3, ds_relato: relato };
  if (execOpcional) body.nm_usuario_exec = execOpcional;
  return api(`/api/chamados/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Garante que quem está encerrando é o executor do chamado (regra: só o
// executor pode encerrar). Sem executor definido -> pede um (fluxo normal).
// Executor é outra pessoa -> pergunta se o usuário quer assumir o chamado
// (única forma de encerrá-lo). Retorna o login do executor final, ou null
// se o usuário cancelou/recusou assumir.
async function garantirExecutorParaEncerrar(id, execAtual) {
  const c = obterChamado(id);
  let exec = (execAtual || "").trim() || c?.nm_exec_atual || null;
  if (!exec) {
    return await pedirExecutor(id,
      "Defina o <b>executor</b> responsável pelo atendimento antes de encerrar.");
  }
  if (currentUsername && exec !== currentUsername) {
    const nomeAtual = c?.ds_exec_atual || exec;
    const assumir = confirm(
      `Este chamado está sob responsabilidade de ${nomeAtual}.\n` +
      `Só o executor pode encerrar o chamado. Deseja assumi-lo para poder encerrá-lo?`
    );
    return assumir ? currentUsername : null;
  }
  return exec;
}

// Fluxo único de encerramento (usado pelo drag E pelo botão do modal):
// garante o executor (assumindo se necessário), pede a solução e encerra.
// Retorna true se encerrou, false se o usuário cancelou. Lança em erro de
// API (quem chama trata).
async function fluxoEncerrar(id, execSugerido) {
  const c = obterChamado(id);
  const exec = await garantirExecutorParaEncerrar(id, execSugerido);
  if (!exec) return false;
  const relato = await pedirEncerramento(id);
  if (!relato) return false;
  // só envia o executor p/ atribuir se for diferente do atual
  const execEnvia = exec !== (c?.nm_exec_atual || "") ? exec : null;
  await encerrarChamado(id, relato, execEnvia);
  toast(`Chamado #${id} encerrado`, false, { label: "Reabrir", fn: () => reabrirChamado(id) });
  return true;
}

// ----------------------------- ações --------------------------------------
async function onDrop(evt) {
  const id = parseInt(evt.item.dataset.id, 10);
  const novoStatus = parseInt(evt.to.dataset.status, 10);
  const antigo = parseInt(evt.from.dataset.status, 10);
  if (novoStatus === antigo) return;

  const chamado = CHAMADOS.find((c) => c.nr_sequencia === id);
  if (!podeTrabalhar(chamado)) {
    toast("Somente consulta: você não pertence ao grupo de trabalho deste chamado.", true);
    render();  // reverte a posição do card
    return;
  }
  const temExec = !!chamado.nm_exec_atual;
  try {
    // Processo exige executor: se não tem, pede antes de mover
    if (novoStatus === 2 && !temExec) {
      const exec = await pedirExecutor(id,
        "Defina o <b>executor</b> para colocar o chamado em <b>Processo</b>. Obrigatório.");
      if (!exec) { render(); return; }  // cancelou -> reverte local (sem recarregar)
      await api(`/api/chamados/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ie_status_ordem: 2, nm_usuario_exec: exec }),
      });
      toast(`Chamado #${id} → Processo (resp.: ${exec})`);
      await carregar();
      return;
    }

    // Encerrar exige solução e executor (fluxo único compartilhado)
    if (novoStatus === 3) {
      const ok = await fluxoEncerrar(id);
      if (!ok) { render(); return; }   // cancelou -> reverte local (sem recarregar)
      await carregar();
      return;
    }

    // demais transições (ex.: reabrir -> Aberta)
    const upd = await api(`/api/chamados/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ie_status_ordem: novoStatus }),
    });
    chamado.ie_status_ordem = Number(upd.ie_status_ordem);
    chamado.ds_situacao = upd.ds_situacao;
    toast(`Chamado #${id} → ${upd.ds_situacao}`);
    render();
  } catch (e) {
    toast("Erro ao mover: " + e.message, true);
    await carregar();
  }
}

// Busca global por número: o quadro só carrega chamados abertos ou encerrados
// há poucos dias (ver config.DIAS_ENCERRADAS no backend); pra achar um chamado
// mais antigo (fechado há meses/anos), busca direto na API quando o texto
// digitado é só um número que não está entre os já carregados.
let buscaGlobalTimer = null;
let buscaGlobalUltimoTermo = null;
function buscaGlobalPorNumero(termo) {
  clearTimeout(buscaGlobalTimer);
  const num = (termo || "").trim();
  if (!/^\d+$/.test(num) || num === buscaGlobalUltimoTermo) return;
  if (CHAMADOS.some((c) => String(c.nr_sequencia) === num)) return;  // já está no quadro
  buscaGlobalTimer = setTimeout(async () => {
    buscaGlobalUltimoTermo = num;
    try {
      const c = await api(`/api/chamados/${num}`);
      toast(`Chamado #${num} encontrado fora do quadro (${c.ds_situacao || "—"})`, false,
        { label: "Abrir", fn: () => abrirChamadoAvulso(c) });
    } catch (e) { /* 404 = não existe ou não é da TI -> silencioso, sem toast de erro */ }
  }, 450);
}

// Abre o modal de um chamado achado pela busca global (não está em CHAMADOS,
// já que ficou fora da janela do quadro) — guarda em chamadoAvulso pra as
// demais ações do modal (salvar, encerrar) conseguirem lê-lo.
function abrirChamadoAvulso(c) {
  c.ie_status_ordem = Number(c.ie_status_ordem);  // mesma normalização de carregar()
  chamadoAvulso = c;
  abrirModal(c.nr_sequencia);
}

function abrirModal(id) {
  const c = obterChamado(id);
  if (!c) return;
  modalAtual = id;
  $("#m-num").textContent = "#" + id;
  $("#m-meta").innerHTML = `
    <b>Solicitante:</b> ${esc(c.nm_solicitante || c.nm_pessoa_solicitante || "—")} ·
    <b>Setor:</b> ${esc(c.ds_setor_solicitante || "—")}<br>
    <b>Abertura:</b> ${esc(fmtData(c.dt_ordem_servico))} ·
    <b>Atualização:</b> ${esc(fmtData(c.dt_atualizacao))}`;
  $("#m-breve").value = c.ds_dano_breve || "";
  $("#m-dano").value = c.ds_dano || "";
  $("#m-prio").value = c.ie_prioridade || "";
  $("#m-status").value = c.ie_status_ordem;
  if (buscaEstagioModal) buscaEstagioModal.setValor(c.nr_seq_estagio);
  $("#m-estagio-opts").classList.add("hidden");
  // grupo de planejamento/trabalho (transferência) — cascata a partir do atual
  $("#m-planej").value = c.nr_grupo_planej != null ? String(c.nr_grupo_planej) : "";
  atualizarGruposTrabalhoModal();
  $("#m-trab").value = c.nr_grupo_trabalho != null ? String(c.nr_grupo_trabalho) : "";
  // contato (email / teams) do solicitante e do responsável
  const semExecModal = execLabel(c) === "Sem Executor" && !c.nm_exec_atual;
  $("#m-contato").innerHTML =
    commLinha("Solicitante", c.nm_solicitante || c.nm_usuario_solic, c.nm_usuario_solic) +
    commLinha("Responsável", semExecModal ? null : (c.ds_exec_atual || c.ds_usuario_exec_correto), c.nm_exec_atual);

  // executor atual REAL (lido de MAN_ORDEM_SERVICO_EXEC)
  $("#m-exec").value = c.nm_exec_atual || "";
  $("#m-exec-nome").textContent = c.nm_exec_atual
    ? (c.ds_exec_atual || c.nm_exec_atual)
    : "Sem executor definido";
  carregarAnexos(id);
  carregarHistorico(id);
  $("#m-nota").value = "";
  aplicarModoConsultaModal(!podeTrabalhar(c));
  $("#modal").classList.remove("hidden");
}

// Modo "somente consulta" do modal: sem vínculo com o grupo de trabalho do
// chamado, desabilita edição/encerramento/interação e mostra um aviso. O
// modal continua abrindo normalmente para leitura (histórico, anexos, etc.).
function aplicarModoConsultaModal(ro) {
  ["m-breve", "m-dano", "m-prio", "m-status", "m-planej", "m-trab",
   "m-exec", "m-estagio-texto", "m-nota"].forEach((id) => {
    const el = $("#" + id); if (el) el.disabled = ro;
  });
  ["m-save", "m-encerrar", "m-nota-add"].forEach((id) => {
    const el = $("#" + id); if (el) el.style.display = ro ? "none" : "";
  });
  const aviso = $("#m-readonly");
  if (aviso) aviso.classList.toggle("hidden", !ro);
}

// histórico de interação (MAN_ORDEM_SERV_TECNICO) — log completo, não só a
// solução de encerramento: perguntas, atualizações, respostas do solicitante.
function historicoItemHTML(h) {
  const nome = h.nm_completo || h.nm_usuario || "—";
  const cor = avatarColor(nome);
  const paragrafos = (h.ds_relat_tecnico || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const corpo = paragrafos.length
    ? paragrafos.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
    : `<p class="muted">(sem texto)</p>`;
  // "minhas" interações (do usuário logado) vão pra direita, estilo chat;
  // as dos outros (solicitante/colegas) ficam à esquerda.
  const mine = !!(currentUsername && h.nm_usuario === currentUsername);
  return `<li class="historico-item${mine ? " hi-mine" : ""}">
    <span class="avatar hi-avatar" style="background:${cor}">${esc(iniciais(nome))}</span>
    <div class="hi-bolha">
      <div class="hi-head">
        <span class="hi-nome">${esc(nome)}</span>
        <span class="hi-data">${esc(fmtData(h.dt))}</span>
      </div>
      <div class="hi-texto">${corpo}</div>
    </div>
  </li>`;
}

async function carregarHistorico(id) {
  const ul = $("#m-historico");
  const cnt = $("#m-historico-count");
  ul.innerHTML = `<li class="vazio">carregando…</li>`;
  cnt.textContent = "…";
  try {
    const { historico } = await api(`/api/chamados/${id}/historico`);
    cnt.textContent = historico.length;
    ul.innerHTML = historico.length
      ? historico.map(historicoItemHTML).join("")
      : `<li class="vazio">Nenhuma interação registrada ainda.</li>`;
    ul.scrollTop = ul.scrollHeight;  // mostra a mais recente
  } catch (e) {
    ul.innerHTML = `<li class="vazio">Erro ao carregar o histórico: ${esc(e.message)}</li>`;
    cnt.textContent = "!";
  }
}

async function adicionarNota() {
  if (!modalAtual) return;
  const id = modalAtual;
  const ta = $("#m-nota");
  const texto = ta.value.trim();
  if (!texto) { toast("Escreva algo antes de adicionar.", true); ta.focus(); return; }
  try {
    await api(`/api/chamados/${id}/relato`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ds_relato: texto }),
    });
    ta.value = "";
    await carregarHistorico(id);
    toast("Interação adicionada ao histórico");
  } catch (e) {
    toast("Erro ao adicionar: " + e.message, true);
  }
}

async function carregarAnexos(id) {
  const ul = $("#m-anexos");
  const cnt = $("#m-anexos-count");
  ul.innerHTML = `<li class="vazio">carregando…</li>`;
  cnt.textContent = "…";
  try {
    const { anexos } = await api(`/api/chamados/${id}/anexos`);
    cnt.textContent = anexos.length;
    if (!anexos.length) {
      ul.innerHTML = `<li class="vazio">Nenhum anexo neste chamado.</li>`;
      return;
    }
    ul.innerHTML = anexos.map((a) => {
      const nome = a.nome_arquivo || "(arquivo)";
      const ext = (nome.includes(".") ? nome.split(".").pop() : "").slice(0, 5);
      return `<li>
        <span class="fn"><span class="ext">${esc(ext)}</span>${esc(nome)}</span>
        <span class="by">por ${esc(a.nm_usuario)} · ${esc(fmtData(a.dt_atualizacao))}</span>
      </li>`;
    }).join("");
  } catch (e) {
    ul.innerHTML = `<li class="vazio">Erro ao carregar anexos: ${esc(e.message)}</li>`;
    cnt.textContent = "!";
  }
}

function fecharModal() {
  $("#modal").classList.add("hidden");
  modalAtual = null;
  chamadoAvulso = null;
}

async function salvarModal() {
  if (!modalAtual) return;
  const id = modalAtual;
  const c = obterChamado(id);
  const payload = {
    ds_dano_breve: $("#m-breve").value,
    ds_dano: $("#m-dano").value,
    ie_prioridade: $("#m-prio").value,
  };
  // só envia executor se mudou (evita inserir apontamento repetido)
  const execNovo = $("#m-exec").value.trim();
  if (execNovo !== (c.nm_exec_atual || "")) payload.nm_usuario_exec = execNovo;
  // grupo de planejamento (obrigatório) e de trabalho (opcional) — só envia o
  // que mudou, mesma lógica do executor
  const estagioNovo = $("#m-estagio-id").value;
  const estagioAtual = c.nr_seq_estagio != null ? String(c.nr_seq_estagio) : "";
  if (estagioNovo !== estagioAtual) payload.nr_seq_estagio = estagioNovo ? parseInt(estagioNovo, 10) : null;
  const planejNovo = $("#m-planej").value;
  if (!planejNovo) {
    toast("Selecione o grupo de planejamento.", true);
    $("#m-planej").focus();
    return;
  }
  const planejAtual = c.nr_grupo_planej != null ? String(c.nr_grupo_planej) : "";
  if (planejNovo !== planejAtual) payload.nr_grupo_planej = parseInt(planejNovo, 10);
  const trabNovo = $("#m-trab").value;
  const trabAtual = c.nr_grupo_trabalho != null ? String(c.nr_grupo_trabalho) : "";
  if (trabNovo !== trabAtual) payload.nr_grupo_trabalho = trabNovo ? parseInt(trabNovo, 10) : null;
  const novoStatus = parseInt($("#m-status").value, 10);
  let execEfetivo = execNovo || "";  // o que ficará após salvar (campo do modal)
  // Processo/Encerrada SEMPRE exigem executor (inclusive ao editar sem mudar status)
  if ((novoStatus === 2 || novoStatus === 3) && !execEfetivo) {
    toast(novoStatus === 3
      ? "Defina o responsável antes de encerrar."
      : "Chamado em Processo precisa ter um executor.", true);
    $("#m-exec").focus();
    return;
  }
  // Status vai JUNTO dos campos no mesmo PATCH -> uma única UPDATE na OS
  // (antes eram 2 requests, o que disparava o trigger de e-mail 2x).
  const mudouStatus = novoStatus !== c.ie_status_ordem;
  const acabouDeEncerrar = (novoStatus === 3 && c.ie_status_ordem !== 3);
  if (acabouDeEncerrar) {
    // Encerrar pelo select exige ser o executor (ou assumir o chamado) + a solução
    const execFinal = await garantirExecutorParaEncerrar(id, execEfetivo);
    if (!execFinal) return;  // não é o executor e não quis assumir -> não salva
    if (execFinal !== execEfetivo) {
      execEfetivo = execFinal;
      $("#m-exec").value = execFinal;
      payload.nm_usuario_exec = execFinal;
    }
    const relato = await pedirEncerramento(id);
    if (!relato) return;  // cancelou o encerramento -> não salva
    payload.ie_status_ordem = 3;
    payload.ds_relato = relato;
  } else if (mudouStatus) {
    payload.ie_status_ordem = novoStatus;  // Aberta/Processo na mesma UPDATE
  }
  try {
    await api(`/api/chamados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    toast(`Chamado #${id} salvo`);
    fecharModal();
    await carregar();
  } catch (e) {
    toast("Erro ao salvar: " + e.message, true);
  }
}

async function encerrarModal() {
  if (!modalAtual) return;
  const id = modalAtual;
  try {
    const ok = await fluxoEncerrar(id, $("#m-exec").value);
    if (!ok) return;  // cancelou
    fecharModal();
    await carregar();
  } catch (e) {
    toast("Erro ao encerrar: " + e.message, true);
  }
}

// ----------------------------- busca de usuário (solicitante/executor) -----
// Busca no banco (nome ou login) com dropdown próprio, em vez de <datalist>:
// datalist pode vir bloqueado por política de navegador no ambiente
// corporativo, dando a impressão de que a busca "não funciona" mesmo com o
// backend respondendo certo. onSelecionar(usuario|null) é chamado a cada
// seleção (null quando o texto muda e a seleção anterior deixa de valer).
function criarBuscaUsuario(prefixo, onSelecionar) {
  const texto = $(`#${prefixo}`);
  const opts = $(`#${prefixo}-opts`);
  if (!texto || !opts) return;
  let itensAtuais = [];
  let timer = null;

  function mostrar(html) { opts.innerHTML = html; opts.classList.remove("hidden"); }

  async function buscar(termo) {
    if (termo.trim().length < 2) { opts.classList.add("hidden"); return; }
    mostrar(`<li class="vazio">buscando…</li>`);
    try {
      const { usuarios } = await api("/api/usuarios?q=" + encodeURIComponent(termo.trim()));
      itensAtuais = usuarios;
      mostrar(usuarios.length
        ? usuarios.map((u, i) => `<li data-i="${i}">${esc(u.nm_completo)} <span class="muted">— ${esc(u.nm_usuario)}</span></li>`).join("")
        : `<li class="vazio">Nenhum usuário encontrado.</li>`);
    } catch (e) {
      mostrar(`<li class="vazio">Erro na busca.</li>`);
    }
  }
  texto.addEventListener("input", () => {
    clearTimeout(timer);
    if (onSelecionar) onSelecionar(null);
    const v = texto.value;
    timer = setTimeout(() => buscar(v), 250);
  });
  texto.addEventListener("focus", () => { if (texto.value.trim().length >= 2) buscar(texto.value); });
  texto.addEventListener("blur", () => setTimeout(() => opts.classList.add("hidden"), 150));
  opts.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    const u = itensAtuais[Number(li.dataset.i)];
    if (!u) return;
    texto.value = u.nm_usuario;
    opts.classList.add("hidden");
    if (onSelecionar) onSelecionar(u);
  });
}

// ----------------------------- estágio do processo -------------------------
// Campo de busca (não <select>) porque alguns rótulos se repetem (ex.: dois
// "Aguardando Fornecedor" com IDs diferentes) — precisa manter o ID real
// separado do texto exibido, sem ambiguidade.
let ESTAGIOS = [];  // [{nr_sequencia, ds}]

async function carregarEstagios() {
  try {
    const { estagios } = await api("/api/estagios");
    ESTAGIOS = estagios;
  } catch (e) { /* silencioso — ex.: grant pendente no Oracle */ }
}

function estagioNome(id) {
  const e = ESTAGIOS.find((x) => String(x.nr_sequencia) === String(id));
  return e ? e.ds : "";
}

// Fábrica do combo de busca de estágio — usada tanto no modal do Kanban
// (elementos estáticos, montada 1x) quanto no painel do Cockpit (elementos
// recriados a cada renderDetail(), precisa remontar a cada chamada).
// prefixo "m" -> #m-estagio-texto/-id/-opts; prefixo "cp" -> #cp-estagio-*.
function criarBuscaEstagio(prefixo) {
  const texto = $(`#${prefixo}-estagio-texto`);
  const idInput = $(`#${prefixo}-estagio-id`);
  const opts = $(`#${prefixo}-estagio-opts`);
  if (!texto || !idInput || !opts) return null;

  function render(filtro) {
    const termo = (filtro || "").toLowerCase().trim();
    const itens = termo ? ESTAGIOS.filter((e) => e.ds.toLowerCase().includes(termo)) : ESTAGIOS;
    const opcoes = [`<li data-id="">(nenhum)</li>`].concat(
      itens.length
        ? itens.slice(0, 50).map((e) => `<li data-id="${e.nr_sequencia}">${esc(e.ds)}</li>`)
        : [`<li class="vazio">Nenhum estágio encontrado.</li>`]
    );
    opts.innerHTML = opcoes.join("");
    opts.classList.remove("hidden");
  }
  function setValor(id) {
    idInput.value = id != null ? String(id) : "";
    texto.value = id != null ? estagioNome(id) : "";
  }
  texto.addEventListener("input", () => render(texto.value));
  texto.addEventListener("focus", () => render(texto.value));
  texto.addEventListener("blur", () => {
    // atraso pra deixar o click no <li> disparar antes do blur fechar a lista
    setTimeout(() => {
      const nomeEsperado = estagioNome(idInput.value);
      if (texto.value !== nomeEsperado) texto.value = nomeEsperado;
      opts.classList.add("hidden");
    }, 150);
  });
  opts.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    setValor(li.dataset.id || null);
    opts.classList.add("hidden");
  });
  return { setValor, getValor: () => idInput.value || null };
}

// ----------------------------- novo chamado -------------------------------
let GRUPOS = { planej: [], trabalho: [] };
let solicSelecionado = null;  // usuário escolhido no combo de busca (Novo chamado)

async function carregarGrupos() {
  try {
    GRUPOS = await api("/api/grupos");
    mapaPlanejTrabalho = mapaTrabalhosPorPlanej(GRUPOS);
    const optsPlanej = `<option value="">Selecione…</option>` +
      GRUPOS.planej.map((g) => `<option value="${g.cd}">${esc(g.ds)}</option>`).join("");
    $("#n-planej").innerHTML = optsPlanej;
    $("#m-planej").innerHTML = optsPlanej;
    atualizarGruposTrabalho();
    atualizarGruposTrabalhoModal();
    // se os chamados já carregaram antes dos grupos, recalcula a cascata do filtro
    if (CHAMADOS.length) atualizarOpcoesFiltroTrabalho();
  } catch (e) { /* silencioso */ }
}

// popula o <select> de grupo de trabalho a partir do grupo de planejamento
// selecionado no MESMO formulário (cascata); reaproveitado por "Novo chamado"
// e pela edição/transferência no modal do Kanban.
function popularGruposTrabalho(selPlanej, selTrab) {
  const planej = $(selPlanej).value;
  const opts = GRUPOS.trabalho.filter((t) => String(t.planej) === String(planej));
  $(selTrab).innerHTML = `<option value="">(nenhum)</option>` +
    opts.map((t) => `<option value="${t.cd}">${esc(t.ds)}</option>`).join("");
}
function atualizarGruposTrabalho() { popularGruposTrabalho("#n-planej", "#n-trab"); }
function atualizarGruposTrabalhoModal() { popularGruposTrabalho("#m-planej", "#m-trab"); }

function abrirNovo() {
  solicSelecionado = null;
  $("#n-solic").value = ""; $("#n-solic-info").textContent = "";
  $("#n-solic-opts").classList.add("hidden");
  $("#n-breve").value = ""; $("#n-dano").value = "";
  $("#n-prio").value = "M";
  $("#n-planej").value = ""; atualizarGruposTrabalho();
  $("#n-erro").classList.add("hidden");
  const m = $("#novo-modal .modal"); if (m) m.scrollTop = 0;
  $("#novo-modal").classList.remove("hidden");
  setTimeout(() => $("#n-solic").focus(), 50);
}
function fecharNovo() { $("#novo-modal").classList.add("hidden"); }

function erroNovo(msg) {
  const e = $("#n-erro");
  e.textContent = msg; e.classList.remove("hidden");
  const m = $("#novo-modal .modal");
  if (m) m.scrollTop = m.scrollHeight; // rola até o erro (sempre na base do modal)
}

async function salvarNovo() {
  if (!solicSelecionado) {
    erroNovo("Selecione um solicitante válido da lista.");
    const m = $("#novo-modal .modal"); if (m) m.scrollTop = 0;
    setTimeout(() => { const f = $("#n-solic"); if (f) f.focus(); }, 50);
    return;
  }
  const breve = $("#n-breve").value.trim();
  const dano = $("#n-dano").value.trim();
  const planej = $("#n-planej").value;
  if (!breve) return erroNovo("Informe a descrição breve.");
  if (!dano) return erroNovo("Informe a descrição.");
  if (!planej) return erroNovo("Selecione o grupo de planejamento.");

  const payload = {
    cd_pessoa_solicitante: solicSelecionado.cd_pessoa_fisica,
    ds_dano_breve: breve,
    ds_dano: dano,
    ie_prioridade: $("#n-prio").value,
    nr_grupo_planej: parseInt(planej, 10),
    nr_grupo_trabalho: $("#n-trab").value ? parseInt($("#n-trab").value, 10) : null,
  };
  try {
    const r = await api("/api/chamados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    toast(`Chamado #${r.nr_sequencia} criado`);
    fecharNovo();
    await carregar();
  } catch (e) {
    erroNovo(e.message);
  }
}

// ----------------------------- carga --------------------------------------
// esqueleto de carregamento (só na 1ª carga, quando ainda não há cards)
function renderSkeleton() {
  const board = $("#board");
  if (!board) return;
  board.innerHTML = COLUNAS.map((col) => `
    <section class="column col-${col.key}">
      <div class="column-head">
        <span class="col-title"><span class="sdot"></span>${col.label}</span>
        <span class="count">…</span>
      </div>
      <div class="cards">${'<div class="card-skel"></div>'.repeat(3)}</div>
    </section>`).join("");
}

// assinatura leve do conjunto p/ detectar mudança (evita re-render no auto-refresh)
function assinatura(chamados) {
  return chamados
    .map((c) => `${c.nr_sequencia}:${c.ie_status_ordem}:${c.ie_prioridade}:${c.nm_exec_atual || ""}:${c.dt_atualizacao || ""}`)
    .join("|");
}

let carregando = false;
let ultimaAssinatura = null;
// auto=true: carga silenciosa (sem skeleton/spinner) que só re-renderiza se algo mudou
async function carregar({ auto = false } = {}) {
  if (carregando) return;          // evita recargas concorrentes (ex.: refresh + auto)
  carregando = true;
  const btn = $("#refresh");
  if (!auto && btn) { btn.classList.add("spin"); btn.disabled = true; }
  if (!auto && !CHAMADOS.length) renderSkeleton();
  try {
    const { chamados } = await api("/api/chamados");
    // ie_status_ordem pode vir como string ("1"/"2"/"3") do Oracle — normaliza p/ número
    chamados.forEach((c) => { c.ie_status_ordem = Number(c.ie_status_ordem); });
    const assin = assinatura(chamados);
    if (auto && assin === ultimaAssinatura) return;  // nada mudou: não mexe na tela
    ultimaAssinatura = assin;
    CHAMADOS = chamados;
    popularFiltrosDinamicos();
    render();
  } catch (e) {
    if (!auto) toast("Erro ao carregar chamados: " + e.message, true);
  } finally {
    carregando = false;
    if (!auto && btn) { btn.classList.remove("spin"); btn.disabled = false; }
  }
}

// ----------------------------- auto-refresh -------------------------------
// Recarrega a cada 45s, mas só quando seguro: aba visível, sem drag, sem modal
// aberto e sem digitar na busca. Ambiente multiusuário fica sincronizado.
const AUTO_REFRESH_MS = 45000;
function podeAutoRefresh() {
  if (document.hidden || arrastando || carregando) return false;
  const algumModalAberto = ["#modal", "#novo-modal", "#exec-modal", "#close-modal"]
    .some((m) => { const el = $(m); return el && !el.classList.contains("hidden"); });
  if (algumModalAberto) return false;
  if (document.activeElement === $("#busca")) return false;
  return true;
}
function iniciarAutoRefresh() {
  setInterval(() => { if (podeAutoRefresh()) carregar({ auto: true }); }, AUTO_REFRESH_MS);
  // ao voltar para a aba, atualiza na hora
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && podeAutoRefresh()) carregar({ auto: true });
  });
}

// preenche os multi-selects de setor/responsável/grupos a partir dos dados carregados
function popularFiltrosDinamicos() {
  const setores = [...new Set(CHAMADOS.map((c) => c.ds_setor_solicitante).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const execs = [...new Set(CHAMADOS.map(execLabel))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const planejs = [...new Set(CHAMADOS.map((c) => c.ds_grupo_planej).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  msSetor.setOptions(setores.map((s) => ({ value: s, label: s })));
  msExec.setOptions(execs.map((s) => ({ value: s, label: s })));
  msPlanej.setOptions(planejs.map((s) => ({ value: s, label: s })));
  atualizarOpcoesFiltroTrabalho();
}

// restringe as opções de "Grupo de trabalho" aos vinculados ao(s) grupo(s) de
// planejamento selecionado(s) (via /api/grupos); ressincroniza filtroTrabalho
// caso a restrição derrube alguma seleção que não é mais válida.
function atualizarOpcoesFiltroTrabalho() {
  const todos = [...new Set(CHAMADOS.map((c) => c.ds_grupo_trabalho).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const permitidos = trabalhosPermitidosPorPlanej(mapaPlanejTrabalho, filtroPlanej);
  const disponiveis = permitidos ? todos.filter((t) => permitidos.has(t)) : todos;
  msTrabalho.setOptions(disponiveis.map((s) => ({ value: s, label: equipeCurta(s) })));
  filtroTrabalho = msTrabalho.getValue();
}

// ----------------------------- init ---------------------------------------
function initControles() {
  const aplica = () => { salvarFiltros(); render(); };

  // selects de prioridade (edição/criação continuam de escolha única)
  const optsPrio = PRIORIDADES.map((p) => `<option value="${p.v}">${p.t}</option>`).join("");
  $("#m-prio").innerHTML = optsPrio;
  $("#n-prio").innerHTML = optsPrio;
  $("#m-status").innerHTML = COLUNAS
    .map((c) => `<option value="${c.id}">${c.label}</option>`).join("");

  // filtros de recorte (multi-select)
  msPrio = criarMultiSelect($("#filtro-prio"), { allLabel: "Todas prioridades" });
  msPrio.setOptions(PRIORIDADES.map((p) => ({ value: p.v, label: p.t })));
  msPrio.onChange((vals) => { filtroPrio = vals; aplica(); });

  msSetor = criarMultiSelect($("#filtro-setor"), { allLabel: "Todos os setores" });
  msSetor.onChange((vals) => { filtroSetor = vals; aplica(); });

  msExec = criarMultiSelect($("#filtro-exec"), { allLabel: "Todos responsáveis" });
  msExec.onChange((vals) => { filtroExec = vals; aplica(); });

  msPlanej = criarMultiSelect($("#filtro-planej"), { allLabel: "Todos os grupos de planejamento" });
  msPlanej.onChange((vals) => {
    filtroPlanej = vals;
    atualizarOpcoesFiltroTrabalho();   // recorta "Grupo de trabalho" p/ só os vinculados
    aplica();
  });

  msTrabalho = criarMultiSelect($("#filtro-trabalho"), { allLabel: "Todos os grupos de trabalho" });
  msTrabalho.onChange((vals) => { filtroTrabalho = vals; aplica(); });

  const aplicaBusca = debounce(aplica, 180);  // re-render só após parar de digitar
  $("#busca").addEventListener("input", (e) => {
    filtroTexto = e.target.value.toLowerCase().trim(); aplicaBusca();
    buscaGlobalPorNumero(e.target.value);
  });
  $("#filtro-idade").addEventListener("change", (e) => { filtroIdade = e.target.value; aplica(); });
  $("#ordenacao").addEventListener("change", (e) => { ordenacao = e.target.value; aplica(); });
  $("#filtro-semexec").addEventListener("change", (e) => { filtroSemExec = e.target.checked; aplica(); });
  $("#meus-chamados").addEventListener("click", () => {
    filtroMeusChamados = !filtroMeusChamados;
    $("#meus-chamados").classList.toggle("ativo", filtroMeusChamados);
    render();
  });
  $("#salvar-padrao").addEventListener("click", salvarFiltrosPadrao);
  $("#limpar").addEventListener("click", () => {
    filtroTexto = ""; filtroPrio = []; filtroSetor = []; filtroExec = []; filtroPlanej = [];
    filtroIdade = "0"; filtroSemExec = false; filtroMeusChamados = false; ordenacao = "recentes";
    $("#busca").value = "";
    msPrio.setValue([]); msSetor.setValue([]); msExec.setValue([]); msPlanej.setValue([]); msTrabalho.setValue([]);
    atualizarOpcoesFiltroTrabalho();   // filtroPlanej vazio => volta a mostrar todos os grupos de trabalho
    $("#filtro-idade").value = "0";
    $("#ordenacao").value = "recentes"; $("#filtro-semexec").checked = false;
    $("#meus-chamados").classList.remove("ativo");
    aplica();
  });
  $("#refresh").addEventListener("click", carregar);
  $("#tema").addEventListener("click", alternarTema);
  aplicarIconeTema();
  // novo chamado
  $("#novo").addEventListener("click", abrirNovo);
  $("#n-close").addEventListener("click", fecharNovo);
  $("#n-cancel").addEventListener("click", fecharNovo);
  $("#n-save").addEventListener("click", salvarNovo);
  criarBuscaUsuario("n-solic", (u) => {
    solicSelecionado = u;
    $("#n-solic-info").textContent = u ? u.nm_completo : "";
  });
  $("#n-planej").addEventListener("change", atualizarGruposTrabalho);
  // troca de grupo de planejamento no modal de edição reinicia o de trabalho
  // (o antigo provavelmente não pertence ao novo grupo)
  $("#m-planej").addEventListener("change", atualizarGruposTrabalhoModal);
  $("#novo-modal").addEventListener("click", (e) => {
    if (e.target.id === "novo-modal") fecharNovo();
  });
  $("#modal-close").addEventListener("click", fecharModal);
  $("#m-cancel").addEventListener("click", fecharModal);
  $("#m-save").addEventListener("click", salvarModal);
  $("#m-encerrar").addEventListener("click", encerrarModal);
  $("#m-nota-add").addEventListener("click", adicionarNota);
  criarBuscaUsuario("m-exec", null);
  criarBuscaUsuario("x-exec", null);
  buscaEstagioModal = criarBuscaEstagio("m");
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") fecharModal();
  });

  // atalhos: "/" foca a busca, Esc fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault(); $("#busca").focus();
    } else if (e.key === "Escape") {
      ["#modal", "#novo-modal", "#exec-modal", "#close-modal"].forEach((m) => {
        const el = $(m); if (el && !el.classList.contains("hidden")) el.classList.add("hidden");
      });
    }
  });
}

async function carregarUsuarioLogado() {
  try {
    const r = await fetch('/api/kanban/me');
    if (!r.ok) return;
    const { username, fullName } = await r.json();
    currentUsername = username;
    const badge = $("#user-badge");
    if (badge) {
      const av = iniciais(fullName || username);
      badge.innerHTML = `<span class="av">${esc(av)}</span><span>${esc(fullName || username)}</span>`;
      badge.style.display = "";
    }
    const btn = $("#meus-chamados");
    if (btn) btn.style.display = "";
    const btnP = $("#salvar-padrao");
    if (btnP) btnP.style.display = "";
    restaurarFiltrosPadrao();
  } catch {}
}

initControles();
restaurarFiltros();
carregarGrupos();
carregarEstagios();
// vínculo usuário x grupo de trabalho: ao chegar, re-renderiza pra aplicar o
// gate (cadeado/consulta) já na primeira pintura do quadro
carregarMeusGrupos().then(() => { if (typeof render === "function" && CHAMADOS.length) render(); });
carregar();
carregarUsuarioLogado();
iniciarAutoRefresh();
