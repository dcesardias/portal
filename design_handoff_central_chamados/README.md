# Handoff: Novo modelo da Central de Chamados (TI · Tasy)

> **Para o Claude Code que tem acesso ao projeto em produção.**
> Este pacote descreve como aplicar um **novo modelo visual e de usabilidade** ao
> front-end da Central de Chamados. O app hoje em produção já tem o **modo Kanban**
> (com melhorias). O objetivo é evoluir para um app com **tela inicial + 3 modos**:
> **Kanban**, **Cockpit de Triagem** (novo) e **Indicadores** (restyle).

---

## ⛔ REGRA DE OURO — NÃO TOCAR NO BACKEND

**Tudo aqui é 100% front-end.** É proibido alterar comportamento de servidor/dados:

- **NÃO editar** `backend/` (`main.py`, `db.py`, `config.py`, `sql/`), `.env`, `requirements*.txt`, `start.bat`, `tests/`.
- **NÃO criar novas rotas** FastAPI, **NÃO** mudar payloads, **NÃO** adicionar campos/tabelas, **NÃO** mexer no fluxo de escrita no Tasy.
- **Usar SOMENTE os endpoints que já existem** (lista abaixo). Nada de novo endpoint.
- Só é permitido editar/criar arquivos dentro de **`frontend/`** que já são servidos pelo mount de estáticos existente (o mesmo que serve `/app.js`, `/style.css`, `/common.js`, `/vendor/...`).
- Qualquer conceito novo (ex.: **SLA**) deve ser **calculado no cliente** a partir de campos que a API **já retorna** (`dt_ordem_servico`, `ie_prioridade`, etc.). É uma decisão de produto no front, não um dado do backend.

Se em algum ponto parecer necessário mudar o backend para atingir o design, **pare e escolha a alternativa só-front** documentada aqui (ou pergunte). Preferir sempre reaproveitar `common.js`.

---

## Sobre os arquivos de design (`design_reference/`)

Os arquivos `*.dc.html` são **referências de design feitas em HTML/React** (protótipos que mostram o visual e o comportamento pretendidos) — **não são código para copiar direto**. A app real é **JavaScript puro (vanilla), sem build**. A tarefa é **recriar esses designs dentro da arquitetura vanilla existente**, reusando os padrões e helpers do projeto (`common.js`, `api()`, `esc()`, `toast()`, etc.).

- `Central de Chamados.dc.html` — **o modelo completo** (tela inicial + os 3 modos + tema claro/escuro). É a referência principal.
- `Kanban Chamados.dc.html` — só o quadro (referência do card redesenhado).
- `Cockpit Chamados.dc.html` — só o cockpit (referência do modo de triagem).
- `support.js` — runtime dos `.dc.html` (só para conseguir abrir os protótipos no navegador, se quiser ver rodando). **Não vai para produção.**

**Fidelidade: alta (hi‑fi).** Cores, tipografia, espaçamentos e interações são finais. Recrie fiel usando `frontend/style.css` + JS vanilla. As telas de referência estão em `screenshots/`.

---

## Arquitetura-alvo (como encaixar sem mexer no backend)

O app é servido pelo FastAPI: `/` → `index.html`, `/metricas` → `metricas.html`, e um mount de estáticos serve `frontend/` (por isso `/app.js`, `/style.css` funcionam por caminho relativo). **Adicionar arquivos JS/CSS novos em `frontend/` é mudança só de front** (o mount já os serve). Criar rota nova, não.

**Estratégia recomendada (zero backend): SPA leve com roteamento por hash dentro do `index.html` já existente.**

- `index.html` vira o **shell único** do app: topo persistente (logo → início, switcher de modos, busca global, usuário, Novo, tema) + um `<main id="app-view">` que troca de conteúdo conforme `location.hash`.
- Rotas por hash (sem servidor): `#/inicio` (padrão), `#/kanban`, `#/cockpit`, `#/indicadores`.
- Cada modo é um módulo JS carregado por `<script>` no `index.html` (servido pelo mount):
  - `app.js` (existente) → **modo Kanban** (reaproveitar quase tudo; ver Fase 2).
  - `cockpit.js` (novo) → **modo Cockpit**.
  - `indicadores.js` (novo, pode partir do `metricas.js` existente) → **modo Indicadores**.
  - `home.js` (novo, pequeno) → **tela inicial**.
  - `common.js` (existente) → helpers compartilhados por todos.
