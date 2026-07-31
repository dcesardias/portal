# Sistema Orçamentário (AACD) — Documentação Técnica e Funcional

> **Origem:** backup ScriptCase 9 (`sc9_bkp_SISTEMA_ORCAMENTARIO_20260710-111031.zip`) **+ validação direta no banco** `SERVER55\DW` / `sc_orcamento` (SQL Server 2016).
> **Projeto ScriptCase:** `SISTEMA_ORCAMENTARIO` — gerador **9.9.014** · runtime PHP.
> **Total de aplicações:** 95 (formulários, grids, controles, menus, filtros).
> **Status deste documento:** as regras foram **confirmadas contra os dados reais** do banco. Onde o comportamento observado nos dados difere do que o backup sugeria, há uma nota **✅ Confirmado** ou **⚠️ Divergência/atenção**.

---

## 1. Visão Geral

O **Sistema Orçamentário** é um portal web (ScriptCase/PHP sobre SQL Server) usado pela AACD para **solicitar, aprovar, revisar e registrar o recebimento de investimentos** (CAPEX). Um "investimento" é um pedido de compra/obra classificado em três categorias, todas na tabela central `tb_investimento_unificado` (691 registros ativos):

| Categoria | `DS_GRUPO` | Qtde | Valor total |
|-----------|:---:|---:|---:|
| **Itens** (equipamentos, mobiliário, TI, etc.) | 1,2,3,4,5,6,8 | 531 | ~R$ 39,8 mi |
| **Obras** (obras, reformas, infraestrutura) | 9 | 129 | ~R$ 30,8 mi |
| **Instrumentais** (instrumentais cirúrgicos) | 7 | 31 | ~R$ 1,2 mi |

O ciclo desenhado é **Solicitação → Aprovação (Ponto Focal → Superior → Final/GPE) → Recebimento**, com desvio de **Revisão** e fluxo paralelo de **Não Previsto**. **Na prática (ver §4.4), o fluxo real é mais curto:** o solicitante cria o pedido e o **GPE** processa e define o status final diretamente.

### Grupos de investimento (`tb_grupos_investimento`) — valores reais
| id | Nome | Conta contábil |
|:--:|------|:--:|
| 1 | Equipamentos de Oficina Ortopédica | 13002104 |
| 2 | Equipamentos de Reabilitação | 13002103 |
| 3 | Equipamentos Diagnósticos e Laboratoriais | 13002103 |
| 4 | Equipamentos Hospitalares | 13002103 |
| 5 | Equipamentos Não Assistenciais | 13002106 |
| 6 | Equipamentos, Infraestrutura e Software | 13002105 |
| 7 | Instrumentais Cirúrgicos | 13002103 |
| 8 | Mobiliários e Utensílios | 13002108 |
| 9 | Obras, Reformas e Serviços de Infraestrutura | 13002102 |
| 11 | Outros | (Outros) |

*(Não há grupo 10; o grupo 6 é usado por uma tela especial de "pré-solicitação"; o grupo 11 é excluído das telas de solicitação.)*

---

## 2. Arquitetura Técnica

### 2.1 Plataforma
- **Front-end:** ScriptCase 9 (PHP gerado). **Banco:** SQL Server 2016 (`SERVER55\DW`, banco **`sc_orcamento`**), conexão `conn_mssql` (`mssqlnative`).
- **Autenticação de banco:** integrada Windows (a aplicação web usa um usuário de serviço próprio; credenciais criptografadas no backup).

### 2.2 Arquitetura multi-banco (linked servers)
O banco `sc_orcamento` **integra três servidores** via *linked servers* — essencial para entender de onde vêm os dados:

