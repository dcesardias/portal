# Plano de Modernização — Sistema de Solicitação de Investimentos (AACD)

> Objetivo: **reconstruir do zero** o módulo de Solicitação de Investimentos numa stack web moderna (**React + Node.js + SQL Server novo**), preservando as regras válidas e corrigindo os problemas estruturais do sistema ScriptCase.
> Escopo: **somente** solicitação/aprovação/recebimento de investimentos. O data mart de Orçamento está **descontinuado** e fora do projeto.
>
> **Requisitos de direção (definidos pelo cliente):**
> 1. **Ambos os fluxos de aprovação** devem coexistir → motor de aprovação **configurável** (não fixo em código).
> 2. **Tela de Admin robusta** e intuitiva: configuração e cadastro de todo o sistema.
> 3. **Autenticação própria** (login/senha) — Entra ID/SSO **não** é opção por ora.
> 4. **Centros de custo** já vêm de uma **view** (`vw_centrocusto_un`) sobre `Fonte`/`Staging`, na **mesma instância** → consumir a view direto, sem replicar.

---

## 1. Por que reconstruir (dores atuais)

| Problema atual | Impacto | Como o rebuild resolve |
|----------------|---------|------------------------|
| Modelagem "flat" e sem integridade (0 FKs, tipos inconsistentes `int`/`float`/`varchar` p/ o mesmo conceito) | Dados inconsistentes, difícil evoluir | Modelo normalizado com FKs, constraints e tipos corretos |
| Colunas `DS_*` guardam **códigos**, não descrições; colunas mortas (`DS_CLASSE`, `DS_TIPO_INVESTIMENTO`, `STATUS`) | Confusão, dados enganosos | Nomes claros, remoção do morto |
| Fluxo de aprovação **fixo e subutilizado** (N1→N2→N3 no código, mas só GPE usa) | Sem flexibilidade | **Motor de fluxo configurável** (§4) |
| Máquina de estados só na tela (sem trigger/constraint); status manual | Estado inválido possível | *State machine* validada no backend |
| Segurança: senhas fracas (5–9 chars, sem hash), permissões abertas, regras *hard-coded* (`admin`, `vdemare→vkaspar`) | Risco de segurança | Auth própria robusta (§3) + RBAC real + delegação modelada |
| `tb_aprovadores` redundante (288 linhas, alçada em texto multivalorado) | Manutenção frágil | Alçada normalizada + **Admin** para gerir (§5) |
| Configuração espalhada / só via ScriptCase | Dependência de ferramenta, TI no meio de tudo | **Admin** self-service para o negócio configurar |

---

## 2. Arquitetura alvo

```
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND — React (Vite + TypeScript)                              │
│  • App do usuário (solicitar / aprovar / receber)                  │
│  • App de Admin (cadastros + configurador de fluxo + RBAC)         │
│  • TanStack Query · React Hook Form + Zod · rotas por perfil       │
└───────────────▲───────────────────────────────────────────────────┘
                │ HTTPS / REST (JSON) + JWT (access) + refresh cookie
┌───────────────┴───────────────────────────────────────────────────┐
│  BACKEND — Node.js (NestJS)                                        │
│  • Controller → Service (regras) → Repository                      │
│  • Auth PRÓPRIA: login/senha (Argon2id) + refresh + MFA opcional   │
│  • Autorização: RBAC (perfis+permissões) + alçada                  │
│  • MOTOR DE FLUXO configurável (resolve etapas por contexto)       │
│  • Validação Zod · Máquina de estados no domínio · Auditoria       │
│  • ORM: Prisma (SQL Server)                                        │
└───────────────▲───────────────────────────────────────────────────┘
                │  (mesma instância SQL Server)
┌───────────────┴───────────────────────────────────────────────────┐
│  BANCO — SQL Server (novo schema normalizado)                      │
│  • FKs, constraints, índices · migrations versionadas              │
│  • Lê a VIEW vw_centrocusto_un (Fonte/Staging) — sem replicar      │
└────────────────────────────────────────────────────────────────────┘
```

**Stack concreta sugerida:**
- **Frontend:** React 18 + TypeScript + Vite · TanStack Query · React Router · React Hook Form + Zod · MUI ou shadcn/ui · Recharts.
- **Backend:** Node 20 + **NestJS** (módulos, DI, *guards* p/ RBAC) + **Prisma** (SQL Server) + Jest.
- **Auth:** própria (ver §3). **Infra:** Docker · GitHub Actions · dev/homolog/prod.

---

## 3. Autenticação e Segurança (implementação própria)