- **Fonte de dados única:** um pequeno "store" no cliente segura `CHAMADOS` (o retorno de `GET /api/chamados`) e cada modo lê do mesmo array. Isso evita refazer requisições e mantém tudo sincronizado. O auto‑refresh de 45s já existente continua alimentando o store.
- `/metricas` (rota atual) pode **continuar existindo** apontando para a versão restyled, ou redirecionar para `#/indicadores`. Não remova a rota (é backend); apenas reaproveite.

> Alternativa (se preferir não unir em SPA): manter páginas separadas `index.html` (kanban) + novos `cockpit.html` e `home.html` servidos pelo mount estático por caminho (`/cockpit.html`), sem rotas novas. Funciona, mas duplica o topo/carga e perde o switch instantâneo. **Prefira a SPA por hash.**

---

## Endpoints existentes — usar SOMENTE estes (nenhum novo)

- `GET  /api/chamados` — lista do quadro (base de Kanban e Cockpit).
- `GET  /api/chamados/periodo?inicio&fim` — todos no intervalo (base dos Indicadores).
- `POST /api/chamados` — cria OS (modal Novo).
- `GET  /api/grupos` — grupos de planejamento/trabalho.
- `PATCH /api/chamados/{nr}/status` — mover status (1/2/3); status 3 exige `ds_relato`.
- `PATCH /api/chamados/{nr}` — edita descrição/prioridade/executor.
- `GET  /api/chamados/{nr}/anexos` — anexos.
- `GET/PUT /api/chamados/{nr}/relato` — solução/relato técnico.
- `GET  /api/usuarios?q=` — autocomplete de usuários.

Todas as regras de fluxo já existentes continuam valendo e **já estão no `app.js`** (executor obrigatório p/ Processo, solução obrigatória p/ encerrar, 422 do backend, relato atribuído ao executor). **Reaproveite essas funções — não reescreva a lógica de escrita.**

---

## Mapa de campos: design → API real (CRÍTICO)

Os protótipos usam nomes curtos fictícios. Ao implementar, **traduza para os campos reais** (e para os helpers do `common.js`). Nunca invente campo no backend.

| Design (mock) | Campo/Helper real (API + common.js) |
|---|---|
| `id` | `nr_sequencia` |
| `title` | `ds_dano_breve` |
| `prio` | `ie_prioridade` (`E/U/A/M/B/S`) · rótulo via `PRIORIDADES` |
| `status` | `ie_status_ordem` (`1/2/3`) · rótulo via `COLUNAS` |
| `req` (solicitante) | `nm_solicitante` (fallback `nm_pessoa_solicitante`) |
| login do solicitante (email/Teams) | `nm_usuario_solic` |
| `sector` | `ds_setor_solicitante` |
| `exec` (rótulo do responsável) | `execLabel(c)` (usa `ds_usuario_exec_correto`; "Sem Executor" quando vazio/`TASY`) |
| login do executor (email/Teams + edição) | `nm_exec_atual` · nome de exibição `ds_exec_atual` |
| `team` | `equipeCurta(c.ds_grupo_trabalho)` |
| `anexos` | `c.qt_anexos` |
| "idade" em dias | `idadeDias(c)` (de `dt_ordem_servico`) · "novo" = `isNovo(c)` |
| `abertura` / `atualização` | `fmtData(c.dt_ordem_servico)` / `fmtData(c.dt_atualizacao)` |
| iniciais / cor do avatar | `iniciais(nome)` / `avatarColor(nome)` |
| `hrs` (horas em aberto — usado no SLA) | **calcular:** `(Date.now() - new Date(c.dt_ordem_servico)) / 3600000` |
| timeline "Atividade" | **derivar** de campos existentes (abertura, executor, status, relato/`dt_atualizacao`). **Não** há endpoint de histórico — montar do que já se tem, ou omitir. |
| `solucao` | `GET /api/chamados/{nr}/relato` → `ds_relat_tecnico` |

**Contatos Email/Teams:** já existem em `app.js` — `emailDe(login)`, `teamsDe(login)`, `commIcons()`, `commLinha()`. Reutilize; o domínio é `@aacd.org.br`.

---

## SLA (conceito NOVO, só no front)