| Linked server | Tipo | Papel |
|---------------|------|-------|
| **SERVER55** (local) | SQL Server | Hospeda `sc_orcamento` (o sistema). |
| **SERVER12** | SQL Server | Hospeda os bancos **`Fonte`** (cadastro de centros de custo/estabelecimentos) e **`Staging`** (unidades de negócio). |
| **TASYPROD** | Oracle (`odascan:1521`) | **ERP hospitalar Philips Tasy** — origem de dados de atendimentos/orçamento assistencial. |

A *view* **`vw_centrocusto_un`** (usada em todos os *dropdowns* de localização) materializa esse cruzamento:
```sql
CREATE view [dbo].[vw_centrocusto_un] as
select b.CD_CENTRO_CUSTO,
  case when substring(b.DS_CENTRO_CUSTO,1,3)='IBI'
       then concat(cast(b.CD_CENTRO_CUSTO as varchar),' - ',b.DS_CENTRO_CUSTO)
       else replace(b.DS_CENTRO_CUSTO,'.','') end as DS_CENTRO_CUSTO,
  a.NR_SEQ_UNID_NEG, a.DS_UNIDADE_NEGOCIO,
  c.CD_ESTABELECIMENTO, c.NM_FANTASIA_ESTAB
from Staging.dbo.VW_UNIDADE_NEGOCIO a
inner join Fonte.dbo.CENTRO_CUSTO b ...
```

### 2.3 Segurança e Perfis
Módulo de segurança padrão do ScriptCase (tabelas `secusr_*`), com **5 perfis** (`secusr_groups`) e 117 usuários:

| group_id | Perfil | Nº de usuários |
|:--:|--------|:--:|
| 1 | Administrador | 6 |
| 2 | **Solicitante** (grupo padrão de novos usuários) | 116 |
| 3 | Gestor | 24 |
| 4 | **GPE** (Gestão de Planejamento Econômico) | 8 |
| 5 | Regras Matriz | 4 |

**⚠️ Achado importante de segurança:** as permissões por grupo (`secusr_groups_apps`) são **praticamente abertas** — todos os perfis (inclusive *Solicitante*) têm acesso a ~110 das aplicações, incluindo as telas de aprovação e cadastros. **A segregação funcional real NÃO vem da permissão por aplicação**, e sim de dois outros mecanismos:
1. **Filtros SQL por `usr_login`** em cada grid (um solicitante só enxerga *seus* pedidos; um aprovador só enxerga o que lhe cabe via `tb_aprovadores`);
2. O **menu customizado** apresentado ao usuário.
Isso significa que, se alguém acessar a URL de uma tela fora do seu papel, o controle que resta é o filtro de dados — ponto de atenção para auditoria/hardening.

Login (`app_Login`): valida `secusr_users` (só `active='Y'`), publica as globais de sessão **`usr_login`**, `usr_name`, `usr_email`, `usr_priv_admin`; suporta login social (Google/Facebook) criando o usuário no grupo 2. `get_settings()` carrega `secusr_settings` em `$_SESSION['sett_*']`.

---

## 3. Modelo de Dados

### 3.1 Tabela central — `dbo.tb_investimento_unificado` (PK `ID_INVESTIMENTO`)
Concentra as três categorias. Colunas por área funcional:

**Classificação:** `DS_GRUPO` (FK grupo), `NM_ITEM` (FK `tb_itens`/`tb_instrumentaiscirurgicos`), `DS_AGRUPAMENTO`, `DS_CLASSE`, `DS_TIPO_INVESTIMENTO`, `DS_TIPO_VERBA` (ex.: "Verba Própria", "Verba Pública"), `DS_PROJETO`.

**Localização orçamentária** (de `vw_centrocusto_un`): `DS_ESTABELECIMENTO`, `CD_CENTRO_CUSTO`, `DS_UNIDADE_NEGOCIO`.

