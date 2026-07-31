// Biblioteca de apresentação/cálculo do dashboard de indicadores — cartões,
// donut, barras, gráfico de série temporal, tabela e baldes de data, todos
// reaproveitados por indicadores.js (o modo Indicadores dentro do shell).
// Este arquivo NÃO se auto-inicializa mais: a página /metricas antiga foi
// substituída por um redirect para #/indicadores (ver metricas.html), então
// aqui ficam só as funções puras — nada de estado global nem DOM próprios,
// pra evitar colidir com as variáveis globais de app.js (msPlanej, msPrio,
// mapaPlanejTrabalho, carregando, etc. já existem lá).

const COR_STATUS = { 1: "var(--st-aberta)", 2: "var(--st-processo)", 3: "var(--st-encerrada)" };
const LABEL_STATUS = { 1: "Aberta", 2: "Em processo", 3: "Encerrada" };

// ----------------------------- série temporal -----------------------------
function modoBucket(spanDias) { return spanDias <= 92 ? "dia" : (spanDias <= 1100 ? "mes" : "ano"); }
function chaveBucket(d, modo) {
  const z = (n) => String(n).padStart(2, "0");
  if (modo === "ano") return String(d.getFullYear());
  if (modo === "mes") return d.getFullYear() + "-" + z(d.getMonth() + 1);
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function rotuloBucket(chave, modo) {
  const p = chave.split("-");
  if (modo === "ano") return p[0];
  if (modo === "mes") return p[2 - 1] + "/" + p[0].slice(2);  // MM/YY
  return p[2] + "/" + p[1];                                    // DD/MM
}
function bucketsEntre(iniISO, fimISO, modo) {
  const out = [];
  const d = new Date(iniISO + "T00:00:00"), fim = new Date(fimISO + "T00:00:00");
  if (isNaN(d) || isNaN(fim)) return out;
  let guard = 0;
  while (d <= fim && guard++ < 4000) {
    out.push(chaveBucket(d, modo));
    if (modo === "ano") d.setFullYear(d.getFullYear() + 1);
    else if (modo === "mes") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
  }
  // dedup mantendo ordem (mes/ano podem repetir ao iterar por dia inicial)
  return [...new Set(out)];
}

// gráfico de linhas SVG (responsivo via viewBox); duas séries
function lineChart(chaves, modo, sA, sB, nomeA, nomeB, corA, corB) {
  if (!chaves.length) return `<div class="met-empty">Sem dados no período.</div>`;
  const W = 860, H = 250, pl = 44, pr = 16, pt = 18, pb = 40;
  const n = chaves.length;
  const maxv = Math.max(1, ...sA, ...sB);
  const X = (i) => n <= 1 ? pl + (W - pl - pr) / 2 : pl + i * (W - pl - pr) / (n - 1);
  const Y = (v) => pt + (H - pt - pb) * (1 - v / maxv);
  const linhas = [0, 0.5, 1].map((f) => {
    const yy = pt + (H - pt - pb) * (1 - f), val = Math.round(maxv * f);
    return `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" class="grid"/>
      <text x="${pl - 8}" y="${yy + 4}" class="axis" text-anchor="end">${val}</text>`;
  }).join("");
  const pathDe = (s) => s.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const area = `${pathDe(sA)} L ${X(n - 1).toFixed(1)} ${Y(0)} L ${X(0).toFixed(1)} ${Y(0)} Z`;
  const passo = Math.ceil(n / 9);
  const xlabels = chaves.map((c, i) =>
    (i % passo === 0 || i === n - 1)
      ? `<text x="${X(i).toFixed(1)}" y="${H - pb + 18}" class="axis" text-anchor="middle">${rotuloBucket(c, modo)}</text>`
      : "").join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-line" role="img" aria-label="Série temporal">
    ${linhas}${xlabels}
    <path d="${area}" fill="${corA}" opacity=".12"/>
    <path d="${pathDe(sA)}" fill="none" stroke="${corA}" stroke-width="2.2"/>
    <path d="${pathDe(sB)}" fill="none" stroke="${corB}" stroke-width="2.2"/>
  </svg>
  <div class="chart-legend">
    <span><i style="background:${corA}"></i>${esc(nomeA)}</span>
    <span><i style="background:${corB}"></i>${esc(nomeB)}</span>
  </div>`;
}

// donut SVG
function donut(parts) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return `<div class="met-empty">Sem dados.</div>`;
  const r = 52, c = 2 * Math.PI * r, cx = 66, cy = 66;
  let off = 0;
  const segs = parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * c;
    const s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="18"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len; return s;
  }).join("");
  const leg = parts.filter((p) => p.value > 0).map((p) =>
    `<span><i style="background:${p.color}"></i>${esc(p.label)} <b>${p.value}</b></span>`).join("");
  return `<div class="donut-wrap">
    <svg viewBox="0 0 132 132" class="donut" role="img" aria-label="Distribuição por status">
      ${segs}
      <text x="66" y="62" text-anchor="middle" class="donut-num">${total}</text>
      <text x="66" y="80" text-anchor="middle" class="donut-cap">chamados</text>
    </svg>
    <div class="donut-legend">${leg}</div>
  </div>`;
}

function statCard(valor, rotulo, cor) {
  return `<div class="met-stat" style="--met-c:${cor}">
    <span class="met-stat-v">${valor}</span>
    <span class="met-stat-l">${esc(rotulo)}</span>
  </div>`;
}
function barList(pares, max, cor) {
  if (!pares.length) return `<div class="met-empty">Sem dados para os filtros atuais.</div>`;
  const top = max ? pares.slice(0, max) : pares;
  const maxv = Math.max(...top.map((p) => p[1]), 1);
  return top.map(([k, v]) => `
    <div class="met-bar">
      <span class="met-bar-lbl" title="${esc(k)}">${esc(k)}</span>
      <span class="met-bar-track"><span class="met-bar-fill" style="width:${Math.round((v / maxv) * 100)}%;background:${cor}"></span></span>
      <span class="met-bar-val">${v}</span>
    </div>`).join("");
}
function secao(titulo, sub, conteudo, cls) {
  return `<section class="met-sec${cls ? " " + cls : ""}">
    <h3>${esc(titulo)}${sub ? ` <small>${esc(sub)}</small>` : ""}</h3>
    ${conteudo}
  </section>`;
}

// "idade" de um chamado em dias: dias em aberto se ativo, dias até o
// encerramento (resolHoras/24) se já encerrado.
function diasChamado(c) {
  if (c.ie_status_ordem === 3) { const h = resolHoras(c); return h == null ? null : Math.round(h / 24); }
  return idadeDias(c);
}

// ----------------------------- tabela / base -------------------------------
const MAX_TABELA = 250;
function tabelaHTML(cs) {
  const linhas = cs.slice(0, MAX_TABELA).map((c) => {
    const d = diasChamado(c);
    return `<tr>
      <td>${c.nr_sequencia}</td>
      <td>${esc((c.dt_ordem_servico || "").slice(0, 10).split("-").reverse().join("/"))}</td>
      <td><span class="tg-status" style="--c:${COR_STATUS[c.ie_status_ordem] || "var(--text-3)"}">${esc(LABEL_STATUS[c.ie_status_ordem] || "—")}</span></td>
      <td>${esc(c.ds_prioridade || c.ie_prioridade || "—")}</td>
      <td>${esc(execLabel(c) === "Sem Executor" ? "—" : execLabel(c))}</td>
      <td>${esc(equipeCurta(c.ds_grupo_trabalho) || "—")}</td>
      <td title="${esc(c.ds_setor_solicitante || "")}">${esc(c.ds_setor_solicitante || "—")}</td>
      <td class="num">${d == null ? "—" : d}</td>
      <td title="${esc(c.ds_dano_breve || "")}">${esc(c.ds_dano_breve || "—")}</td>
    </tr>`;
  }).join("");
  const aviso = cs.length > MAX_TABELA
    ? `<span class="muted"> · mostrando ${MAX_TABELA} de ${cs.length} (exporte para ver todos)</span>` : "";
  return `<section class="met-sec met-sec-wide">
    <h3>Base de chamados <small>${cs.length} linha(s)${aviso}</small></h3>
    <div class="tabela-wrap">
      <table class="tabela">
        <thead><tr>
          <th>Nº</th><th>Abertura</th><th>Status</th><th>Prioridade</th><th>Responsável</th>
          <th>Equipe</th><th>Setor</th><th>Dias</th><th>Descrição</th>
        </tr></thead>
        <tbody>${linhas || `<tr><td colspan="9" class="muted" style="text-align:center;padding:14px">Nada para exibir.</td></tr>`}</tbody>
      </table>
    </div>
  </section>`;
}

// ----------------------------- export CSV (Excel) --------------------------
function csvCell(v) {
  v = (v ?? "").toString();
  return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
