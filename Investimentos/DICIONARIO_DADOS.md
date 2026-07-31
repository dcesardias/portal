# Dicionário de Dados — Módulo de Solicitação de Investimentos

> Escopo: **apenas o módulo de Solicitação de Investimentos** (o data mart de Orçamento foi descontinuado e está fora deste documento).
> Fonte: banco `sc_orcamento` em `SERVER55\DW` (SQL Server 2016), validado em campo.
> Legenda de tipos conforme SQL Server. **Nenhuma** dessas tabelas possui *foreign keys*, *defaults* ou *triggers* no banco (todo o vínculo é lógico, por código em coluna texto).

---

## 1. Tabela central — `tb_investimento_unificado`
Cada linha = 1 item de um pedido de investimento. PK: `ID_INVESTIMENTO` (bigint, identity).

| Coluna | Tipo | Nulo | Descrição / regra | Observação p/ rebuild |
|--------|------|:--:|-------------------|----------------------|
| `ID_INVESTIMENTO` | bigint | NÃO | PK, identidade | Manter como PK |
| `DS_SOLICITANTE` | varchar(255) | SIM | **login** do solicitante (=`usr_login`) | Vira FK → `usuario` |
| `DS_ESTABELECIMENTO` | varchar(255) | SIM | **Código** do estabelecimento (ex.: "1"=Ibirapuera) — apesar do prefixo `DS_`, guarda ID | FK → `estabelecimento` (int) |
| `DS_UNIDADE_NEGOCIO` | varchar(255) | SIM | **Código** da unidade de negócio (`NR_SEQ_UNID_NEG`) | FK → `unidade_negocio` |
| `CD_CENTRO_CUSTO` | varchar(255) | SIM | Código do centro de custo | FK → `centro_custo` |
| `DS_GRUPO` | varchar(255) | SIM | **Código** do grupo de investimento (1–11) | FK → `grupo_investimento` (int) |
| `NM_ITEM` | varchar(4000) | SIM | **ID** do item (`tb_itens`) ou do instrumental (`tb_instrumentaiscirurgicos`), conforme o grupo | FK polimórfica → resolver no rebuild |
| `DS_AGRUPAMENTO` | varchar(255) | SIM | Agrupamento (derivado do catálogo) | Derivar do item; não persistir |
| `DS_ITEM` | varchar(4000) | SIM | Descrição livre do item pedido | Manter |
| `DS_ESPECIFICACAO` | varchar(4000) | SIM | Especificação técnica | Manter |
| `DS_MOTIVO` | varchar(4000) | SIM | **ID** do motivo (`tb_motivos`) | FK → `motivo` |
| `DS_JUSTIFICATIVA` | varchar(4000) | SIM | Justificativa do solicitante | Manter |
| `DS_PROJETO` | varchar(4000) | SIM | Projeto associado (texto) | Manter (opcional) |
| `QT_ITEM` | int | SIM | Quantidade | `int > 0` |
| `VL_UNITARIO` | decimal(10,2) | SIM | Valor unitário | `decimal(14,2)` no novo |
| `VL_TOTAL` | decimal(10,2) | SIM | **Calculado** = QT×VL_UNITARIO | Calcular na app/coluna computada |
| `DT_SOLICITACAO` | datetime | SIM | Data/hora da solicitação | `NOT NULL default now()` |
| `DT_RECURSO` | date | SIM | "Quando o item precisa estar disponível para uso?" | Manter |
| `IE_DEMOLICOES` | int | SIM | Escopo obra: demolições (0/1) | `bit` |
| `IE_PISO` | int | SIM | Escopo obra: piso (0/1) | `bit` |
| `IE_FORRO` | int | SIM | Escopo obra: forro (0/1) | `bit` |
| `IE_AR_CONDICIONADO` | int | SIM | Escopo obra: ar-condicionado (0/1) | `bit` |
| `IE_MARCENARIA` | int | SIM | Escopo obra: marcenaria (0/1) | `bit` |
| `IE_CAIXILHOS` | int | SIM | Escopo obra: caixilhos (0/1) | `bit` |
| `CD_APROVACAO` | int | SIM | **Status** do investimento (ver §7). Sem default. | Núcleo da máquina de estados |
| `NR_SEQ_STATUS_INV` | int | SIM | Sequência de status — **só contém 0/NULL** nos dados | ⚠️ legado; reavaliar |
| `IE_REVISADO` | varchar(1) | SIM | 'N'/vazio — marcador de revisão | `bit` |
| `NM_APROVADOR_PONTO_FOCAL` | varchar(255) | SIM | Login do aprovador N1 — **0 usos** | ver §7 |
| `DT_APROV_FOCAL` | date | SIM | Data aprovação N1 — **0 usos** | — |
| `DS_JUSTIFICATIVA_APROV_FOCAL` | varchar(4000) | SIM | Parecer N1 | — |
| `NM_APROVADOR_SUP` | varchar(255) | SIM | Login do aprovador N2 — 292 usos | ver §7 |
| `DT_APROV_SUP` | date | SIM | Data aprovação N2 | — |
| `DS_JUSTIFICATIVA_APROV_SUP` | varchar(4000) | SIM | Parecer N2 | — |
| `NM_APROVADOR_GESTOR` | varchar(255) | SIM | Login aprovador "Gestor" — **0 usos** | ⚠️ campo morto |
| `DT_APROV_GESTOR` | date | SIM | — | ⚠️ morto |
| `DS_JUSTIFICATIVA_APROV_GESTOR` | varchar(4000) | SIM | — | ⚠️ morto |
| `NM_APROVADOR_FINAL` | varchar(255) | SIM | Login do aprovador final/GPE — 292 usos | ver §7 |
| `DT_APROV_FINAL` | date | SIM | Data aprovação final | — |
| `DS_TIPO_VERBA` | varchar(255) | SIM | "Verba Pública"/vazio (56 preenchidos) | Enum: RP/VP |
| `DS_TIPO_INVESTIMENTO` | varchar(255) | SIM | **Sempre vazio/NULL** | ⚠️ coluna morta — descartar |
| `DS_CLASSE` | varchar(255) | SIM | **Sempre vazio/NULL** | ⚠️ coluna morta — descartar |
| `ID_TABELA_ANTIGA` | int | SIM | Chave do sistema legado (migração) | Não migrar |
| `ID_TAB_REC_ANTIGA` | int | SIM | Chave legado p/ casar recebimento | Não migrar |