**Pedido:** `DS_ITEM`, `DS_ESPECIFICACAO`, `DS_MOTIVO` (FK), `DS_JUSTIFICATIVA`, `QT_ITEM`, `VL_UNITARIO`, `VL_TOTAL` (=`QT_ITEM×VL_UNITARIO`), `DT_SOLICITACAO`, `DT_RECURSO` ("quando precisa estar disponível"), e indicadores de obra `IE_DEMOLICOES/PISO/FORRO/AR_CONDICIONADO/MARCENARIA/CAIXILHOS`.

**Controle de fluxo (máquina de estados):**
| Coluna | Papel |
|--------|-------|
| `CD_APROVACAO` (int) | **Status do investimento** (ver §4). Nullable, **sem default**. |
| `NR_SEQ_STATUS_INV` (int) | Sequência de status. **Na prática só contém 0 ou NULL** (ver §4.4). |
| `IE_REVISADO` | Marcador de revisão |
| `NM_APROVADOR_PONTO_FOCAL` / `DT_APROV_FOCAL` / `DS_JUSTIFICATIVA_APROV_FOCAL` | Nível 1 |
| `NM_APROVADOR_SUP` / `DT_APROV_SUP` / `DS_JUSTIFICATIVA_APROV_SUP` | Nível 2 |
| `NM_APROVADOR_GESTOR` / `DT_APROV_GESTOR` / `DS_JUSTIFICATIVA_APROV_GESTOR` | Nível "Gestor" — **campos existem mas nunca preenchidos** (legado) |
| `NM_APROVADOR_FINAL` / `DT_APROV_FINAL` | Aprovação Final (GPE) |
| `DS_SOLICITANTE` | `login` do solicitante (= `usr_login` na criação) |
| `ID_TABELA_ANTIGA` / `ID_TAB_REC_ANTIGA` | Chaves de migração do sistema anterior |

### 3.2 Tabelas de apoio (com contagem real)
| Tabela | Linhas | Conteúdo |
|--------|---:|----------|
| `tb_itens` | 961 | Catálogo de itens (`Ativo` S/N, grupo, valor, agrupamento) |
| `tb_instrumentaiscirurgicos` | 775 | Catálogo de instrumentais |
| `tb_aprovadores` | 288 | **Matriz de aprovadores** por estabelecimento × grupo (ver §4.3) |
| `tb_motivos` | 4 | Reposição / Aumento / Inovação / Modernização |
| `tb_status_aprovacao` | 16 | Domínio de status (ver §4.1) |
| `tb_status_investimento` | 4 | Cancelado / Em andamento / Concluído / Prorrogado |
| `tb_investimentos_recebimentos` | 147 | Recebimentos (NF, fornecedor, qtd, valor) |
| `tb_investimento_naoprevisto` | 59 | Investimentos recebidos sem solicitação |
| `tb_investimento_unificado_historico` | 819 | **Histórico/auditoria** (cópia integral da linha a cada gravação) |
| `tb_investimento_unificado_bkp` / `tb_itens_bkp` / `tb_status_aprovacao_bkp` | — | Backups pontuais |
| `tb_investimento_carga` / `tb_investimento_stg` / `tb_depara_itensrecebidos_temp` | 63/0/45 | Carga/staging/de-para de migração |

### 3.3 Subsistema Orçamentário/Financeiro (fora do front-end ScriptCase)
O banco `sc_orcamento` também hospeda um **data mart de orçamento** muito maior que o portal de investimentos, alimentado a partir do Tasy e consumido por *views* (provavelmente por Power BI / relatórios), **não** exposto nas 95 telas ScriptCase (exceto os cadastros de Projeção):

