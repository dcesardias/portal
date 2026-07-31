# KanbanChamados — Grants no Oracle & Alterações da sessão

> Gerado em 2026-07-27. Documentação básica levantada a partir do código
> (`backend/db.py`) e dos erros `ORA-00942` observados nos logs.

---

## 1. Grants no banco (Oracle / Tasy)

### Contexto de conexão
- A aplicação conecta como **`KANBAN_APP`** (`backend/.env` → `TASY_USER=KANBAN_APP`;
  banco de **PRODUÇÃO** `tasyprod.spcentral.iaacd.org.br`).
- Os objetos (tabelas, sequences, funções) pertencem ao schema do Tasy (**`USRTASY`**)
  e são acessados por sinônimos. Portanto **os grants são concedidos por `USRTASY`
  (ou um DBA)** para `KANBAN_APP`.
- **IMPORTANTE:** *estes grants NÃO foram executados por mim nesta sessão.* São ações
  de DBA. Esta seção documenta o que a aplicação **exige** para rodar. Os que
  comprovadamente já estavam faltando em algum momento (viram `ORA-00942` no log)
  estão marcados com ⚠️.

### Tabelas

| Tabela | Privilégios | Usado em |
|---|---|---|
| `MAN_ORDEM_SERVICO` | SELECT, INSERT, UPDATE | consulta do quadro, criar/editar/encerrar chamado, estágio |
| `MAN_ORDEM_SERVICO_EXEC` | SELECT, INSERT, UPDATE | executor do chamado (atribuir / ler) |
| `MAN_ORDEM_SERV_TECNICO` | SELECT, INSERT | histórico de interação + relato de solução |
| `MAN_ORDEM_SERV_ARQ` | SELECT | contagem e listagem de anexos |
| `MAN_EQUIPAMENTO` | SELECT | join da consulta principal |
| `MAN_LOCALIZACAO` | SELECT | join da consulta principal |
| `USUARIO` | SELECT | dados do solicitante/executor, busca de usuários |
| `MAN_ESTAGIO_PROCESSO` | SELECT | ⚠️ catálogo de estágios (`/api/estagios`) |
| `MAN_GRUPO_TRAB_USUARIO` | SELECT | ⚠️ vínculo usuário × grupo (gate de permissão) |
| `MAN_GRUPO_TRABALHO` | SELECT | ⚠️ grupos ativos (gate + `/api/grupos`) |

> ⚠️ Sem os grants marcados, o comportamento **falha em silêncio (fail-open)**:
> - `MAN_GRUPO_TRAB_USUARIO` / `MAN_GRUPO_TRABALHO` ausentes → regra de vínculo
>   desligada (qualquer um "trabalha" qualquer chamado).
> - `MAN_ESTAGIO_PROCESSO` ausente → cai num fallback de estágios "em uso".

### Sequences (SELECT)

| Sequence | Usado em |
|---|---|
| `MAN_ORDEM_SERVICO_SEQ` | criar chamado |
| `MAN_ORDEM_SERVICO_EXEC_SEQ` | atribuir executor |
| `MAN_ORDEM_SERV_TECNICO_SEQ` | inserir histórico/relato |

### Funções PL/SQL (EXECUTE)
Chamadas na consulta principal — no Tasy normalmente já são acessíveis (execute
público). Listadas para conferência caso apareça `ORA-00904/ORA-00942` na função:
`obter_usuario_pf`, `obter_nome_setor`, `man_obter_nome_apelido`, `obter_valor_dominio`,
`obter_desc_grupo_trab`, `obter_desc_grupo_planej`, `obter_desc_estagio_proc`,
`obter_nome_usuario`, `obter_nome_estabelecimento`, `obter_dados_setor`.

### Script de referência (executar como `USRTASY` / DBA)

```sql
-- Tabelas
GRANT SELECT, INSERT, UPDATE ON usrtasy.man_ordem_servico       TO KANBAN_APP;
GRANT SELECT, INSERT, UPDATE ON usrtasy.man_ordem_servico_exec  TO KANBAN_APP;
GRANT SELECT, INSERT         ON usrtasy.man_ordem_serv_tecnico  TO KANBAN_APP;
GRANT SELECT                 ON usrtasy.man_ordem_serv_arq      TO KANBAN_APP;
GRANT SELECT                 ON usrtasy.man_equipamento         TO KANBAN_APP;
GRANT SELECT                 ON usrtasy.man_localizacao         TO KANBAN_APP;
GRANT SELECT                 ON usrtasy.usuario                 TO KANBAN_APP;
GRANT SELECT                 ON usrtasy.man_estagio_processo    TO KANBAN_APP;  -- ⚠️
GRANT SELECT                 ON usrtasy.man_grupo_trab_usuario  TO KANBAN_APP;  -- ⚠️
GRANT SELECT                 ON usrtasy.man_grupo_trabalho      TO KANBAN_APP;  -- ⚠️

-- Sequences
GRANT SELECT ON usrtasy.man_ordem_servico_seq      TO KANBAN_APP;
GRANT SELECT ON usrtasy.man_ordem_servico_exec_seq TO KANBAN_APP;
GRANT SELECT ON usrtasy.man_ordem_serv_tecnico_seq TO KANBAN_APP;

-- Funções (só se derem erro de acesso — normalmente já públicas)
-- GRANT EXECUTE ON usrtasy.obter_valor_dominio TO KANBAN_APP;  -- (etc.)
```

