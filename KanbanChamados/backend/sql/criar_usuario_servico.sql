-- =============================================================================
--  Kanban de Chamados (TI) — Usuário de SERVIÇO Oracle (Tasy) · PRODUÇÃO
-- =============================================================================
--  Cria a conta de serviço usada pelo backend (backend/db.py) e concede
--  EXCLUSIVAMENTE os privilégios que o código realmente usa (privilégio mínimo).
--
--  Inventário derivado de backend/db.py:
--    Tabelas (DML por verbo realmente usado):
--      MAN_ORDEM_SERVICO        SELECT, INSERT, UPDATE
--      MAN_ORDEM_SERVICO_EXEC   SELECT, INSERT, UPDATE, DELETE
--      MAN_ORDEM_SERV_TECNICO   SELECT, INSERT, UPDATE
--      MAN_ORDEM_SERV_ARQ       SELECT
--      MAN_EQUIPAMENTO          SELECT
--      MAN_LOCALIZACAO          SELECT
--      USUARIO                  SELECT
--    Sequences (.nextval):
--      MAN_ORDEM_SERVICO_SEQ, MAN_ORDEM_SERVICO_EXEC_SEQ, MAN_ORDEM_SERV_TECNICO_SEQ
--    Functions (EXECUTE):
--      OBTER_USUARIO_PF, OBTER_NOME_SETOR, MAN_OBTER_NOME_APELIDO,
--      OBTER_VALOR_DOMINIO, OBTER_DESC_GRUPO_TRAB, OBTER_DESC_GRUPO_PLANEJ,
--      OBTER_DESC_ESTAGIO_PROC, OBTER_NOME_USUARIO, OBTER_NOME_ESTABELECIMENTO,
--      OBTER_DADOS_SETOR
--
--  NÃO concede: DBA, RESOURCE, CREATE TABLE, cota de tablespace (a conta não
--  cria segmentos próprios), nem DELETE em tabelas onde o app não apaga.
--
--  COMO EXECUTAR (SQL*Plus / SQLcl), conectado como um DBA do banco de PRODUÇÃO
--  (ex.: SYSTEM) — é preciso poder criar usuário/role e conceder privilégios
--  sobre objetos do schema dono (GRANT ANY OBJECT PRIVILEGE, incluso no papel DBA):
--
--      sqlplus system@//odascan:1521/tasyprod.spcentral.iaacd.org.br @criar_usuario_servico.sql
--
--  O script PEDE a senha em tempo de execução (não fica gravada em lugar nenhum).
--  Depois, aponte o backend para a nova conta em backend/.env:
--      TASY_USER=KANBAN_CHAMADOS
--      TASY_PASSWORD=...(a senha definida abaixo)...
-- =============================================================================

WHENEVER SQLERROR CONTINUE
SET VERIFY OFF
SET FEEDBACK ON
SET SERVEROUTPUT ON SIZE UNLIMITED
SET LINESIZE 200
SET PAGESIZE 200

-- Log da execução (revise no fim para conferir cada GRANT) ---------------------
SPOOL criar_usuario_servico.log

-- ----------------------------- PARÂMETROS ------------------------------------
-- Ajuste se os nomes na sua instância forem diferentes.
DEFINE svc_user  = KANBAN_CHAMADOS        -- nome da conta de serviço
DEFINE svc_role  = RL_KANBAN_CHAMADOS     -- role que agrupa os privilégios
DEFINE owner     = TASY                   -- schema DONO das tabelas/functions/sequences

-- Senha: solicitada de forma oculta (não ecoa na tela nem grava no script).
-- Use uma senha forte que respeite a política de senha do banco.
ACCEPT svc_password CHAR PROMPT 'Senha da conta de servico (oculta): ' HIDE

PROMPT
PROMPT === Conferindo o schema dono dos objetos (esperado: &owner) ===
SELECT owner, COUNT(*) AS qt_objetos
  FROM dba_objects
 WHERE object_name = 'MAN_ORDEM_SERVICO'
   AND object_type = 'TABLE'
 GROUP BY owner;
-- Se o OWNER acima NÃO for &owner, interrompa (Ctrl+C) e ajuste DEFINE owner.

-- ----------------------------- 1) CONTA --------------------------------------
PROMPT
PROMPT === 1) Criando a conta de serviço &svc_user ===
CREATE USER &svc_user IDENTIFIED BY "&svc_password";
-- Conta de serviço: sem cota (não cria objetos próprios) e só conecta.
GRANT CREATE SESSION TO &svc_user;
-- (opcional) impedir expiração de senha em conta de serviço: associe um profile
-- com PASSWORD_LIFE_TIME UNLIMITED já existente, p.ex.:
-- ALTER USER &svc_user PROFILE NOME_DO_PROFILE_SEM_EXPIRACAO;

-- ----------------------------- 2) ROLE ---------------------------------------
PROMPT
PROMPT === 2) Criando a role &svc_role e concedendo privilégios mínimos ===
CREATE ROLE &svc_role;