Como SSO não é opção agora, o login/senha é reconstruído **com segurança de verdade** (e deixando a porta aberta para SSO no futuro, via camada de *auth provider* abstrata).

**Modelo e regras:**
- Hash de senha **Argon2id** (ou bcrypt custo ≥ 12) — nunca texto/cifra reversível. Salt por usuário embutido no hash.
- **Política de senha** configurável (tamanho mínimo, complexidade, expiração opcional, histórico p/ evitar reuso).
- **Bloqueio progressivo** após N tentativas (rate-limit + lockout temporário) e log de tentativas.
- **Reset de senha** por token de e-mail com expiração (reaproveita o conceito de `activation_code`).
- **Ativação de conta** e flag `ativo`.
- **MFA opcional (TOTP)** por usuário/perfil — o schema já prevê (`mfa`); habilitável no Admin.
- **Sessão:** JWT de acesso curto (~15 min) + **refresh token** em cookie `httpOnly`/`Secure`; *logout* revoga refresh.
- **Autorização:** RBAC por **perfil + permissões** (não "tudo liberado" como hoje) — *guards* no backend barram acesso indevido mesmo que a rota seja acessada direto.
- **Delegação** modelada (tabela `delegacao`) — substitui o *hard-code* `vdemare→vkaspar`.
- **Auditoria** de login, troca de senha, mudança de permissão e de configuração.

> **Migração:** não migrar as senhas atuais (fracas). No *cutover*, forçar redefinição (e-mail de definição de senha) ou carga com senha temporária + troca no 1º acesso.

---

## 4. Motor de Fluxo de Aprovação **configurável** (ambos os fluxos)

O coração do novo sistema. Em vez de fixar "3 níveis" no código, um **fluxo é um dado configurável** no Admin. Assim convivem, por exemplo:
- **Fluxo "GPE Direto"** — 1 etapa (aprovador = perfil GPE). Reflete a prática atual.
- **Fluxo "3 Níveis"** — Ponto Focal → Superior → Final, resolvidos pela alçada (estab × grupo).
- Qualquer outro fluxo futuro, sem alterar código.

**Como um fluxo é aplicado (resolução por contexto):** uma regra decide qual fluxo vale para cada solicitação, por **estabelecimento, grupo, tipo de verba e/ou faixa de valor**. Exemplo real e útil: pedidos até R$ X seguem o "GPE Direto"; acima de R$ X exigem o "3 Níveis".

**Modelo de dados do motor:**
```
fluxo_aprovacao(id, nome, descricao, ativo)
fluxo_etapa(id, fluxo_id→, ordem, nome,
            fonte_aprovador,        -- ALCADA_FOCAL | ALCADA_SUP | ALCADA_FINAL | PERFIL | USUARIO
            perfil_id?, usuario_id?,-- quando fonte = PERFIL / USUARIO
            obrigatoria BIT, permite_revisao BIT, aprovacao_paralela BIT)
regra_fluxo(id, prioridade, estabelecimento_id?, grupo_id?, tipo_verba?,
            vl_min?, vl_max?, fluxo_id→)   -- resolve o fluxo aplicável; há um fluxo default
```
Na criação/envio da solicitação, o backend **resolve o fluxo** (via `regra_fluxo`, maior prioridade que casa) e **materializa as etapas** a percorrer. A instância de aprovação grava cada decisão:
```
solicitacao.fluxo_id            -- snapshot do fluxo aplicado
aprovacao(id, solicitacao_id→ (ou item), etapa_id→, aprovador_id→,
          decisao,              -- APROVADO | REPROVADO | REVISAO
          justificativa, data)
```
**Regras do motor:**
- Avança para a próxima etapa obrigatória quando a atual é aprovada; conclui o fluxo na última.
- `REVISAO` devolve ao solicitante (volta a RASCUNHO/EM_REVISAO) preservando histórico.
- `REPROVADO` encerra (CANCELADO) com justificativa.
- `aprovacao_paralela` permite N aprovadores na mesma etapa (ex.: comitê) — regra de quórum configurável.
- Resolução de aprovador por **ALCADA_*** usa a matriz normalizada (`regra_alcada`); por **PERFIL** qualquer usuário do perfil (ex.: GPE); por **USUARIO** um nomeado.

---

## 5. Módulo de Administração (tela robusta)

App de Admin dedicado (rota protegida a Administrador/perfis com permissão), organizado por áreas. UX: navegação lateral, busca, tabelas com filtro/edição inline, formulários validados, e **pré-visualização** onde faz sentido (ex.: simular qual fluxo cai numa solicitação de teste).

