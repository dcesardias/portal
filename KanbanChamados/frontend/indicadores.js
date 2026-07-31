// Modo Indicadores (Fase 4, remontado após feedback). Reaproveita de verdade o
// dashboard já validado em metricas.js — mesmos cartões, mesmo gráfico de série
// temporal, mesmo donut, mesmas barras e mesma tabela/exportação (funções
// statCard/barList/donut/secao/lineChart/tabelaHTML/diasChamado, todas em
// metricas.js, carregado como "motor" antes deste arquivo). Só o estado
// (dados/filtros) e o container são próprios do modo Indicadores dentro do
// shell; o layout e os cálculos são os mesmos que já existiam e funcionavam.
// Único acréscimo: uma seção de "Faixas de idade" (backlog aging), útil para
// priorizar triagem e que a versão anterior não tinha.

let indDados = [];
let indPreset = "90";
let indIni = "", indFim = "";
let indFStatus = [], indFPlanej = [], indFTrabalho = [], indFPrio = [], indFExec = [], indFSetor = [];
let indMsStatus, indMsPlanej, indMsTrabalho, indMsPrio, indMsExec, indMsSetor;
let indMapaPlanejTrabalho = new Map();
let indCarregando = false;
let indCarregado = false;

// backlog aging: mesmos baldes de idade usados em qualquer triagem de fila
const IDADE_BALDES = [
  { label: "≤ 2 dias", max: 2, color: "var(--sla-ok)" },
  { label: "3–7 dias", max: 7, color: "var(--primary)" },
  { label: "8–15 dias", max: 15, color: "var(--sla-warn)" },
  { label: "16–30 dias", max: 30, color: "var(--p-alta)" },
  { label: "> 30 dias", max: Infinity, color: "var(--sla-crit)" },
];
// barList() de metricas.js só aceita 1 cor para todas as barras; aqui cada
// balde tem sua própria cor (verde -> vermelho), por isso uma variante local.
function idadeBarList(baldes) {
  if (!baldes.some((b) => b.value > 0)) return `<div class="met-empty">Sem dados para os filtros atuais.</div>`;
  const maxv = Math.max(...baldes.map((b) => b.value), 1);
  return baldes.map((b) => `
    <div class="met-bar">
      <span class="met-bar-lbl">${esc(b.label)}</span>
      <span class="met-bar-track"><span class="met-bar-fill" style="width:${Math.round((b.value / maxv) * 100)}%;background:${b.color}"></span></span>
      <span class="met-bar-val">${b.value}</span>
    </div>`).join("");
}
function calcularFaixasIdade(cs) {
  const counts = IDADE_BALDES.map(() => 0);
  cs.forEach((c) => {
    const d = diasChamado(c);
    if (d == null) return;
    for (let i = 0; i < IDADE_BALDES.length; i++) { if (d <= IDADE_BALDES[i].max) { counts[i]++; break; } }
  });
  return IDADE_BALDES.map((b, i) => ({ label: b.label, value: counts[i], color: b.color }));
}

function indShellHTML() {
  return `
    <div class="filterbar">
      <span class="fb-label">Período (abertura)</span>
      <select id="ind-preset" title="Atalhos de período">
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="180">Últimos 6 meses</option>
        <option value="365">Últimos 12 meses</option>
        <option value="ano">Este ano</option>
        <option value="tudo">Tudo</option>
        <option value="custom">Personalizado…</option>
      </select>
      <input type="date" id="ind-ini" title="Data inicial (abertura)" />
      <span class="muted" style="font-size:12px">até</span>
      <input type="date" id="ind-fim" title="Data final (abertura)" />
      <button id="ind-aplicar" class="btn btn-primary" style="padding:7px 14px">Aplicar</button>
    </div>
    <div class="filterbar">
      <span class="fb-label">Recortes</span>
      <div id="ind-status" title="Status"></div>
      <div id="ind-planej" class="msel-lg" title="Grupo de planejamento"></div>
      <div id="ind-trab" class="msel-lg" title="Grupo de trabalho"></div>
      <div id="ind-prio" title="Prioridade"></div>
      <div id="ind-exec" title="Responsável"></div>
      <div id="ind-setor" title="Setor solicitante"></div>
      <button id="ind-limpar" class="btn-ghost-sm" title="Limpar recortes">Limpar recortes</button>
      <button id="ind-export" class="btn" title="Exportar a base filtrada (.csv, abre no Excel)">⬇ Exportar Excel</button>
      <span class="filter-count" id="ind-sub"></span>
    </div>
    <main id="ind-body" class="met-page"><div class="dash-loading">Carregando indicadores…</div></main>`;
}

