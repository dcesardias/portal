-- ============================================================================
-- Fix: AACD_ORDEM_SERV_OS_EMAIL — e-mails duplicados ao solicitante
-- ----------------------------------------------------------------------------
-- CAUSA: o trigger disparava em QUALQUER INSERT OR UPDATE da MAN_ORDEM_SERVICO
--        (sem escopo de coluna). Como o app/Tasy fazem mais de uma UPDATE por
--        ação (edição de campos, mudança de status, nota, cascata de triggers),
--        o trigger reavaliava a cada UPDATE e reenviava e-mail.
--
-- CORREÇÃO: restringir o disparo do UPDATE às ÚNICAS colunas que as condições
--           internas usam como gatilho (todas checam ":new.X <> :old.X"):
--             ie_status_ordem, nr_seq_estagio, nr_seq_complex, ds_contato_solicitante
--           Assim ele NÃO dispara mais em ds_solucao/dt_atualizacao/ds_dano/
--           prioridade/grupo (notas e edições comuns).
--
--           O corpo abaixo é EXATAMENTE o atual (extraído de all_triggers,
--           acentuação verificada) — só a linha do evento mudou.
--
-- APLICAR COM CLIENTE UTF-8 (SQL Developer/SQLcl) ou garanta NLS que preserve
-- os acentos das mensagens de e-mail. Confira o diff antes de aplicar.
--
-- ROLLBACK (evento original):
--   BEFORE UPDATE OR INSERT ON MAN_ORDEM_SERVICO
--
-- Complementos recomendados (opcionais):
--   * App (Kanban) já foi ajustado p/ 1 UPDATE por ação (reduz disparos).
--   * Idempotência forte: registrar a última transição notificada por OS e não
--     reenviar a mesma (via tabela de controle ou coluna aux.) — só se ainda
--     houver duplicidade após este escopo + o fix do app.
-- ============================================================================

CREATE OR REPLACE TRIGGER USRTASY.AACD_ORDEM_SERV_OS_EMAIL
BEFORE INSERT OR UPDATE OF ie_status_ordem, nr_seq_estagio, nr_seq_complex, ds_contato_solicitante
ON USRTASY.MAN_ORDEM_SERVICO
FOR EACH ROW
DECLARE
    PRAGMA autonomous_transaction;
    log_action varchar(255);
    ds_email_w varchar(100);
    DS_COMPLEXIDADE_w varchar(10);
    DS_HISTORICO_W varchar(400);
    ds_email_executor_w varchar(100);
    ds_email_escalonado_w varchar(3000);
BEGIN
begin
select b.ds_email
into ds_email_w
from pessoa_fisica a,
usuario b
where a.cd_pessoa_fisica = b.cd_pessoa_fisica
and b.ie_situacao = 'A'
and a.cd_pessoa_fisica = :new.CD_PESSOA_SOLICITANTE;
exception when others then ds_email_w := 'alssantos@aacd.org.br';
end;