| Tabela/View | Linhas | Observação |
|-------------|---:|-----------|
| `tb_base_projecao` | **4.187.484** | Base de projeção orçamentária (grão fino) |
| `tb_orcamento_financeiro_alteracao` | 253.293 | Movimentações do orçamento financeiro |
| `tb_permissoes_orcamento_financeiro(_vis)` | 43k / 62k | Controle de acesso por linha do orçamento |
| `tb_orcamento_financeiro_base(_agg/_final)` | 68k/65k/11k | Bases consolidadas |
| `tb_orcamento_atendimentos(_base)` | 12k/1,4k | Orçamento assistencial (Tasy) |
| `tb_regra_orcamento_2` | 900 | Regras de orçamento vigentes |
| `tb_tipo_calculo` | 8 | Índices/tipos de cálculo |
| `tb_cenario_projecao` | 1 | Cenário de projeção |
| Views `VW_ORCAMENTO_2025`, `vw_orcamento_financeiro(_final/_final_e2)`, `vw_orcamento_atendimentos(_alteracao)`, `VW_CONTA_CONTABIL_PESSOAL` | — | Camada de consumo/relatório |
| Procedure `sp_atualizar_tb_base_projecao` | — | Rotina de carga da base de projeção |

> Este subsistema é **relacionado, porém separado** do módulo de solicitação de investimentos. As telas ScriptCase "Projeção" (`tb_base_projecao`, `tb_cenario_projecao`) são a ponta visível dele.

---

## 4. Máquina de Estados (fluxo de aprovação) — validada com dados

### 4.1 `CD_APROVACAO` — domínio real (`tb_status_aprovacao`)
Há **dois pipelines de financiamento** codificados no mesmo campo:
**RP = Recurso Próprio** · **VP = Verba Pública** (confirmado pelo campo `DS_TIPO_VERBA`).

| Código | Descrição | Pipeline | Qtde em uso |
|:--:|-----------|:--:|--:|
| 1 | Cancelado | — | 6 |
| 2 | RP - Solicitado | RP | 65 |
| 3 / 17 | RP - Aprovado | RP | — |
| 4 | RP - Concluído | RP | — |
| 5 | RP - Em andamento | RP | — |
| 6 | Aguardando | — | — |
| 7 | VP - Proposição | VP | 12 |
| 8 | VP - Submetido | VP | 30 |
| 9 | VP - Captação | VP | 46 |
| 10 | VP - Conveniamento | VP | 15 |
| 11 | VP - Execução | VP | — |
| 12 | VP - Concluído | VP | — |
| 15 | **Liberado para Aprovação** (estado inicial da solicitação) | — | **467** |
| 16 | VP - Alocar | VP | 49 |
| 18 | RP - 2025 | RP | 1 |

O estado dominante é **15 – Liberado para Aprovação** (467 dos 691): é onde o pedido "nasce" e aguarda o GPE.

### 4.2 `NR_SEQ_STATUS_INV`
Referencia conceitualmente `tb_status_investimento` (1=Cancelado, 2=Em andamento, 3=Concluído, 4=Prorrogado), **mas nos dados só existe `0` (629) e `NULL` (62)**. Ou seja, a "fila N2" que depende de `NR_SEQ_STATUS_INV=3` **está sempre vazia** — o desenho não é exercitado (ver §4.4).

### 4.3 `tb_aprovadores` — quem aprova o quê
Mapeia **(estabelecimento × grupo de investimento) → aprovadores**: `ponto_focal` (N1), `aprovador_sup` (N2), `aprovador_final` (N3/GPE). Há **9 estabelecimentos** e os 10 grupos.
- `aprovador_final` tem só **2 valores**: `dcesar-conuki-srodrigu` (campo multivalorado: 3 pessoas do GPE) e `invgpe`.
- **⚠️ Redundância de dados:** 288 linhas para ~90 combinações (estab×grupo). Existem ~3 "camadas" repetidas por combinação: a dos aprovadores nomeados reais, uma linha `admin/admin/...` e uma linha genérica `gestor/superintendencia/invgpe`. Recomenda-se limpar/normalizar (as *lookups* das telas fazem `TOP`/`distinct`, então funciona, mas é frágil).

