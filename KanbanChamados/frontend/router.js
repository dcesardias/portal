// Mini-router por hash — Fase 1 do handoff de design (SPA leve, sem servidor).
// Rotas: #/inicio (padrão) · #/kanban · #/cockpit · #/indicadores

const VIEWS = ["inicio", "kanban", "cockpit", "indicadores"];
const ROUTE_LISTENERS = []; // [[view, fn], ...] — fn roda toda vez que a view fica ativa
const VIEW_KEY = "kanban_view"; // última view usada NESTA aba (persiste no F5)

function onView(view, fn) { ROUTE_LISTENERS.push([view, fn]); }
function irPara(view) { location.hash = "#/" + view; }
function viewAtual() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  if (VIEWS.includes(h)) return h;
  // Sem hash: o checkpoint de autenticação por aba (server.js) redireciona e
  // descarta o "#/...", e o hash nunca chega ao servidor. Restaura a última
  // view usada nesta aba pra o F5 não jogar o usuário de volta pra "inicio".
  let salvo = null;
  try { salvo = sessionStorage.getItem(VIEW_KEY); } catch {}
  return VIEWS.includes(salvo) ? salvo : "inicio";
}

function aplicarRoute() {
  const atual = viewAtual();
  try { sessionStorage.setItem(VIEW_KEY, atual); } catch {}
  // mantém a URL coerente com a view (inclusive quando restaurada do storage),
  // sem criar entrada no histórico — replaceState não dispara hashchange.
  if (location.hash !== "#/" + atual) history.replaceState(null, "", "#/" + atual);
  VIEWS.forEach((v) => {
    const el = document.getElementById("view-" + v);
    if (el) el.classList.toggle("hidden", v !== atual);
  });
  document.querySelectorAll(".mode-tab").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === atual);
  });
  ROUTE_LISTENERS.filter(([v]) => v === atual).forEach(([, fn]) => fn());
}

window.addEventListener("hashchange", aplicarRoute);
