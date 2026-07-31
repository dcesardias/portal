// Tela inicial — Fase 1 do handoff de design.
// Lê do mesmo store que o Kanban (CHAMADOS, de app.js) e reusa execLabel/idadeDias
// de common.js. Não faz nenhuma chamada de API própria.

const SVG_LOGO = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
const SVG_MODO_KANBAN = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="10" rx="1.5"/></svg>`;
const SVG_MODO_COCKPIT = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>`;
const SVG_MODO_INDIC = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`;

const HOME_RESUMO = [
  { label: "Abertos", color: "var(--st-aberta)", icon: SVG_INBOX, calc: (c) => c.ie_status_ordem === 1 },
  { label: "Em processo", color: "var(--st-processo)", icon: SVG_LOOP, calc: (c) => c.ie_status_ordem === 2 },
  { label: "Sem responsável", color: "#7c6cff", icon: SVG_USERX, calc: (c) => c.ie_status_ordem !== 3 && execLabel(c) === "Sem Executor" },
  { label: "Mais antigos (+7d)", color: "var(--sla-crit)", icon: SVG_TIMER, calc: (c) => c.ie_status_ordem !== 3 && idadeDias(c) > 7 },
];

const HOME_MODOS = [
  { view: "kanban", icone: SVG_MODO_KANBAN, cor: "var(--primary)", titulo: "Modo Kanban",
    desc: "Visão de quadro. Arraste chamados entre Aberta, Em processo e Encerrada — a forma clássica." },
  { view: "cockpit", icone: SVG_MODO_COCKPIT, cor: "var(--p-emerg)", titulo: "Modo Cockpit", tag: "RECOMENDADO",
    desc: "Triagem por urgência. Fila priorizada, detalhe inline e atalhos de teclado para resolver rápido." },
  { view: "indicadores", icone: SVG_MODO_INDIC, cor: "var(--st-encerrada)", titulo: "Indicadores",
    desc: "Painel gerencial: carga por equipe, cumprimento de prazo, tempos médios e distribuição." },
];

function renderHome() {
  const el = document.getElementById("view-inicio");
  if (!el) return;
  const base = (typeof CHAMADOS !== "undefined" ? CHAMADOS : []);
  const pills = HOME_RESUMO.map((r) => `
    <span class="home-pill">
      <span class="home-pill-icon" style="color:${r.color}">${r.icon}</span>
      ${esc(r.label)} <b>${base.filter(r.calc).length}</b>
    </span>`).join("");
  const cards = HOME_MODOS.map((m) => `
    <button type="button" class="home-card" data-view="${m.view}">
      ${m.tag ? `<span class="home-card-tag">${esc(m.tag)}</span>` : ""}
      <span class="home-card-icon" style="background:color-mix(in srgb, ${m.cor} 15%, transparent);color:${m.cor}">${m.icone}</span>
      <h3>${esc(m.titulo)}</h3>
      <p>${esc(m.desc)}</p>
    </button>`).join("");
  el.innerHTML = `
    <div class="home-hero">
      <span class="home-logo">${SVG_LOGO}</span>
      <h1>Central de Chamados</h1>
      <p class="home-sub">Ordens de Serviço de TI — Sistemas, Service Desk, Infraestrutura e BI. Escolha como quer trabalhar os chamados agora.</p>
      <div class="home-pills">${base.length ? pills : ""}</div>
      <div class="home-cards">${cards}</div>
    </div>`;
  el.querySelectorAll(".home-card").forEach((btn) => {
    btn.addEventListener("click", () => irPara(btn.dataset.view));
  });
}

onView("inicio", renderHome);