### 4.4 Como as transições realmente acontecem — ✅ confirmado
**Não há triggers, defaults nem procedures de negócio** governando o status (verificado: `sys.triggers`=0 na tabela; colunas de status são *nullable* sem default). Portanto, **quem muda o status é a camada de aplicação**:
- **Formulários `aprovar_n1` / `aprovar_n2`**: apenas gravam nome/data/justificativa do aprovador. **Não mexem** em `CD_APROVACAO`.
- **Formulário `aprovar_n3` (Final/GPE)**: é o **único** em que `CD_APROVACAO` é **editável** (dropdown "Status Item" alimentado por `tb_status_aprovacao`). É aqui que o GPE define manualmente o status (liberar p/ RP, avançar no pipeline VP, cancelar, etc.).

**Fluxo real observado nos dados (difere do desenho):**
- `DT_APROV_FOCAL` preenchido em **0** registros → **o nível "Ponto Focal" (N1) não é usado**.
- `DT_APROV_SUP` e `DT_APROV_FINAL` preenchidos em **292** cada → aprovação concentrada nos níveis Superior/Final.
- Nos registros mais recentes, até o SUP fica em branco e **apenas o GPE** (`NM_APROVADOR_FINAL` = `conuki`) processa e define o status.

➡️ **Conclusão:** o sistema **foi desenhado** para aprovação sequencial em 3 níveis por estabelecimento/grupo, mas **opera** essencialmente como "Solicitante cria (status 15) → GPE analisa e define o status/pipeline". Os níveis Focal/Sup e o campo `NR_SEQ_STATUS_INV` são estrutura legada pouco/não exercitada.

### 4.5 Diagrama (desenho vs. prática)
```
 SOLICITANTE cria pedido ─────────────► CD_APROVACAO = 15 "Liberado para Aprovação"
   (Solicitacoes/*_novos; DS_SOLICITANTE = usr_login)          │
                                                               ▼
   ┌─────────────────── DESENHO (pouco usado) ───────────────────┐
   │  N1 Ponto Focal (fila CD=15 + ponto_focal=user)              │
   │      └► N2 Superior (fila NR_SEQ_STATUS_INV=3 + sup=user)    │   ⚠️ 0 aprovações focais;
   │             └► N3 Final/GPE                                   │      NR_SEQ_STATUS_INV nunca = 3
   └──────────────────────────────────────────────────────────────┘
                                                               ▼
   ┌──────────────────── PRÁTICA (real) ─────────────────────────┐
   │  GPE abre *_aprovar_n3, define CD_APROVACAO:                  │
   │    • Recurso Próprio:  2→3/17→4/5   (Solicitado→Aprovado→…)   │
   │    • Verba Pública:    7→8→9→10→11→12→16 (pipeline captação)  │
   │    • 1 = Cancelado                                            │
   └──────────────────────────────────────────────────────────────┘
                                                               ▼
   RECEBIMENTO: itens liberados → registra NF/fornecedor/qtd/valor
   (tb_investimentos_recebimentos, filtro por USUARIO_RECEB=usr_login)

 REVISÃO (CD_APROVACAO=1 + DS_SOLICITANTE=usr_login): pedido volta ao solicitante.
 NÃO PREVISTO: recebimento sem solicitação → NR_SEQ_STATUS_INV=9 / tb_investimento_naoprevisto.
 ACOMPANHAMENTO: "Minhas Solicitações"/"Meus itens" (CD_APROVACAO=6 = Aguardando, do solicitante).
```

---

## 5. Módulos e Telas (95 aplicações)

A navegação segue as pastas ScriptCase (= menu). O **menu de runtime** expõe: **Solicitações**, **Relatórios**, **Cadastros**, **GPE** (aprovação final) e **Trocar Senha/Sair**. (Inventário completo no anexo `DOCUMENTACAO_INVENTARIO_APLICACOES.md`.)

