# Kanban de Chamados — TI (Tasy)

Um quadro estilo Trello onde **cada card é uma Ordem de Serviço (chamado de TI)** do Tasy, com colunas por status. Permite **arrastar** cards entre colunas (muda o status), **editar**, **atribuir responsável** e **encerrar** chamados.

Recursos de UX: **tema claro/escuro** (botão no topo, respeita o tema do SO), **auto-refresh** a cada 45s (multiusuário), **filtros de seleção múltipla** (status, grupo de planejamento, grupo de trabalho, prioridade, responsável, setor), **página de indicadores** dedicada (`/metricas`) com os mesmos recortes — carga por responsável/equipe/prioridade/setor, faixas de idade e tempos médios — e ação **Reabrir** logo após encerrar.

> ⚠️ **Ambiente de HOMOLOGAÇÃO.** As ações gravam **direto** nos campos da tabela `MAN_ORDEM_SERVICO` do Tasy (escrita simplificada — não reproduz todo o fluxo de estágios/liberação do Tasy). Validar bem em HML antes de pensar em produção.

## Como rodar

Pré-requisitos (já presentes na máquina onde foi montado):
- Python 3.13
- Oracle Instant Client em `C:\oracle\instantclient_19_23` (modo *thick* é obrigatório — o banco usa verificador de senha 0x939)

```bash
pip install -r requirements.txt
# 1ª vez: copie backend/.env.example para backend/.env e preencha TASY_PASSWORD
# Windows: basta dar duplo clique em start.bat, ou:
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Acesse: http://localhost:8000

## Configuração

A **senha do banco** é obrigatória e fica em `backend/.env` (não versionado — veja
`backend/.env.example`). Os demais parâmetros ficam em [backend/config.py](backend/config.py)
e podem ser sobrescritos por variáveis de ambiente ou pelo próprio `.env`:

| Variável | Padrão |
|---|---|
| `TASY_USER` | usrtasy |
| `TASY_PASSWORD` | **obrigatória** (em `backend/.env`) |
| `TASY_HOST` | odascan |
| `TASY_PORT` | 1521 |
| `TASY_SERVICE` | tasyhmlg.spcentral.iaacd.org.br |
| `ORACLE_CLIENT_DIR` | C:\oracle\instantclient_19_23 |
| `KANBAN_APP_USER` | Kanban (gravado em nm_usuario ao alterar) |

## Arquitetura

```
KanbanChamados/
├─ backend/
│  ├─ config.py   parâmetros de conexão, grupos de planej., status
│  ├─ db.py       pool Oracle + consulta dos chamados + updates
│  └─ main.py     API FastAPI + serve o frontend
├─ frontend/
│  ├─ index.html    quadro + modais (edição, novo, atribuir, encerrar)
│  ├─ metricas.html página dedicada de indicadores (rota /metricas)
│  ├─ style.css     temas claro/escuro
│  ├─ common.js     utilitários compartilhados (api, esc, tema, formatação…)
│  ├─ app.js        SortableJS (drag), filtros, edição, autocomplete
│  ├─ metricas.js   indicadores + filtros de recorte (multi-select)
│  └─ vendor/       SortableJS local (sem CDN)
├─ tests/         testes da API (pytest, sem Oracle)
├─ requirements.txt
├─ requirements-dev.txt
└─ start.bat
```

## Testes

Os testes cobrem as **regras de negócio do caminho de escrita** (executor
obrigatório p/ Processo, solução obrigatória p/ encerrar, status inválido,
validações de criação/edição) e **não dependem do Oracle** — a camada `db` é
mockada.

```bash
pip install -r requirements-dev.txt
pytest -q
```

### Endpoints
- `GET  /api/chamados` — lista os chamados do quadro (não-encerrados + encerrados recentes)
- `GET  /api/chamados/periodo?inicio&fim` — **todos** os chamados (inclusive encerrados)
  abertos no intervalo (datas `YYYY-MM-DD`). Base do dashboard de indicadores.
- `POST /api/chamados` — cria uma nova OS (status Aberta). Campos: solicitante
  (`cd_pessoa_solicitante`), `ds_dano_breve`, `ds_dano`, `ie_prioridade`,
  `nr_grupo_planej` (TI), `nr_grupo_trabalho` (opcional). Fixos: tipo Corretiva (1),
  localização 1, equipamento 2. ⚠️ dispara o trigger Tasy `AACD_ORDEM_SERV_OS_EMAIL` (e-mail).
- `GET  /api/grupos` — grupos de planejamento (TI) e de trabalho, com nomes
- `PATCH /api/chamados/{nr}/status` — move o card (`ie_status_ordem` 1/2/3).
  Para **encerrar** (status 3) é obrigatório `ds_relato` (a solução) — senão retorna 422.
- `PATCH /api/chamados/{nr}` — edita descrição/prioridade/executor
- `GET  /api/chamados/{nr}/anexos` — lista anexos (nome, autor, data)
- `GET  /api/usuarios?q=` — autocomplete de executores (usuários Tasy ativos)

### Regras de fluxo (executor + encerramento)
- **Aberta → Processo exige executor.** Ao mover um card para *Processo* sem
  responsável, o app pede o executor (autocomplete de usuários Tasy) e só então move.
  No backend, mover para status 2 sem executor retorna **422**.
- **Executor não pode ser removido em Processo/Encerrada.** Tentar limpar o executor de
  um chamado em status 2 ou 3 retorna **422** (no front, o Salvar é bloqueado). Só é
  possível remover o executor enquanto o chamado está *Aberta*.
- **Encerrar exige solução.** Ao arrastar para *Encerrada* (ou botão Encerrar), o app
  pede a **solução / relato técnico** (obrigatório; 422 no backend se vazio).
- **O relato é atribuído ao executor.** O registro técnico do encerramento é gravado
  com `NM_USUARIO`/`NM_USUARIO_LIB` = login do **executor** do chamado (não o usuário do app),
  e `NM_USUARIO_ENCER` também = executor.

O encerramento grava, numa transação:
- `MAN_ORDEM_SERV_TECNICO.DS_RELAT_TECNICO` (o relato), com `DT_LIBERACAO`/`NM_USUARIO_LIB`;
- `MAN_ORDEM_SERVICO`: `IE_STATUS_ORDEM=3`, `DT_FIM_REAL`, `NM_USUARIO_ENCER` e
  `DS_SOLUCAO` (resumo, 255 chars).

O executor é gravado em `MAN_ORDEM_SERVICO_EXEC` (tabela lida pela consulta).

## Colunas (domínio 1279)
`Aberta (1)` · `Processo (2)` · `Encerrada (3)`

## Limitações conhecidas (escrita simplificada)
- **Atribuir responsável** grava em `man_ordem_servico.nm_usuario_exec`. Se a OS já tiver
  técnico/executor nas tabelas filhas (`MAN_ORDEM_SERVICO_EXEC` / `MAN_ORDEM_SERV_TECNICO`),
  estas têm precedência na exibição do executor "correto".
- **Encerrar** marca `ie_status_ordem = 3` e grava `dt_fim_real`/`nm_usuario_encer`,
  mas não dispara o fluxo completo de encerramento do Tasy.
- A consulta só traz chamados **não encerrados** ou **encerrados/movimentados hoje**
  (regra herdada da consulta original), então cards encerrados somem do quadro no dia seguinte.