| Área do Admin | O que gerencia |
|---------------|----------------|
| **Dashboard** | Indicadores operacionais (pendências por etapa, tempo médio de aprovação, valores por grupo/unidade). |
| **Catálogos** | Itens, Instrumentais (com Ativo, RENEM), Grupos de Investimento, Motivos — CRUD com importação. |
| **Alçada / Aprovadores** | Editor da matriz **Estabelecimento × Grupo → aprovadores** por nível (substitui `tb_aprovadores`). |
| **Configurador de Fluxo** ⭐ | Criar/editar fluxos e suas **etapas** (ordem, fonte do aprovador, revisão, paralelismo); definir **regras** de qual fluxo se aplica (por unidade/grupo/verba/valor) com prioridade; ativar/desativar; **simulador**. |
| **Status & Pipelines** | Configurar os status e o mapeamento RP/VP (ou o modelo de estados novo). |
| **Usuários & Perfis (RBAC)** | Usuários (ativar, resetar senha, MFA), Perfis e **permissões por funcionalidade** (não "tudo liberado"), Delegações. |
| **Parâmetros do sistema** | Política de senha, textos/labels, e-mails de notificação, faixas de valor padrão, feature flags. |
| **Auditoria** | Consulta aos eventos (quem mudou o quê, quando) — inclui mudanças de configuração e de fluxo. |

> Princípio: **o negócio configura sem depender de deploy**. Mudar um fluxo, um limite de valor ou um aprovador é operação de Admin, não de código.

---

## 6. Novo modelo de dados (proposto)

Normalizado, com PKs/FKs e tipos corretos. Nomes claros em português.

```
-- Identidade / segurança --
usuario(id, login, nome, email, senha_hash, ativo, mfa_segredo?, dt_criacao, ...)
perfil(id, nome)                                   -- Solicitante, Gestor, GPE, Admin, ...
usuario_perfil(usuario_id→, perfil_id→)
permissao(id, chave)                               -- ex.: SOLICITACAO_APROVAR, ADMIN_FLUXO
perfil_permissao(perfil_id→, permissao_id→)
delegacao(id, usuario_origem→, usuario_destino→, dt_inicio, dt_fim)

-- Referências (centro de custo vem da VIEW, não replicado) --
/* estabelecimento / unidade_negocio / centro_custo → lidos de vw_centrocusto_un */
grupo_investimento(id, nome, conta_contabil, categoria)   -- ITEM | OBRA | INSTRUMENTAL
item_catalogo(id, nome, grupo_id→, agrupamento, classificacao, especificacao,
              valor_referencia, ativo, id_renem, ds_renem)
instrumental_catalogo(id, nome, grupo_id→, agrupamento, classe,
              valor_referencia, tipo_verba, ativo)
motivo(id, nome)
status_investimento(id, nome, pipeline)            -- RP | VP | GERAL

-- Pedido --
solicitacao(id, solicitante_id→, estabelecimento_id, unidade_negocio_id,
            centro_custo_codigo, dt_solicitacao, tipo_verba, status_id→,
            dt_recurso, projeto, fluxo_id→)         -- fluxo aplicado (snapshot)
solicitacao_item(id, solicitacao_id→, grupo_id→, item_id?→, instrumental_id?→,
            descricao, especificacao, motivo_id→, justificativa,
            quantidade, valor_unitario, valor_total,
            ie_demolicoes, ie_piso, ie_forro, ie_ar_condicionado,
            ie_marcenaria, ie_caixilhos)            -- escopo de obra (grupo=OBRA)

-- Motor de fluxo (ver §4) --
fluxo_aprovacao(...)  fluxo_etapa(...)  regra_fluxo(...)
regra_alcada(id, estabelecimento_id, grupo_id)
regra_alcada_aprovador(id, regra_id→, nivel, usuario_id→)
aprovacao(id, solicitacao_id→, etapa_id→, aprovador_id→, decisao, justificativa, data)

-- Recebimento & auditoria --
recebimento(id, solicitacao_item_id→, usuario_id→, dt_receb, quantidade, valor,
            nr_nota, cnpj_fornecedor, justificativa, previsto BIT)
evento_auditoria(id, entidade, entidade_id, usuario_id→, acao, dados_json, data)
```

**Decisões-chave:** cabeçalho × item separados; aprovação como **eventos** (suporta N etapas/fluxos e histórico); alçada e fluxo **configuráveis**; catálogos tipados com `categoria` (elimina a lógica `DS_GRUPO in (...)`); centro de custo **consumido da view**.

---

## 7. Design da API (REST — esboço)