O Cockpit e os Indicadores usam **SLA por prioridade**. Isso **não existe no backend** — é uma configuração de cliente. Defina uma constante em `common.js` (fácil de ajustar depois com a equipe):

```js
// horas-meta de resposta por prioridade (decisão de produto, 100% front)
const SLA_META_H = { E: 4, U: 4, A: 24, M: 72, B: 120, S: 120 };
function slaInfo(c) {
  const target = SLA_META_H[c.ie_prioridade] || 72;
  const hrs = (Date.now() - new Date(c.dt_ordem_servico)) / 3600000;
  const pct = hrs / target, breached = pct >= 1;
  const color = c.ie_status_ordem === 3 ? 'var(--sla-ok)'
    : breached ? 'var(--sla-crit)' : pct > 0.7 ? 'var(--sla-warn)' : 'var(--sla-ok)';
  return { hrs, target, pct: Math.min(pct,1), breached, color };
}
```

> Se a equipe **não** quiser introduzir a semântica de SLA agora, há alternativa sem novo conceito: usar a **idade** que já existe (`idadeDias` + os buckets `ageBucket` do `app.js`) para colorir a urgência. Decisão de produto — confirmar. O visual (anel/contagem) é o mesmo; muda só a régua.

---

## Design tokens

Estão prontos em **`DESIGN_TOKENS.css`** (mescle no topo de `frontend/style.css`, substituindo o bloco `:root`/`[data-theme="light"]` atual). Resumo: fundo escuro `#0b1119`, superfícies `#131b28/#1a2333`, texto `#e9eef8/#a9b7d3/#7c8caa`, acento `#5b8cff`; status azul/âmbar/verde; prioridade emergência `#e8564b`→baixa `#3fbf82`; SLA ok/warn/crit `#3fbf82/#e2c14b/#e8564b`. Raio 12–16px. Fonte **Inter** (já carregada). Tema por `html[data-theme]` (já implementado em `common.js`: `alternarTema`).

---

## Plano por fases (ordem sugerida, cada fase é entregável e reversível)

### Fase 0 — Tokens e base visual (sem quebrar nada)
- Mesclar `DESIGN_TOKENS.css` em `style.css`. Conferir que o Kanban atual continua idêntico em forma, só mais refinado nas cores.
- Não mudar HTML/JS ainda. **Critério:** app em produção funciona igual, com a paleta nova.

### Fase 1 — Shell + tela inicial + roteamento por hash
- Em `index.html`: extrair o conteúdo do quadro para dentro de `<main id="view-kanban">`; adicionar o **topo persistente** (logo→`#/inicio`, switcher `Kanban·Cockpit·Indicadores`, busca global, usuário, botão Novo, tema) e containers vazios `#view-inicio`, `#view-cockpit`, `#view-indicadores`.
- Criar `home.js`: renderiza a **tela inicial** (hero + resumo ao vivo lido do store + 3 cartões que fazem `location.hash = '#/kanban'` etc.). Ver `screenshots/1-tela-inicial.png`.
- Criar um mini‑router: `window.onhashchange` mostra/esconde as `#view-*` e marca a aba ativa. Hash vazio → `#/inicio`.
- Mover a **busca** para o topo e ligá‑la aos filtros do Kanban e do Cockpit (mesma string).
- **Critério:** navegar entre início/kanban por hash; recarregar mantém a view (hash na URL); Kanban intacto.

### Fase 2 — Modo Kanban dentro do shell (reuso máximo do `app.js`)
- Manter TODA a lógica de `app.js` (render, `onDrop`, filtros, autocomplete, modais Novo/Atribuir/Encerrar, auto‑refresh, SortableJS). Só ajustar:
  - `cardHTML()` para o **card redesenhado** (ver `Kanban Chamados.dc.html` / `screenshots/2-kanban.png`): pill de prioridade com rótulo (não só cor), contagem de SLA/idade com ícone, avatar do responsável (iniciais + `avatarColor`), rodapé com anexos + tag de equipe, trilho de prioridade à esquerda.
  - Colunas com faixa de cor no topo e contador em pill.
  - Alimentar o `render()` pelo **store** compartilhado (mesmo `CHAMADOS`).
- **Critério:** arrastar, filtrar, abrir modal, criar, atribuir, encerrar, reabrir — tudo funcionando como antes (mesmas chamadas de API).