function indPassaRecorte(c) {
  if (indFStatus.length) {
    const bate = indFStatus.some((v) => v === "ativos" ? c.ie_status_ordem !== 3 : String(c.ie_status_ordem) === v);
    if (!bate) return false;
  }
  if (indFPlanej.length && !indFPlanej.includes(c.ds_grupo_planej || "")) return false;
  if (indFTrabalho.length && !indFTrabalho.includes(c.ds_grupo_trabalho || "")) return false;
  if (indFPrio.length && !indFPrio.includes(c.ie_prioridade)) return false;
  if (indFExec.length && !indFExec.includes(execLabel(c))) return false;
  if (indFSetor.length && !indFSetor.includes(c.ds_setor_solicitante || "")) return false;
  return true;
}
function indRecortados() { return indDados.filter(indPassaRecorte); }

// render() de metricas.js, adaptado para o estado/DOM próprios do Indicadores
// (mesmas funções statCard/barList/donut/secao/lineChart/tabelaHTML/diasChamado).
function renderIndicadores() {
  const body = document.getElementById("ind-body");
  const sub = document.getElementById("ind-sub");
  if (!body) return;
  const cs = indRecortados();
  const abertos = cs.filter((c) => c.ie_status_ordem === 1).length;
  const processo = cs.filter((c) => c.ie_status_ordem === 2).length;
  const encerrados = cs.filter((c) => c.ie_status_ordem === 3);
  const ativos = cs.filter((c) => c.ie_status_ordem !== 3);
  const semResp = ativos.filter((c) => execLabel(c) === "Sem Executor").length;
  const taxa = cs.length ? Math.round((encerrados.length / cs.length) * 100) : 0;
  const resolH = encerrados.map(resolHoras).filter((v) => v != null && v >= 0);

  const fimSerie = hojeISO();
  const spanDias = Math.max(1, (new Date(fimSerie) - new Date(indIni)) / DIA_MS);
  const modo = modoBucket(spanDias);
  const chaves = bucketsEntre(indIni, fimSerie, modo);
  const idxCri = {}, idxEnc = {};
  chaves.forEach((k) => { idxCri[k] = 0; idxEnc[k] = 0; });
  cs.forEach((c) => {
    const ka = chaveBucket(new Date(c.dt_ordem_servico), modo);
    if (ka in idxCri) idxCri[ka]++;
    if (c.ie_status_ordem === 3 && c.dt_atualizacao) {
      const ke = chaveBucket(new Date(c.dt_atualizacao), modo);
      if (ke in idxEnc) idxEnc[ke]++;
    }
  });
  const sCri = chaves.map((k) => idxCri[k]), sEnc = chaves.map((k) => idxEnc[k]);

  const porPrio = PRIORIDADES.map((p) => [p.t, cs.filter((c) => c.ie_prioridade === p.v).length]).filter((x) => x[1]);
  const porEquipe = agrupaCont(cs, (c) => equipeCurta(c.ds_grupo_trabalho) || "Sem equipe");
  const porTec = agrupaCont(cs, (c) => execLabel(c));
  const porSetor = agrupaCont(cs, (c) => c.ds_setor_solicitante || "—");
  const statusParts = [
    { label: "Aberta", value: abertos, color: COR_STATUS[1] },
    { label: "Em processo", value: processo, color: COR_STATUS[2] },
    { label: "Encerrada", value: encerrados.length, color: COR_STATUS[3] },
  ];
  const faixasIdade = calcularFaixasIdade(cs);

  if (sub) {
    sub.textContent = `${cs.length} de ${indDados.length} chamados · ${indIni} a ${indFim} · atualizado ${fmtData(new Date().toISOString())}`;
  }

  body.innerHTML = `
    <div class="met-stats">
      ${statCard(cs.length, "Total no período", "var(--primary)")}
      ${statCard(abertos, "Abertos", COR_STATUS[1])}
      ${statCard(processo, "Em processo", COR_STATUS[2])}
      ${statCard(encerrados.length, "Encerrados", COR_STATUS[3])}
      ${statCard(taxa + "%", "Taxa de resolução", "var(--st-encerrada)")}
      ${statCard(semResp, "Sem responsável", "#7c6cff")}
      ${statCard(fmtDuracao(media(resolH)), "Resolução (média)", "var(--primary)")}
      ${statCard(fmtDuracao(mediana(resolH)), "Resolução (mediana)", "var(--p-media, #5b8cff)")}
    </div>

    <div class="met-cols">
      ${secao("Criados × Encerrados", `por ${modo === "dia" ? "dia" : modo === "mes" ? "mês" : "ano"}`,
        lineChart(chaves, modo, sCri, sEnc, "Criados", "Encerrados", "var(--primary)", "var(--st-encerrada)"), "met-c8")}
      ${secao("Status", "no período", donut(statusParts), "met-c4")}
      ${secao("Por prioridade", "", barList(porPrio, 0, "var(--st-processo)"), "met-c3")}
      ${secao("Por equipe", "top 10", barList(porEquipe, 10, "var(--primary)"), "met-c3")}
      ${secao("Por responsável", "top 10", barList(porTec, 10, "#7c6cff"), "met-c3")}
      ${secao("Por setor solicitante", "top 10", barList(porSetor, 10, "var(--st-encerrada)"), "met-c3")}
      ${secao("Faixas de idade", "backlog em aberto · tempo até encerrar", idadeBarList(faixasIdade), "met-sec-wide")}
    </div>

    ${tabelaHTML(cs)}

    <p class="met-nota">Período filtra a <b>data de abertura</b>. "Encerrados" e os tempos de resolução
    usam a última atualização do chamado como aproximação da data de fechamento. "Faixas de idade" usa
    dias em aberto para chamados ativos e dias até o encerramento para os já encerrados.</p>`;
}