```
Auth        POST /auth/login · /auth/refresh · /auth/logout · POST /auth/senha/reset
            GET  /auth/me
Catálogos   GET  /estabelecimentos · /centros-custo?estab= · /unidades?cc=
            GET  /grupos · /itens?grupo= · /motivos
Solicitações GET /solicitacoes?status=&minhas=&fila=  · POST /solicitacoes
            GET/PUT /solicitacoes/:id · POST /solicitacoes/:id/enviar
            POST /solicitacoes/:id/itens (PUT/DELETE .../itens/:id)
Aprovação   GET  /aprovacoes/pendentes            (resolve etapa/fluxo do usuário)
            POST /solicitacoes/:id/aprovar|reprovar|revisar { justificativa }
Recebimento GET  /recebimentos/pendentes · POST /recebimentos · /recebimentos/nao-previsto
Admin       CRUD /admin/itens · /admin/grupos · /admin/motivos · /admin/aprovadores
            CRUD /admin/fluxos · /admin/fluxos/:id/etapas · /admin/regras-fluxo
            POST /admin/fluxos/simular { estab, grupo, verba, valor } → fluxo resolvido
            CRUD /admin/usuarios · /admin/perfis · /admin/permissoes · /admin/delegacoes
            GET  /admin/parametros · /admin/auditoria · GET /relatorios/investimentos
```
Padrões: paginação, RBAC via *guards* (perfil+permissão), validação Zod, OpenAPI/Swagger, erros padronizados.

---

## 8. Integrações
- **Centros de custo / estabelecimento / unidade:** **somente leitura** via `vw_centrocusto_un` (Fonte/Staging, mesma instância). Encapsular num *repository* read-only; **não** criar CRUD para isso.
- **RENEM** (itens) e **ERP Tasy**: manter apenas se necessário ao investimento; fora do MVP.

---

## 9. Migração de dados
1. `tb_investimento_unificado` → `solicitacao` + `solicitacao_item` (converter códigos em FKs).
2. Reconstruir `aprovacao` a partir de `NM_APROVADOR_*`/`DT_APROV_*`; associar ao fluxo "3 Níveis" (histórico) ou "GPE Direto" conforme os campos preenchidos.
3. **Deduplicar** `tb_aprovadores` (remover camadas `admin`/`gestor`) → `regra_alcada`.
4. **Descartar** colunas mortas (`DS_CLASSE`, `DS_TIPO_INVESTIMENTO`, `STATUS`) e chaves de legado.
5. **Senhas:** não migrar (forçar redefinição / SSO futuro).
6. Recebimentos: casar por `coalesce(ID_TAB_REC_ANTIGA, ID_INVESTIMENTO)`.
7. Rodar em **paralelo** validando totais por grupo/estabelecimento contra o legado.

---

## 10. Roadmap sugerido (fases)

| Fase | Entregas | Duração |
|------|----------|:--:|
| **0. Descoberta** | Validar presets de fluxo com GPE/Gestores; definir permissões por perfil e política de senha | 1–2 sem |
| **1. Fundação + Auth** | Schema novo + migrations, **auth própria (Argon2 + RBAC + MFA opcional)**, leitura da view de CC, catálogos base | 3 sem |
| **2. Admin (parte 1)** | Cadastros (itens/grupos/motivos), Alçada, Usuários/Perfis/Permissões | 2–3 sem |
| **3. Solicitação** | Pedido (cascata, cálculo, itens), "minhas solicitações" | 3 sem |
| **4. Motor de Fluxo + Admin (parte 2)** | **Configurador de fluxo + regras + simulador**; execução do fluxo na aprovação | 3–4 sem |
| **5. Aprovação** | Filas por etapa/perfil/alçada, aprovar/reprovar/revisar, notificações | 2–3 sem |
| **6. Recebimento** | Previsto + não previsto | 2 sem |
| **7. Relatórios & Dashboard** | Consolidado + indicadores; Admin auditoria | 2 sem |
| **8. Migração & Go-live** | ETL, validação paralela, treinamento, cutover | 2–3 sem |

---

## 11. Riscos e quick wins
**Riscos:** definição dos presets de fluxo (validar Fase 0); segurança da auth própria (seguir §3 à risca — é onde mais se erra); qualidade da migração (limpar na ETL).
**Quick wins no legado (enquanto o novo não chega):** trocar/forçar senhas fortes; restringir permissões de app por perfil; remover *hard-code* `vdemare→vkaspar` para tabela de delegação.

---
*Base factual: `DICIONARIO_DADOS.md` e `DOCUMENTACAO_SISTEMA_ORCAMENTARIO.md`.*