### 5.1 Solicitações (`root/Solicitacoes`)
Grids "meus/minhas" + formulários de criação/edição por categoria.
- **Novos:** `*_itens_novos`, `*_instrumental_novos` (fixa `DS_GRUPO=7`), `*_obras_novos` (fixa `DS_GRUPO=9`), `pre_solicitacao_itens_novos` (grupo 6, grava em `tb_pre_solicitacao` — **hoje com 0 linhas**).
  - `onLoadAll`: `DS_SOLICITANTE=usr_login`, zera estabelecimento/centro de custo (força seleção em cascata).
  - **Cálculo:** ao mudar `QT_ITEM`/`VL_UNITARIO` → `VL_TOTAL = QT_ITEM×VL_UNITARIO`.
- **Grids:** `meus_itens`/`meus_instrumentais`/`minhas_obras` (do solicitante, `CD_APROVACAO=6`); `minhas_solicitacoes` (painel geral, ver §6.4).

### 5.2 Aprovações (`root/Aprovacoes/{Itens,Obras,Instrumentais}`)
- `grid/form *_aprovar_n1` — fila `CD_APROVACAO=15` + `ponto_focal=usr_login`; grava aprovador/data focal.
- `grid/form *_aprovar_n2` — fila `NR_SEQ_STATUS_INV=3` + `aprovador_sup=usr_login`; grava aprovador/data sup.
- `form *_aprovar_n3` — **Aprovação Final/GPE**: status editável; grava `NM_APROVADOR_FINAL`/`DT_APROV_FINAL`. É o ponto efetivo de decisão (§4.4).

### 5.3 Revisão (`root/Revisao`)
`grid *_revisar` (fila `CD_APROVACAO=1` + `DS_SOLICITANTE=usr_login`; Obras também `NR_SEQ_STATUS_INV=0`) + `form *_revisao` (recalcula `VL_TOTAL`).

### 5.4 Recebimento (`root/Recebimento`)
- **Previsto:** grids de itens liberados (`CD_APROVACAO=9`) + `form tb_investimentos_recebimentos_{itens,obras,instrumentais}` — registra `NR_NOTA`, `CNPJ_FORNECEDOR`, `QT`, `VALOR`, `DT_RECEB`, `JUSTIFICATIVA`; grava `USUARIO_RECEB=usr_login` e `ID_ITEM`. Grids "editar" filtram por `USUARIO_RECEB=usr_login` e casam por `ID_ITEM = coalesce(ID_TAB_REC_ANTIGA, ID_INVESTIMENTO)`.
- **Não Previsto:** `form *_naoprevisto` — `USUARIO_RECEB=usr_login`, `NR_SEQ_STATUS_INV=9`, grava em `tb_investimento_naoprevisto`.

### 5.5 Relatórios (`root/Relatorios`)
`grid_..._relatorio` — consolidação geral com `CASE` de categoria (9=Obras, 7=Instrumentais, demais=Itens) resolvendo o nome do item via `tb_itens`/`tb_instrumentaiscirurgicos` e todos os campos de aprovação.

### 5.6 Cadastros (`root/Cadastros`)
CRUD de `tb_itens`, `tb_instrumentaiscirurgicos`, `tb_grupos_investimento`, `tb_motivos`, `tb_status_investimento`/`tb_status_aprovacao`, **`tb_aprovadores`** (governança), `tb_tipo_calculo`.

### 5.7 Projeção (`root/Projecao`)
`tb_base_projecao` e `tb_cenario_projecao` — ponta visível do data mart orçamentário (§3.3).

### 5.8 Segurança (`root/Security`) e Legado (`root/Legado`)
Módulo padrão ScriptCase (usuários, grupos, apps, login, senha, sync, settings). `Legado` = geração anterior (`apps_*`), mantida por compatibilidade; sem regra de negócio orçamentária.

---

## 6. Regras de Negócio e Exceções