-- 2.1) Tabelas — apenas os verbos usados pelo app -----------------------------
GRANT SELECT, INSERT, UPDATE         ON &owner..MAN_ORDEM_SERVICO       TO &svc_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON &owner..MAN_ORDEM_SERVICO_EXEC  TO &svc_role;
GRANT SELECT, INSERT, UPDATE         ON &owner..MAN_ORDEM_SERV_TECNICO  TO &svc_role;
GRANT SELECT                         ON &owner..MAN_ORDEM_SERV_ARQ      TO &svc_role;
GRANT SELECT                         ON &owner..MAN_EQUIPAMENTO         TO &svc_role;
GRANT SELECT                         ON &owner..MAN_LOCALIZACAO         TO &svc_role;
GRANT SELECT                         ON &owner..USUARIO                 TO &svc_role;

-- 2.2) Sequences — necessárias para os INSERT (.nextval) ----------------------
GRANT SELECT ON &owner..MAN_ORDEM_SERVICO_SEQ      TO &svc_role;
GRANT SELECT ON &owner..MAN_ORDEM_SERVICO_EXEC_SEQ TO &svc_role;
GRANT SELECT ON &owner..MAN_ORDEM_SERV_TECNICO_SEQ TO &svc_role;

-- 2.3) Functions PL/SQL chamadas na consulta ----------------------------------
--      (se alguma estiver dentro de um PACKAGE, troque o nome pelo do package.)
GRANT EXECUTE ON &owner..OBTER_USUARIO_PF          TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_NOME_SETOR          TO &svc_role;
GRANT EXECUTE ON &owner..MAN_OBTER_NOME_APELIDO    TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_VALOR_DOMINIO       TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_DESC_GRUPO_TRAB     TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_DESC_GRUPO_PLANEJ   TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_DESC_ESTAGIO_PROC   TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_NOME_USUARIO        TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_NOME_ESTABELECIMENTO TO &svc_role;
GRANT EXECUTE ON &owner..OBTER_DADOS_SETOR         TO &svc_role;

-- ----------------------------- 3) ATRIBUIR ------------------------------------
PROMPT
PROMPT === 3) Vinculando a role à conta (como role padrão) ===
GRANT &svc_role TO &svc_user;
ALTER USER &svc_user DEFAULT ROLE ALL;

-- O código usa nomes NÃO qualificados (ex.: MAN_ORDEM_SERVICO, OBTER_NOME_SETOR).
-- No Tasy isso resolve via SYNONYMS PÚBLICOS para o schema &owner. A verificação
-- abaixo confirma se a resolução está OK. Se algum objeto não tiver synonym
-- público, crie synonyms privados na conta de serviço (bloco opcional no fim).

-- ----------------------------- 4) VERIFICAÇÃO --------------------------------
PROMPT
PROMPT === 4) Privilégios efetivamente concedidos à role ===
SELECT privilege, owner, table_name
  FROM role_tab_privs
 WHERE role = '&svc_role'
 ORDER BY table_name, privilege;

PROMPT
PROMPT === 4b) Synonyms públicos esperados (deve listar todos os objetos) ===
SELECT synonym_name
  FROM dba_synonyms
 WHERE owner = 'PUBLIC'
   AND table_owner = '&owner'
   AND synonym_name IN (
       'MAN_ORDEM_SERVICO','MAN_ORDEM_SERVICO_EXEC','MAN_ORDEM_SERV_TECNICO',
       'MAN_ORDEM_SERV_ARQ','MAN_EQUIPAMENTO','MAN_LOCALIZACAO','USUARIO',
       'MAN_ORDEM_SERVICO_SEQ','MAN_ORDEM_SERVICO_EXEC_SEQ','MAN_ORDEM_SERV_TECNICO_SEQ',
       'OBTER_USUARIO_PF','OBTER_NOME_SETOR','MAN_OBTER_NOME_APELIDO','OBTER_VALOR_DOMINIO',
       'OBTER_DESC_GRUPO_TRAB','OBTER_DESC_GRUPO_PLANEJ','OBTER_DESC_ESTAGIO_PROC',
       'OBTER_NOME_USUARIO','OBTER_NOME_ESTABELECIMENTO','OBTER_DADOS_SETOR')
 ORDER BY synonym_name;

PROMPT
PROMPT === Concluído. Revise criar_usuario_servico.log. ===
PROMPT === Teste a conta:  sqlplus &svc_user@//host:1521/servico  e rode: ===
PROMPT ===   SELECT COUNT(*) FROM man_ordem_servico WHERE rownum <= 1; ===
SPOOL OFF

-- =============================================================================
--  (OPCIONAL) Synonyms PRIVADOS — só se faltar algum synonym público (passo 4b).
--  Rode conectado como DBA. Repita por objeto ausente:
--
--    CREATE OR REPLACE SYNONYM &svc_user..MAN_ORDEM_SERVICO FOR &owner..MAN_ORDEM_SERVICO;
--    ... (demais objetos) ...
-- =============================================================================

-- =============================================================================
--  ROLLBACK / LIMPEZA (desfazer tudo) — execute como DBA se precisar reverter:
--
--    DROP USER &svc_user CASCADE;     -- remove a conta de serviço
--    DROP ROLE &svc_role;             -- remove a role e seus grants
-- =============================================================================