> Sinônimos: se os nomes não resolverem sem o prefixo `usrtasy.`, criar sinônimos
> (públicos ou privados em `KANBAN_APP`) para cada objeto.

---

## 2. Alterações que fiz nesta sessão

### Código (correção de bug)
- **Bug do executor ao encerrar** (`backend/db.py`): o encerramento exigia executor,
  mas lia só `MAN_ORDEM_SERVICO_EXEC`, enquanto a lista resolvia com fallback para
  `MAN_ORDEM_SERVICO.NM_USUARIO_EXEC`. Chamado atribuído nativamente no Tasy dava
  **422 "Atribua um executor"** mesmo aparecendo como atribuído. Consolidei a
  resolução num único SQL (`_SQL_EXEC_ATUAL`, com fallback) usado por
  `executor_atual` e `encerrar_chamado`.
  → **Exigiu restart do serviço** (feito).

### Código (UI / ajustes pedidos)
- **Cockpit — coluna de detalhe mais larga** (`frontend/style.css`): `.cp-detail` 520→600px.
- **Histórico vira chat** (`frontend/app.js` + `style.css`): `historicoItemHTML`
  reescrito com bolhas (minhas à direita / demais à esquerda, classe `hi-mine`);
  CSS de chat.
- **Mais altura no histórico**: `.historico-list` `max-height` 320→640px; e
  `#cp-historico { min-height: clamp(360px,48vh,620px) }` (cockpit tinha painel
  rolando inteiro, por isso `max-height` sozinho não surtia efeito).
- **Flash dos cards da tela inicial** (`frontend/style.css`): `.home-pills
  { min-height:37px }` (reserva a linha de resumo) e `.home-card { min-height:150px }`
  (estabiliza contra o swap da fonte).
- **F5 mantém a view atual** (`frontend/router.js` + `index.html`): a view passou a
  ser persistida em `sessionStorage` e restaurada quando não há hash (o checkpoint de
  auth por aba descartava o `#/...`); hash preservado na limpeza do `_kauth`.
- **Cache-busters** (`frontend/index.html`): `style.css` v31→v36, `app.js` v36→v37,
  `router.js` v2→v3.

### Serviço Windows
- Reiniciei o serviço `KanbanChamados` uma vez (para valer o fix do executor).
- A pedido, **parei e desabilitei** o serviço: `Status=Stopped`, `StartType=Disabled`
  (não sobe em reboot). Para religar:
  ```powershell
  Set-Service KanbanChamados -StartupType Automatic
  Start-Service KanbanChamados
  ```

### Correção de e-mails duplicados ao solicitante (2026-07-27)
Trigger `USRTASY.AACD_ORDEM_SERV_OS_EMAIL` disparava em **qualquer** UPDATE da OS e o
app fazia **várias UPDATEs por ação** → e-mails repetidos. Ajustes:

- **App — 1 UPDATE por ação:**
  - `salvarModal` ([app.js](frontend/app.js)) manda **um único PATCH** com campos + `ie_status_ordem` + `ds_relato` (antes eram 2 requests: campos + `/status`).
  - `editar` ([main.py](backend/main.py)) orquestra tudo numa escrita só: status 1/2 vai junto dos campos em `atualizar_campos`; status 3 vai por `encerrar_chamado(..., campos=...)` (campos aplicados na MESMA UPDATE do encerramento).
  - `salvar_relato` ([db.py](backend/db.py)) **não atualiza mais a OS** (nota vive só no histórico) — remove UPDATE supérflua.
  - `CamposIn` ganhou `ie_status_ordem` e `ds_relato`.
- **DBA — escopo de colunas no trigger:** [dba/AACD_ORDEM_SERV_OS_EMAIL_fix.sql](dba/AACD_ORDEM_SERV_OS_EMAIL_fix.sql) — `CREATE OR REPLACE` idêntico ao atual, só mudando o evento para `INSERT OR UPDATE OF ie_status_ordem, nr_seq_estagio, nr_seq_complex, ds_contato_solicitante`. (Aplicar com cliente UTF-8; ver comentários no arquivo.)
- Exigiu **restart do serviço** (feito) — backend não tem hot-reload.

> ⚠️ O e-mail é `autonomous_transaction`: envia ao **solicitante real** mesmo em HML e mesmo com rollback. Não testar escrita na OS "só pra ver".

### O que NÃO fiz
- **Nenhum `GRANT`** nem qualquer escrita commitada no Oracle. Os diagnósticos no
  banco rodaram com **rollback** (nada persistido).
- Não apliquei os *hardenings* sugeridos (aviso visível quando o gate cai em
  fail-open; check `podeTrabalhar` no clique do `cp-encerrar`) — ficaram como
  sugestão.