### 6.1 Cascata de seleção (dropdowns encadeados)
`Estabelecimento` → `Centro de Custo` (filtra por estabelecimento) → `Unidade de Negócio` (filtra por CC) · `Grupo` → `Item` (por grupo, `Ativo='S'`) · `Ponto Focal`/`Superior` pré-carregados de `tb_aprovadores` (por grupo+estabelecimento). Fontes: `vw_centrocusto_un`, `tb_itens`, `tb_grupos_investimento`, `tb_aprovadores`.

### 6.2 Segmentação por grupo (as três categorias)
Replicado em **todas** as telas: Itens `DS_GRUPO in (1,2,3,4,5,6,8)`, Instrumentais `(7)`, Obras `(9)`; grupo `11` nunca aparece nas solicitações.

### 6.3 Cálculo de valor
`VL_TOTAL` sempre derivado (`QT_ITEM×VL_UNITARIO`) — o usuário não digita o total.

### 6.4 Regras "hard-coded" por login — ⚠️ atenção
No grid **`minhas_solicitacoes`**, regras fixas no SQL:
- **`admin`** vê **todos** os registros;
- **`vdemare`** enxerga como se fosse **`vkaspar`** (delegação embutida), tanto como solicitante quanto como ponto focal.
Além disso, `tb_aprovadores` contém linhas com login `admin` e `gestor` genéricos. **São regras acopladas a logins específicos** — deveriam estar modeladas (delegação/perfil), não em SQL de tela. Risco de manutenção.

### 6.5 Segregação real de acesso
Como as permissões por grupo são abertas (§2.3), a segregação efetiva é por **filtro SQL sobre `usr_login`**: solicitante vê `DS_SOLICITANTE=usr_login`; aprovadores via `tb_aprovadores`; recebimento via `USUARIO_RECEB=usr_login`.

### 6.6 Migração e auditoria
`ID_TABELA_ANTIGA`/`ID_TAB_REC_ANTIGA` + `coalesce(...)` nos joins de recebimento indicam migração de sistema legado. `tb_investimento_unificado_historico` guarda cópia integral da linha (auditoria de alterações).

---

## 7. Pontos de Atenção / Recomendações

1. **Fluxo desenhado ≠ fluxo praticado:** níveis Focal/Sup e `NR_SEQ_STATUS_INV` estão praticamente inativos; a decisão real é do GPE via `aprovar_n3`. Decidir se simplifica o sistema para refletir a prática ou se reativa o fluxo em níveis.
2. **Permissões por grupo abertas** — a proteção depende só dos filtros por `usr_login`. Avaliar restringir apps de aprovação/cadastro aos perfis corretos (Gestor/GPE/Regras Matriz).
3. **Regras hard-coded** (`admin`, `vdemare→vkaspar`) e **`tb_aprovadores` redundante** (288 linhas) — normalizar.
4. **Status sem enforcement no banco:** toda a consistência de `CD_APROVACAO` depende da aplicação; não há trigger/constraint. Um `INSERT`/`UPDATE` direto pode deixar o dado inconsistente.
5. **Dois pipelines (RP/VP)** convivem no mesmo `CD_APROVACAO` — documentar/segregar melhoraria relatórios.

---

## 8. Resumo Executivo
Portal ScriptCase/SQL Server para **solicitação e aprovação de investimentos (CAPEX)** da AACD, em 3 categorias (Itens/Obras/Instrumentais) sobre `tb_investimento_unificado`. Integra **Fonte/Staging** (SERVER12) e o **ERP Tasy** (Oracle) e convive com um **data mart orçamentário** de milhões de linhas. O status vive em `CD_APROVACAO` (pipelines RP/VP), definido **manualmente pelo GPE** — sem triggers no banco. Segurança por perfis existe, mas a proteção efetiva é o **filtro por `usr_login`**. Principais riscos: fluxo desenhado subutilizado, permissões abertas e regras acopladas a logins.

---
*Documento validado contra o banco `sc_orcamento` em SQL Server. Complemento: `DOCUMENTACAO_INVENTARIO_APLICACOES.md` (as 95 aplicações).*