**Modelo atual normalizado embutido:** a tabela é "flat" (denormalizada) — armazena itens/obras/instrumentais juntos, com muitos campos aplicáveis só a obras (`IE_*`) ou só a aprovação. No rebuild convém separar (ver `PLANO_MODERNIZACAO.md`).

---

## 2. `tb_investimentos_recebimentos` (recebimento — Previsto)
Registro de entrega/recebimento de um item aprovado. PK `ID` (bigint identity).

| Coluna | Tipo | Nulo | Descrição |
|--------|------|:--:|-----------|
| `ID` | bigint | NÃO | PK |
| `ID_ITEM` | int | SIM | Vínculo lógico → `tb_investimento_unificado.ID_INVESTIMENTO` (via `coalesce(ID_TAB_REC_ANTIGA, ID_INVESTIMENTO)`) |
| `QT` | float | SIM | Quantidade recebida — ⚠️ `float` (usar decimal/int) |
| `VALOR` | float | SIM | Valor recebido — ⚠️ `float` |
| `DT_RECEB` | datetime | SIM | Data do recebimento |
| `NR_NOTA` | varchar(100) | SIM | Nº da nota fiscal |
| `CNPJ_FORNECEDOR` | varchar(max) | SIM | CNPJ do fornecedor — ⚠️ tipo exagerado (usar varchar(14)) |
| `USUARIO_RECEB` | varchar(100) | SIM | Login de quem recebeu |
| `JUSTIFICATIVA` | varchar(max) | SIM | Observação |
| `STATUS` | varchar(max) | SIM | **Sempre vazio/NULL** — ⚠️ coluna morta |
| `ID_TABELA_ANTIGA` | int | SIM | Migração |

---

## 3. `tb_investimento_naoprevisto` (recebimento — Não Previsto)
Itens recebidos **sem** solicitação prévia (27 colunas; subconjunto da tabela central + campos de recebimento). PK `ID`. Campos-chave: `USUARIO_RECEB`, `NR_SEQ_STATUS_INV=9` (marcador "não previsto"), `DT_RECEB`, `NR_NOTA`, `CNPJ_FORNECEDOR`, além de `DS_GRUPO/NM_ITEM/CD_CENTRO_CUSTO/QT_ITEM/VL_*`. 59 linhas.

## 4. `tb_pre_solicitacao` (pré-solicitação)
Estrutura **idêntica** a `tb_investimento_unificado` (43 colunas), usada por uma tela específica (grupo 6). **0 linhas hoje** — fluxo inativo. `ID_INVESTIMENTO` é identity mas **não é PK**.

## 5. `tb_investimento_unificado_historico` (auditoria)
Cópia **integral** da linha (43 colunas iguais à central) gravada a cada alteração. 819 linhas. Não tem chave própria além do identity herdado. No rebuild → substituir por tabela de auditoria/eventos adequada.

---

## 6. Tabelas de domínio

### `tb_grupos_investimento` (10 linhas)
| Coluna | Tipo | Nulo |
|--------|------|:--:|
| `id_grupoinvestimento` | int | NÃO (não declarado PK) |
| `nome_grupoinvestimento` | varchar(255) | NÃO |
| `cd_conta_contabil` | varchar(max) | SIM |

Valores: 1 Equip. Oficina Ortopédica · 2 Equip. Reabilitação · 3 Equip. Diagnósticos e Laboratoriais · 4 Equip. Hospitalares · 5 Equip. Não Assistenciais · 6 Equip., Infraestrutura e Software · 7 Instrumentais Cirúrgicos · 8 Mobiliários e Utensílios · 9 Obras, Reformas e Serviços de Infraestrutura · 11 Outros.

