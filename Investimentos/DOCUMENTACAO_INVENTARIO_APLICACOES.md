# Anexo — Inventário Completo das 95 Aplicações

> Complemento de `DOCUMENTACAO_SISTEMA_ORCAMENTARIO.md`. Lista integral das aplicações do projeto ScriptCase `SISTEMA_ORCAMENTARIO`, com a pasta (= posição no menu), tipo e tabela/base associada.

Tipos ScriptCase: **form**=formulário · **cons**=grid/consulta · **contr**/**contrusr**=controle · **menu**/**menutree**=menu · **filter**=filtro.

| Pasta (menu) | Aplica��o | Tipo | Tabela |
|---|---|---|---|
| root | `grid_dbo_tb_investimento_unificado_minhas_solicitacoes` | cons | dbo.tb_investimento_unificado |
| root | `menu` | menu | ___NM_APL_MEN___ |
| root/Aprovacoes/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_aprovar_n1` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_aprovar_n2` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_aprovar_n3` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Instrumentais | `grid_dbo_tb_investimento_unificado_instrumentais_aprovar_n1` | cons | dbo.tb_investimento_unificado |
| root/Aprovacoes/Instrumentais | `grid_dbo_tb_investimento_unificado_instrumentais_aprovar_n2` | cons | dbo.tb_investimento_unificado |
| root/Aprovacoes/Itens | `form_dbo_tb_investimento_unificado_itens_aprovar_n1` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Itens | `form_dbo_tb_investimento_unificado_itens_aprovar_n2` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Itens | `form_dbo_tb_investimento_unificado_itens_aprovar_n3` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Itens | `grid_dbo_tb_investimento_unificado_itens_aprovar_n1` | cons | dbo.tb_investimento_unificado |
| root/Aprovacoes/Itens | `grid_dbo_tb_investimento_unificado_itens_aprovar_n2` | cons | dbo.tb_investimento_unificado |
| root/Aprovacoes/Obras | `form_dbo_tb_investimento_unificado_obras_aprovar_n1` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Obras | `form_dbo_tb_investimento_unificado_obras_aprovar_n2` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Obras | `form_dbo_tb_investimento_unificado_obras_aprovar_n3` | form | dbo.tb_investimento_unificado |
| root/Aprovacoes/Obras | `grid_dbo_tb_investimento_unificado_obras_aprovar_n1` | cons | dbo.tb_investimento_unificado |
| root/Aprovacoes/Obras | `grid_dbo_tb_investimento_unificado_obras_aprovar_n2` | cons | dbo.tb_investimento_unificado |
| root/Cadastros | `form_dbo_tb_aprovadores` | form | dbo.tb_aprovadores |
| root/Cadastros | `form_dbo_tb_grupos_investimento` | form | dbo.tb_grupos_investimento |
| root/Cadastros | `form_dbo_tb_instrumentaiscirurgicos` | form | dbo.tb_instrumentaiscirurgicos |
| root/Cadastros | `form_dbo_tb_itens` | form | dbo.tb_itens |
| root/Cadastros | `form_dbo_tb_motivos` | form | dbo.tb_motivos |
| root/Cadastros | `form_dbo_tb_regra_orcamento` | form | dbo.tb_regra_orcamento_2 |
| root/Cadastros | `form_dbo_tb_status_aprovacao` | form | dbo.tb_status_aprovacao |
| root/Cadastros | `form_dbo_tb_status_investimento` | form | dbo.tb_status_aprovacao |
| root/Cadastros | `form_dbo_tb_tipo_calculo` | form | dbo.tb_tipo_calculo |
| root/Legado | `apps_Login_old` | contr |  |
| root/Legado | `apps_change_pswd` | contr |  |
| root/Legado | `apps_form_add_users` | form | dbo.secusr_users |
| root/Legado | `apps_form_edit_users` | form | dbo.secusr_users |
| root/Legado | `apps_form_sec_apps` | form | dbo.secusr_apps |
| root/Legado | `apps_form_sec_users_apps` | form | dbo.secusr_users_apps |
| root/Legado | `apps_grid_sec_apps` | cons | dbo.secusr_apps |
| root/Legado | `apps_grid_sec_users` | cons | dbo.secusr_users |
| root/Legado | `apps_grid_sec_users_apps` | cons | dbo.secusr_users_apps |
| root/Legado | `apps_menu` | menutree |  |
| root/Legado | `apps_retrieve_pswd` | contr |  |
| root/Legado | `apps_search_sec_users` | filter | dbo.secusr_users |
| root/Legado | `apps_settings` | contr |  |
| root/Legado | `apps_sync_apps` | contr |  |
| root/Projecao | `form_dbo_tb_base_projecao` | form | dbo.tb_base_projecao |
| root/Projecao | `form_dbo_tb_cenario_projecao` | form | dbo.tb_cenario_projecao |
| root/Recebimento/Nao Previsto/Instrumentais | `form_dbo_tb_investimento_unificado_instrumentais_naoprevisto` | form | dbo.tb_investimento_naoprevisto |
| root/Recebimento/Nao Previsto/Itens | `form_dbo_tb_investimento_unificado_itens_naoprevisto` | form | dbo.tb_investimento_naoprevisto |
| root/Recebimento/Nao Previsto/Obras | `form_dbo_tb_investimento_unificado_obras_naoprevista` | form | dbo.tb_investimento_naoprevisto |
| root/Recebimento/Previsto/Instrumentais | `form_dbo_tb_investimentos_recebimentos_instrumentais` | form | dbo.tb_investimentos_recebimentos |
| root/Recebimento/Previsto/Instrumentais | `form_dbo_tb_investimentos_recebimentos_instrumentais_editar` | form | dbo.tb_investimentos_recebimentos |
| root/Recebimento/Previsto/Instrumentais | `grid_dbo_tb_investimento_unificado_recebimento_instrumentais` | cons | dbo.tb_investimento_unificado |
| root/Recebimento/Previsto/Instrumentais | `grid_tb_investimento_unificado_recebimento_instrumentais_editar` | cons | dbo.tb_investimento_unificado |
| root/Recebimento/Previsto/Itens | `form_dbo_tb_investimento_unificado_status` | form | dbo.tb_investimento_unificado |
| root/Recebimento/Previsto/Itens | `form_dbo_tb_investimentos_recebimentos_itens` | form | dbo.tb_investimentos_recebimentos |
| root/Recebimento/Previsto/Itens | `form_dbo_tb_investimentos_recebimentos_itens_editar` | form | dbo.tb_investimentos_recebimentos |
| root/Recebimento/Previsto/Itens | `grid_dbo_tb_investimento_unificado_recebimento_itens` | cons | dbo.tb_investimento_unificado |
| root/Recebimento/Previsto/Itens | `grid_dbo_tb_investimento_unificado_recebimento_itens_editar` | cons | dbo.tb_investimento_unificado |
| root/Recebimento/Previsto/Obras | `form_dbo_tb_investimentos_recebimentos_obras` | form | dbo.tb_investimentos_recebimentos |
| root/Recebimento/Previsto/Obras | `form_dbo_tb_investimentos_recebimentos_obras_editar` | form | dbo.tb_investimentos_recebimentos |
| root/Recebimento/Previsto/Obras | `grid_dbo_tb_investimento_unificado_recebimentos_obras` | cons | dbo.tb_investimento_unificado |
| root/Recebimento/Previsto/Obras | `grid_dbo_tb_investimento_unificado_recebimentos_obras_editar` | cons |  |
| root/Relatorios | `grid_dbo_tb_investimento_unificado_relatorio` | cons | dbo.tb_investimento_unificado |
| root/Revisao/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_revisao` | form | dbo.tb_investimento_unificado |
| root/Revisao/Instrumentais | `grid_dbo_tb_investimento_unificado_instrumentais_revisar` | cons | dbo.tb_investimento_unificado |
| root/Revisao/Itens | `form_dbo_tb_investimento_unificado_itens_revisao` | form | dbo.tb_investimento_unificado |
| root/Revisao/Itens | `grid_dbo_tb_investimento_unificado_itens_revisar` | cons | dbo.tb_investimento_unificado |
| root/Revisao/Obras | `form_dbo_tb_investimento_unificado_obras_revisao` | form | dbo.tb_investimento_unificado |
| root/Revisao/Obras | `grid_dbo_tb_investimento_unificado_obras_revisar` | cons | dbo.tb_investimento_unificado |
| root/Security | `app_Login` | contrusr |  |
| root/Security | `app_Login_old` | contr |  |
| root/Security | `app_change_pswd` | contr |  |
| root/Security | `app_form_add_users` | form | dbo.secusr_users |
| root/Security | `app_form_edit_users` | form | dbo.secusr_users |
| root/Security | `app_form_sec_apps` | form | dbo.secusr_apps |
| root/Security | `app_form_sec_groups` | form | dbo.secusr_groups |
| root/Security | `app_form_sec_groups_apps` | form | dbo.secusr_groups_apps |
| root/Security | `app_grid_sec_apps` | cons | dbo.secusr_apps |
| root/Security | `app_grid_sec_groups` | cons | dbo.secusr_groups |
| root/Security | `app_grid_sec_users` | cons | dbo.secusr_users |
| root/Security | `app_grid_sec_users_groups` | cons | dbo.secusr_users |
| root/Security | `app_menu` | menutree |  |
| root/Security | `app_retrieve_pswd` | contr |  |
| root/Security | `app_search_sec_groups` | filter | dbo.secusr_groups |
| root/Security | `app_settings` | contr |  |
| root/Security | `app_sync_apps` | contr |  |
| root/Solicitacoes/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_editar` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_lib` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Instrumentais | `form_dbo_tb_investimento_unificado_instrumental_novos` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Instrumentais | `grid_dbo_tb_investimento_unificado_meus_instrumentais` | cons | dbo.tb_investimento_unificado |
| root/Solicitacoes/Itens | `form_dbo_tb_investimento_unificado_itens_editar` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Itens | `form_dbo_tb_investimento_unificado_itens_lib` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Itens | `form_dbo_tb_investimento_unificado_itens_novos` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Itens | `form_dbo_tb_pre_solicitacao_itens_novos` | form | dbo.tb_pre_solicitacao |
| root/Solicitacoes/Itens | `grid_dbo_tb_investimento_unificado_meus_itens` | cons | dbo.tb_investimento_unificado |
| root/Solicitacoes/Obras | `form_dbo_tb_investimento_unificado_obras_editar` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Obras | `form_dbo_tb_investimento_unificado_obras_lib` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Obras | `form_dbo_tb_investimento_unificado_obras_novos` | form | dbo.tb_investimento_unificado |
| root/Solicitacoes/Obras | `grid_dbo_tb_investimento_unificado_minhas_obras` | cons | dbo.tb_investimento_unificado |