--Quando passar para produção necessário alterar a sequencia da complexidade
if (updating AND :new.nr_seq_localizacao = 1 AND :new.nr_seq_complex = 6589 and :new.DS_CONTATO_SOLICITANTE is not null 
    and :new.DS_CONTATO_SOLICITANTE <>:old.DS_CONTATO_SOLICITANTE and :new.NR_SEQ_ESTAGIO = 14741 and :new.nm_usuario = :old.nm_usuario) then

        enviar_email('TI - Ordem de serviço aberta: '|| :new.nr_sequencia,        
                              'Olá,'
                              || chr(10)||chr(10) || 'Sua ordem de serviço foi aberta e está em processo de triagem por nosso analistas!'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              || 'Link de orientações para acompanhamento da OS: '
                              || chr(10)
                              || 'https://aacdsp.sharepoint.com/sites/intranet/SistInfos/TI/Help_OS.pdf', --Substituir para o link do manual
                               'ti@aacd.org.br', ds_email_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                              );

 ELSIF (updating )THEN
    --Em produção confirmar o estágio
    if(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 2 and (:new.IE_STATUS_ORDEM <> :old.IE_STATUS_ORDEM) and :new.NR_SEQ_ESTAGIO = 14742) then
        enviar_email('TI - Ordem de serviço em processo: ' || :new.nr_sequencia, 

                              'Olá,'
                              || chr(10)||chr(10) || 'Sua ordem de serviço está em atendimento por nossos analistas!'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              || 'Link de orientações para acompanhamento da OS: '
                              || chr(10)
                              || 'https://aacdsp.sharepoint.com/sites/intranet/SistInfos/TI/Help_OS.pdf', --Substituir para o link do manual
                               'ti@aacd.org.br', ds_email_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                              );
    elsif(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 2 and :new.NR_SEQ_ESTAGIO = 14743 and (:new.NR_SEQ_COMPLEX <> :old.NR_SEQ_COMPLEX)) then
        begin
            select listagg(ds_email,';') within group (order by 1) ds_mail_w 
            into ds_email_escalonado_w
            from usuario 
            where cd_pessoa_fisica in(select cd_pessoa_fisica 
                                      from pessoa_fisica 
                                      where rtrim(ltrim(upper(ds_observacao))) = (select upper(ds_complexidade) 
                                                                                  from man_complexidade 
                                                                                  where nr_sequencia = :new.NR_SEQ_COMPLEX
                                                                                  )
                                      and exists(select 1 
                                                 from man_grupo_trab_usuario
                                                 where nm_usuario_param = obter_usuario_pf(cd_pessoa_fisica)
                                                 and nr_seq_grupo_trab = :new.nr_grupo_trabalho
                                                 )
                                      )
            and ie_situacao = 'A';
            exception when others then ds_email_escalonado_w := 'alssantos@aacd.org.br';
        end;
        enviar_email('TI - Ordem de serviço escalonada: ' || :new.nr_sequencia, 
                              'Olá,'
                              || chr(10)||chr(10) || 'Sua ordem de serviço foi direcionada ao próximo nível de atendimento!'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              || 'Nível: ' || substr(Man_Obter_Complexidade(:new.NR_SEQ_COMPLEX),INSTR(Man_Obter_Complexidade(:new.NR_SEQ_COMPLEX), '-')+1,255)
                              || chr(10)
                              || chr(10)
                              || 'Link de orientações para acompanhamento da OS: '
                              || chr(10)
                              || 'https://aacdsp.sharepoint.com/sites/intranet/SistInfos/TI/Help_OS.pdf', --Substituir para o link do manual
                               'ti@aacd.org.br', ds_email_escalonado_w , 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                               );

    elsif(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 2 and :new.NR_SEQ_ESTAGIO = 14743 and (:new.NR_SEQ_COMPLEX <> :old.NR_SEQ_COMPLEX)) then
        begin
            select 
            obter_email_nm_usuario_pf(NM_USUARIO_EXEC) ds_email_exec
            into ds_email_escalonado_w
            from(select NM_USUARIO_EXEC 
                from man_ordem_servico_exec
                where 1=1
                and nr_seq_ordem = :new.nr_sequencia
                and NM_USUARIO_EXEC in( select obter_usuario_pf(cd_pessoa_fisica )
                                        from pessoa_fisica 
                                        where rtrim(ltrim(upper(ds_observacao))) = (select upper(ds_complexidade) 
                                                                                    from man_complexidade 
                                                                                    where nr_sequencia = 6591))
                order by dt_atualizacao desc)
            where rownum <=1;
            exception when others then ds_email_escalonado_w := 'alssantos@aacd.org.br';
        end;


        enviar_email('TI - Ordem de serviço devolvida: ' || :new.nr_sequencia,
                                'Olá,'
                              || chr(10)||chr(10) || 'Ordem de serviço devolvida pelo nível: ' || substr(Man_Obter_Complexidade(:old.NR_SEQ_COMPLEX),INSTR(Man_Obter_Complexidade(:old.NR_SEQ_COMPLEX), '-')+1,255)
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              || 'Nível: ' || substr(Man_Obter_Complexidade(:new.NR_SEQ_COMPLEX),INSTR(Man_Obter_Complexidade(:new.NR_SEQ_COMPLEX), '-')+1,255),
                               'ti@aacd.org.br', ds_email_escalonado_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                               );

     elsif(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 2  and :new.NR_SEQ_ESTAGIO = 14744 and (:new.NR_SEQ_ESTAGIO <> :old.NR_SEQ_ESTAGIO)) then

        enviar_email('TI - Ordem de Serviço aguardando interação: ' || :new.nr_sequencia, 
                                'Olá,'
                              || chr(10)||chr(10) || 'Sua ordem de serviço está pendente de resposta!'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              || 'Link de orientações para acompanhamento da OS: '
                              || chr(10)
                              || 'https://aacdsp.sharepoint.com/sites/intranet/SistInfos/TI/Help_OS.pdf', --Substituir para o link do manual
                               'ti@aacd.org.br', ds_email_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                               );

    elsif(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 2 and :new.NR_SEQ_ESTAGIO = 14745 and (:new.NR_SEQ_ESTAGIO <> :old.NR_SEQ_ESTAGIO)) then
        SELECT
            y.ds_email
        into
            ds_email_executor_w
        FROM
            (
                SELECT
                    a.nm_usuario_exec--SUBSTR(AACD_OBTER_MAN_DS_HIST(A.NR_SEQUENCIA),1,400) DS_HISTORICO_W
                --into DS_HISTORICO_W
                FROM
                    man_ordem_servico_exec a
                WHERE
                    nr_seq_ordem = :new.nr_sequencia--:new.nr_sequencia
                ORDER BY
                    dt_atualizacao DESC
            ) z,
            usuario y
        WHERE
            ROWNUM <= 1
            and z.nm_usuario_exec = y.nm_usuario;

        enviar_email('TI - Ordem de serviço devolvida pelo usuário: ' || :new.nr_sequencia, 
                                'Olá,'
                              || chr(10)||chr(10) || 'A ordem de serviço foi respondida pelo usuário!'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || ' - '
                              || :new.DS_DANO_BREVE,
                               'ti@aacd.org.br', ds_email_executor_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                               );
     elsif(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 2  and :new.NR_SEQ_ESTAGIO = 15241 and (:new.NR_SEQ_ESTAGIO <> :old.NR_SEQ_ESTAGIO)) then
        select SUBSTR(AACD_OBTER_MAN_DS_HIST(A.NR_SEQUENCIA),1,400) DS_HISTORICO_W
        into DS_HISTORICO_W
        from MAN_ORDEM_SERVICO A
        where nr_sequencia = :new.nr_sequencia;

        enviar_email('TI - Ordem de Serviço aguardando encerramento: ' || :new.nr_sequencia, 
                                'Olá,'
                              || chr(10)||chr(10) || 'Sua ordem de serviço está aguardando validação!'
                              ||chr(10) || 'Caso sua solicitação tenha sido atendida, não esqueça de encerrar a Ordem de Serviço e avaliar o nosso atendimento.'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              --|| 'Solução/Último histórico: Resolvido' || DS_HISTORICO_W 
                              --|| chr(10)
                              --|| chr(10)
                              || 'Link de orientações para acompanhamento da OS: '
                              || chr(10)
                              || 'https://aacdsp.sharepoint.com/sites/intranet/SistInfos/TI/Help_OS.pdf', --Substituir para o link do manual
                               'ti@aacd.org.br', ds_email_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                               );  

    elsif(:new.nr_seq_localizacao = 1 and :new.IE_STATUS_ORDEM = 3 and :new.IE_STATUS_ORDEM <> :old.IE_STATUS_ORDEM) then
        /*select SUBSTR(AACD_OBTER_MAN_DS_HIST(A.NR_SEQUENCIA),1,400) DS_HISTORICO_W
        into DS_HISTORICO_W
        from MAN_ORDEM_SERVICO A
        where nr_sequencia = :new.nr_sequencia;*/
        begin
        enviar_email('TI - Ordem de Serviço Encerrada: ' || :new.nr_sequencia, 
                                'Olá,'
                              || chr(10)||chr(10) || 'Sua ordem de serviço foi encerrada!'
                              || chr(10) || 'Nº da Ordem: '
                              || :new.nr_sequencia
                              || chr(10)
                              || chr(10)
                              --|| 'Solução/Último histórico: Resolvido' || DS_HISTORICO_W 
                              --|| chr(10)
                              --|| chr(10)
                              || 'Link de orientações para acompanhamento da OS: '
                              || chr(10)
                              || 'https://aacdsp.sharepoint.com/sites/intranet/SistInfos/TI/Help_OS.pdf', --Substituir para o link do manual
                               'ti@aacd.org.br', ds_email_w, 'TASY', 3, 'alssantos@aacd.org.br'--Criar um e-mail compartilhado do N1
                               );
        exception when others then enviar_email('Erro trigger aacd_ordem_serv_os_email','Nº da Ordem: '|| :new.nr_sequencia, 'ti@aacd.org.br','alssantos@aacd.org.br','TASY',3,'alssantos@aacd.org.br');
        end;
    end if;
end if;
end;
/