### Fase 3 — Modo Cockpit (novo) — ver `COCKPIT` abaixo
- Criar `cockpit.js`: 3 painéis (filas inteligentes · lista por urgência · detalhe inline). Lê do mesmo store. Ações reusam as funções de `app.js` (`fluxoEncerrar`, `pedirExecutor`, PATCH status/edição). Sem endpoints novos.
- **Critério:** filas, ordenação por SLA, seleção, atalhos `J/K/E/C`, ações refletem via as mesmas APIs.

### Fase 4 — Indicadores (restyle) — ver `INDICADORES` abaixo
- Partir de `metricas.js` (que já calcula carga por responsável/equipe/prioridade/setor, faixas de idade, tempos) e **reestilizar** para o novo visual: cartões de resumo, donut de status, barras, faixas de idade, cumprimento de SLA (calculado no front). Mesmo endpoint `/api/chamados/periodo`.
- Embutir como `#/indicadores` (e/ou manter `/metricas` apontando para o novo visual).
- **Critério:** números idênticos aos atuais; só o visual muda.

---

## COCKPIT — especificação

**Layout (desktop, ~1440px; rolagem horizontal abaixo disso):** três colunas.

1. **Rail esquerda (246px)** — fundo `--surface`, borda direita `--border-soft`.
   - **Filas inteligentes** (botões, contador à direita): `Precisam de você` (todos não‑encerrados, ordenado por SLA), `Minha fila` (executor = usuário logado), `Emergências` (`E/U`, não‑encerrados), `Sem responsável` (`execLabel==='Sem Executor'`, não‑encerrados), `SLA vencido` (não‑encerrados com `slaInfo().breached`). Ícone em quadro colorido + rótulo + badge; ativa com fundo `--sel` e borda `--primary`.
   - **Por status:** Aberta/Em processo/Encerrada (ponto colorido + contador).
   - **Carga da equipe:** por executor (não‑encerrados), avatar + nome + nº + barra relativa ao máximo.
2. **Centro (mín. 430px)** — cabeçalho (ícone+título+subtítulo da fila + legenda de cores) e **lista densa**. Cada linha: **anel de SLA** (conic-gradient com `slaInfo().pct` na cor do SLA; miolo com a letra da prioridade na cor da prioridade), `#nr` + título (1 linha), solicitante · setor + tag de equipe, e à direita a **contagem de SLA** (“vence em 16h” / “venceu há 7.8d” / “resolvido”), status em chip e avatar do responsável. Linha selecionada: borda `--primary` + fundo `--sel`. Rodapé com dicas de teclado + total.
3. **Detalhe inline (432px)** — sem modal. Cabeçalho `#nr` + pill de prioridade; título; **segmentado de status** (Aberta/Processo/Encerrada) que **move o chamado** (reusar PATCH status; Processo/Encerrada exigem executor/solução via os diálogos de `app.js`). Barra de **SLA** (meta vs consumido). Cartões **Solicitante** (avatar, setor, botões Email/Teams via `commLinha`) e **Responsável** (avatar/estado + “Atribuir a mim”). Descrição. **Atividade** (timeline derivada dos campos existentes). **Solução** (textarea; `GET/PUT /relato`). Rodapé fixo: Encerrar/Reabrir + Anexos (contador de `qt_anexos`; lista via `/anexos`).

**Ordenação da lista:** por `slaInfo().pct` desc (mais urgente primeiro); encerrados por último.

**Teclado (só quando o modo Cockpit está ativo e o foco não está em input/textarea):**
- `J` / `K` — próximo/anterior na lista (atualiza seleção).
- `E` — atribuir o selecionado ao usuário logado (e mover p/ Processo se estava Aberto) — via as regras existentes.
- `C` — encerrar o selecionado (dispara o fluxo de solução obrigatória já existente).

**Usuário logado ("ME"):** o protótipo usa "Diego César" fixo. Em produção, use o usuário real do app (o mesmo conceito de `KANBAN_APP_USER`/usuário da sessão que o front já conhece); se não houver identidade no front hoje, deixar configurável numa constante e alinhar com a equipe — **sem** criar auth no backend.

---

## INDICADORES — especificação

Base: `GET /api/chamados/periodo?inicio&fim` (já usado por `metricas.js`) + filtros já existentes (escopo, equipe, prioridade, setor). **Reaproveitar os cálculos do `metricas.js`.** Só muda o visual (ver `screenshots/4-indicadores.png`):