### `tb_itens` (961 linhas; 735 com RENEM)
`id_item` int · `nome_item` · `agrupamento_item` · `classificacao_item` · `definicao_item` · `especificacao_item` · `valor_item` money · `id_grupoinvestimento` int · `Ativo` varchar(1) S/N · `id_renem` int · `ds_renem` (integração RENEM/registro de equipamentos).

### `tb_instrumentaiscirurgicos` (775 linhas)
`id_instrumentalcirurgico` **float** ⚠️ · `nome_instrumentalcirurgico` · `agrupamento_instrumentalcirurgico` · `id_grupoinvestimento` **float** ⚠️ · `valor_instrumentalcirurgico` money · `tipo_verba` · `classe` · `Ativo` varchar(1).

### `tb_motivos` (4 linhas)
`id_motivo` int · `nome_motivo`. Valores: 1 Reposição · 2 Aumento · 3 Inovação · 4 Modernização.

### `tb_aprovadores` (288 linhas) — matriz de alçada
`ID` bigint PK · `id_estabelecimento` **float** · `id_grupoinvestimento` **float** · `ponto_focal` varchar(255) · `aprovador_sup` varchar(255) · `aprovador_final` varchar(255).
⚠️ **Dados redundantes:** ~3 camadas por (estab×grupo) — linhas reais + linha `admin/admin` + linha `gestor/superintendencia/invgpe`. `aprovador_final` chega a ser **multivalorado em texto** (`dcesar-conuki-srodrigu`).

### `tb_status_aprovacao` (16 linhas) — ver §7
`valor_status_aprovacao` bigint PK · `nome_status_aprovacao`.

### `tb_status_investimento` (4 linhas)
`nr_sequencia` int · `ds_status` · `ie_situacao` (A). Valores: 1 Cancelado · 2 Em andamento · 3 Concluído · 4 Prorrogado. (Pouco usado pela tabela central.)

---

## 7. Domínio de status (`CD_APROVACAO`) — dois pipelines
**RP = Recurso Próprio · VP = Verba Pública.**

| Código | Descrição | Pipeline |
|:--:|-----------|:--:|
| 1 | Cancelado | — |
| 2 | RP - Solicitado | RP |
| 3 / 17 | RP - Aprovado | RP |
| 4 | RP - Concluído | RP |
| 5 | RP - Em andamento | RP |
| 6 | Aguardando | — |
| 7 | VP - Proposição | VP |
| 8 | VP - Submetido | VP |
| 9 | VP - Captação | VP |
| 10 | VP - Conveniamento | VP |
| 11 | VP - Execução | VP |
| 12 | VP - Concluído | VP |
| 15 | **Liberado para Aprovação** (estado inicial) | — |
| 16 | VP - Alocar | VP |
| 18 | RP - 2025 | RP |

**Filas (grids) por status:** N1 `CD_APROVACAO=15`; N2 `NR_SEQ_STATUS_INV=3` (vazio na prática); Revisão `CD_APROVACAO=1`; Recebimento `CD_APROVACAO=9`; "Minhas" `CD_APROVACAO=6`.
**Prática real:** aprovação Ponto Focal (N1) e "Gestor" **não são usadas**; o GPE define o status no formulário de aprovação final.

---

## 8. Segurança (para planejar autenticação)

### `secusr_users` (117)
`login` PK · `pswd` · `name` · `email` · `active` (S/N) · `activation_code` · `priv_admin` (Y/N) · `mfa` · `picture` (image).
⚠️ **`pswd` tem 5–9 caracteres e não é hash** — provável texto/cifra reversível fraca. **No rebuild: substituir por hash forte (bcrypt/argon2) ou SSO corporativo.**

### `secusr_groups` (5) / `secusr_users_groups`
Perfis: 1 Administrador · 2 Solicitante (padrão) · 3 Gestor · 4 GPE · 5 Regras Matriz.
⚠️ Permissões por app **abertas** (todos os perfis acessam quase tudo); a proteção real hoje é o filtro SQL por `usr_login`.

---

## 9. Dados externos (integração — `Fonte`/`Staging` via linked server `SERVER12`)
Consumidos via `vw_centrocusto_un`:
- **Estabelecimentos (9):** 1 AACD Ibirapuera · 2 AACD Mooca · 3 AACD Osasco · 4 AACD Recife · 5 AACD Porto Alegre · 6 AACD Uberlândia · 56 AACD Mogi · 57 AACD Lar Escola · 59 AACD Samburá.
- **Centro de Custo** (`Fonte.dbo.CENTRO_CUSTO`) e **Unidade de Negócio** (`Staging.dbo.VW_UNIDADE_NEGOCIO`).
No rebuild: decidir entre **integrar** (replicar/consultar a fonte corporativa) ou **manter linked server**.

---
*Complementos: `DOCUMENTACAO_SISTEMA_ORCAMENTARIO.md` (visão geral/fluxo) e `PLANO_MODERNIZACAO.md` (modelo novo + arquitetura).*