function indPopularRecortes() {
  const uniq = (campo) => [...new Set(indDados.map((c) => c[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  indMsPlanej.setOptions(uniq("ds_grupo_planej").map((g) => ({ value: g, label: g })));
  indAtualizarOpcoesTrabalho();
  const execs = [...new Set(indDados.map(execLabel))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  indMsExec.setOptions(execs.map((e) => ({ value: e, label: e })));
  indMsSetor.setOptions(uniq("ds_setor_solicitante").map((s) => ({ value: s, label: s })));
}
function indAtualizarOpcoesTrabalho() {
  const todos = [...new Set(indDados.map((c) => c.ds_grupo_trabalho).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const permitidos = trabalhosPermitidosPorPlanej(indMapaPlanejTrabalho, indFPlanej);
  const disponiveis = permitidos ? todos.filter((t) => permitidos.has(t)) : todos;
  indMsTrabalho.setOptions(disponiveis.map((g) => ({ value: g, label: equipeCurta(g) })));
  indFTrabalho = indMsTrabalho.getValue();
}
async function indCarregarGrupos() {
  try {
    const grupos = await api("/api/grupos");
    indMapaPlanejTrabalho = mapaTrabalhosPorPlanej(grupos);
    if (indDados.length) indAtualizarOpcoesTrabalho();
  } catch (e) { /* silencioso */ }
}

function indAplicarPreset(p) {
  const hoje = hojeISO();
  if (p === "tudo") { indIni = "2000-01-01"; indFim = hoje; }
  else if (p === "ano") { indIni = new Date().getFullYear() + "-01-01"; indFim = hoje; }
  else if (p === "custom") { indIni = $("#ind-ini").value || menosDias(90); indFim = $("#ind-fim").value || hoje; }
  else { indIni = menosDias(Number(p)); indFim = hoje; }
  $("#ind-ini").value = indIni;
  $("#ind-fim").value = indFim;
}

function indExportarCSV() {
  const cs = indRecortados();
  if (!cs.length) { toast("Nada para exportar com os filtros atuais.", true); return; }
  const cols = [
    ["Nº", (c) => c.nr_sequencia],
    ["Abertura", (c) => (c.dt_ordem_servico || "").replace("T", " ")],
    ["Atualização", (c) => (c.dt_atualizacao || "").replace("T", " ")],
    ["Status", (c) => LABEL_STATUS[c.ie_status_ordem] || ""],
    ["Prioridade", (c) => c.ds_prioridade || c.ie_prioridade || ""],
    ["Equipe", (c) => c.ds_grupo_trabalho || ""],
    ["Grupo planej.", (c) => c.ds_grupo_planej || ""],
    ["Responsável", (c) => (execLabel(c) === "Sem Executor" ? "" : execLabel(c))],
    ["Solicitante", (c) => c.nm_solicitante || c.nm_pessoa_solicitante || ""],
    ["Setor", (c) => c.ds_setor_solicitante || ""],
    ["Dias", (c) => { const d = diasChamado(c); return d == null ? "" : d; }],
    ["Descrição", (c) => c.ds_dano_breve || ""],
    ["Solução", (c) => c.ds_solucao || ""],
  ];
  const linhas = [cols.map((c) => c[0])].concat(cs.map((c) => cols.map((col) => col[1](c))));
  const csv = linhas.map((l) => l.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chamados_${indIni}_a_${indFim}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  toast(`${cs.length} chamado(s) exportados.`);
}

async function indCarregar() {
  if (indCarregando) return;
  indCarregando = true;
  const body = document.getElementById("ind-body");
  if (body) body.innerHTML = `<div class="dash-loading">Carregando ${indIni} a ${indFim}…</div>`;
  try {
    const { chamados } = await api(`/api/chamados/periodo?inicio=${indIni}&fim=${indFim}`);
    chamados.forEach((c) => { c.ie_status_ordem = Number(c.ie_status_ordem); });
    indDados = chamados;
    indPopularRecortes();
    renderIndicadores();
  } catch (e) {
    if (body) body.innerHTML = `<div class="dash-loading err">Erro: ${esc(e.message)}</div>`;
  } finally {
    indCarregando = false;
  }
}

function initIndicadores() {
  const shell = document.getElementById("view-indicadores");
  if (!shell || shell.dataset.built) return;
  shell.innerHTML = indShellHTML();
  shell.dataset.built = "1";

  indAplicarPreset(indPreset);
  $("#ind-preset").value = indPreset;
  $("#ind-preset").addEventListener("change", (e) => {
    indPreset = e.target.value;
    if (indPreset !== "custom") { indAplicarPreset(indPreset); indCarregar(); }
  });
  const indAplicarDatas = () => {
    indIni = $("#ind-ini").value || indIni;
    indFim = $("#ind-fim").value || indFim;
    if (indIni > indFim) { toast("Data inicial maior que a final.", true); return; }
    indPreset = "custom"; $("#ind-preset").value = "custom";
    indCarregar();
  };
  $("#ind-aplicar").addEventListener("click", indAplicarDatas);
  $("#ind-ini").addEventListener("change", () => { $("#ind-preset").value = "custom"; indPreset = "custom"; });
  $("#ind-fim").addEventListener("change", () => { $("#ind-preset").value = "custom"; indPreset = "custom"; });

  indMsStatus = criarMultiSelect($("#ind-status"), { allLabel: "Todos os status" });
  indMsStatus.setOptions([
    { value: "1", label: "Aberta" }, { value: "2", label: "Em processo" }, { value: "3", label: "Encerrada" },
    { value: "ativos", label: "Ativos (Aberta+Processo)" },
  ]);
  indMsStatus.onChange((vals) => { indFStatus = vals; renderIndicadores(); });

  indMsPlanej = criarMultiSelect($("#ind-planej"), { allLabel: "Todos os grupos de planejamento" });
  indMsPlanej.onChange((vals) => { indFPlanej = vals; indAtualizarOpcoesTrabalho(); renderIndicadores(); });

  indMsTrabalho = criarMultiSelect($("#ind-trab"), { allLabel: "Todos os grupos de trabalho" });
  indMsTrabalho.onChange((vals) => { indFTrabalho = vals; renderIndicadores(); });

  indMsPrio = criarMultiSelect($("#ind-prio"), { allLabel: "Todas prioridades" });
  indMsPrio.setOptions(PRIORIDADES.map((p) => ({ value: p.v, label: p.t })));
  indMsPrio.onChange((vals) => { indFPrio = vals; renderIndicadores(); });

  indMsExec = criarMultiSelect($("#ind-exec"), { allLabel: "Todos responsáveis" });
  indMsExec.onChange((vals) => { indFExec = vals; renderIndicadores(); });

  indMsSetor = criarMultiSelect($("#ind-setor"), { allLabel: "Todos os setores" });
  indMsSetor.onChange((vals) => { indFSetor = vals; renderIndicadores(); });

  $("#ind-limpar").addEventListener("click", () => {
    indFStatus = []; indFPlanej = []; indFPrio = []; indFExec = []; indFSetor = [];
    indMsStatus.setValue([]); indMsPlanej.setValue([]); indMsTrabalho.setValue([]);
    indMsPrio.setValue([]); indMsExec.setValue([]); indMsSetor.setValue([]);
    indAtualizarOpcoesTrabalho();
    renderIndicadores();
  });
  $("#ind-export").addEventListener("click", indExportarCSV);

  indCarregarGrupos();
  indCarregar();
}

onView("indicadores", () => {
  if (!indCarregado) { indCarregado = true; initIndicadores(); }
});