- **Cartões de resumo** (topo, grid auto‑fit ~150px): Total no período, Abertos, Em processo, Encerrados, **SLA no prazo (%)**, **Tempo médio de atendimento**. Barra de acento colorida à esquerda de cada card.
- **Status dos chamados** — donut (conic-gradient) Aberta/Processo/Encerrada + legenda; total no miolo.
- **Carga por responsável** — barras horizontais (label 130px · trilho · valor), cor por avatar; "Sem responsável" em cinza.
- **Distribuição por equipe** — barras (cor por equipe: Sistemas azul, Service Desk verde, Infra roxo, BI âmbar).
- **Prioridade** — barras (cores de prioridade).
- **Faixas de idade** — colunas verticais: `≤2d, 3–7d, 8–15d, 16–30d, >30d` (verde→vermelho), altura relativa ao máximo.
- **Cumprimento de SLA** — donut dentro/vencido + % no prazo + tempo médio. % calculado no front (`slaInfo`).

Nota de rodapé com as metas de SLA por prioridade.

---

## Interações, estados e detalhes finos

- **Tema claro/escuro:** já existe (`alternarTema` em `common.js`, `html[data-theme]`, persistência em `localStorage['kanban_tema']`, sem flash via script inline no `<head>`). Manter; o botão de tema fica no topo persistente.
- **Persistência de estado de UI (só front, `localStorage`):** modo/hash atual, fila selecionada do Cockpit, filtros do Kanban (já existe `kanban_chamados_filtros_v1`). **Nunca** sobrescrever chaves que você não criou.
- **Auto-refresh (45s):** manter a lógica de `app.js` (pausa com drag/modal/aba oculta/busca em foco). Ao recarregar o store, re-renderizar apenas o modo ativo.
- **Loading:** skeleton do Kanban já existe; replicar padrão leve no Cockpit/Indicadores.
- **Empty states:** "Fila zerada" (Cockpit), "Nenhum chamado aqui" (coluna Kanban), "Selecione um chamado" (detalhe vazio).
- **Acessibilidade:** prioridade nunca só por cor (sempre com rótulo); alvos ≥ alturas confortáveis; `aria-label` nos botões‑ícone; foco visível.
- **Responsivo:** Cockpit e Kanban rolam horizontalmente abaixo de ~1180px (larguras mínimas dos painéis/colunas). Indicadores usa grid de 12 colunas que colapsa (já há media queries no `style.css` para a página de métricas — reaproveitar).
- **Animações:** transições curtas (120–200ms) em hover/seleção; modal com fade+pop (~180ms). Sem exageros.

---

## Guardrails de implementação (checklist para o Claude Code)

- [ ] Nenhum arquivo fora de `frontend/` foi tocado.
- [ ] Nenhuma rota FastAPI nova; nenhum payload novo; nenhum campo de banco.
- [ ] Só os endpoints listados são chamados.
- [ ] SLA é 100% calculado no cliente (constante `SLA_META_H`).
- [ ] Lógica de escrita (atribuir/mover/encerrar/criar) **reusa** as funções de `app.js`; regras 422 preservadas.
- [ ] `common.js` continua a fonte única de helpers; sem duplicar `api/esc/toast/avatarColor/...`.
- [ ] Tema claro/escuro funciona nos 3 modos e na tela inicial.
- [ ] Kanban em produção mantém 100% do comportamento atual.
- [ ] Testes existentes (`pytest`) continuam passando (não dependem do front, mas confirme que nada de backend mudou).

---

## Arquivos deste pacote

- `README.md` — este plano (autossuficiente).
- `DESIGN_TOKENS.css` — variáveis CSS prontas para mesclar em `frontend/style.css`.
- `design_reference/` — protótipos `.dc.html` (referência de design) + `support.js` (runtime só p/ visualizar).
- `screenshots/` — `1-tela-inicial.png`, `2-kanban.png`, `3-cockpit.png`, `4-indicadores.png`.

**Sugestão de nomes de arquivos novos no `frontend/`:** `home.js`, `cockpit.js`, `indicadores.js` (a partir de `metricas.js`), e um pequeno `store.js`/`router.js` (opcionais) — todos servidos pelo mount de estáticos existente.
