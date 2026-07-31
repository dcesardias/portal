"""Camada de acesso ao Oracle (Tasy). Pool de conexões + queries do Kanban."""
import html
import logging
import re

import oracledb

import config

logger = logging.getLogger("kanban")

_pool = None


def init_pool():
    """Inicializa o client (thick) e o pool de conexões."""
    global _pool
    if _pool is not None:
        return
    oracledb.init_oracle_client(lib_dir=config.ORACLE_CLIENT_DIR)
    _pool = oracledb.create_pool(
        user=config.DB["user"],
        password=config.DB["password"],
        host=config.DB["host"],
        port=config.DB["port"],
        service_name=config.DB["service_name"],
        min=1,
        max=4,
        increment=1,
    )


def _conn():
    if _pool is None:
        init_pool()
    return _pool.acquire()


# ---------------------------------------------------------------------------
# Consulta principal: chamados de TI (Ordens de Serviço) abertos/recentes.
# É a consulta original do usuário, com os '' revertidos para ' .
# ---------------------------------------------------------------------------
_SQL_BASE = """
SELECT
    a.nr_sequencia,
    obter_usuario_pf(a.cd_pessoa_solicitante) nm_pessoa_solicitante,
    b.nm_usuario nm_usuario_solic,
    obter_nome_setor(b.CD_SETOR_ATENDIMENTO) ds_setor_solicitante,
    a.nr_seq_localizacao,
    a.nr_seq_equipamento,
    a.cd_pessoa_solicitante,
    to_char(a.dt_ordem_servico, 'YYYY-MM-DD"T"HH24:MI:SS') dt_ordem_servico,
    a.ie_prioridade,
    a.ds_dano_breve,
    to_char(a.dt_atualizacao, 'YYYY-MM-DD"T"HH24:MI:SS') dt_atualizacao,
    a.nm_usuario,
    a.ds_dano,
    a.ds_solucao,
    a.ie_status_ordem,
    a.nr_grupo_planej,
    a.nr_grupo_trabalho,
    a.nr_seq_estagio,
    SUBSTR(man_obter_nome_apelido(a.cd_pessoa_solicitante),1,60) nm_solicitante,
    c.ds_equipamento,
    d.ds_localizacao,
    SUBSTR(obter_nome_setor(d.cd_setor),1,255) ds_setor_localizacao,
    SUBSTR(obter_valor_dominio(1046, a.ie_prioridade),1,20) ds_prioridade,
    SUBSTR(obter_valor_dominio(1279, a.ie_status_ordem),1,20) ds_situacao,
    SUBSTR(obter_desc_grupo_trab(a.nr_grupo_trabalho),1,60) ds_grupo_trabalho,
    SUBSTR(obter_desc_grupo_planej(a.nr_grupo_planej),1,60) ds_grupo_planej,
    SUBSTR(obter_desc_estagio_proc(a.nr_seq_estagio),1,60) ds_estagio,
    nvl((select z.nm_usuario_exec from man_ordem_servico_exec z
       where z.nr_seq_ordem = a.nr_sequencia
         and z.nr_sequencia = (select max(z2.nr_sequencia) from man_ordem_servico_exec z2
                                where z2.nr_seq_ordem = a.nr_sequencia)), a.nm_usuario_exec) nm_exec_atual,
    SUBSTR(obter_nome_usuario(nvl((select z.nm_usuario_exec from man_ordem_servico_exec z
       where z.nr_seq_ordem = a.nr_sequencia
         and z.nr_sequencia = (select max(z2.nr_sequencia) from man_ordem_servico_exec z2
                                where z2.nr_seq_ordem = a.nr_sequencia)), a.nm_usuario_exec)),1,80) ds_exec_atual,
    (select count(*) from man_ordem_serv_arq arq
       where arq.nr_seq_ordem = a.nr_sequencia and nvl(arq.ie_deletar,'N') = 'N') qt_anexos,
    b.cd_estabelecimento,
    SUBSTR(obter_nome_estabelecimento(b.cd_estabelecimento),1,255) ds_estabelecimento,
    SUBSTR(obter_dados_setor(a.cd_setor_atendimento,'DS'),1,255) ds_setor_atendimento,
    a.dt_liberacao,
    nvl(nvl(nvl(e.NM_USUARIO_EXEC, a.NM_USUARIO_EXEC), f.nm_usuario), a.NM_USUARIO_ENCER) nm_usuario_exec_correto,
    nvl((case when (select 1 from USUARIO y where y.CD_SETOR_ATENDIMENTO <> 1 and y.nm_usuario = nvl(nvl(nvl(e.NM_USUARIO_EXEC, a.NM_USUARIO_EXEC), f.nm_usuario), a.NM_USUARIO_ENCER)) = 1
    then 'Sem Executor'
    else obter_nome_usuario(nvl(nvl(nvl(e.NM_USUARIO_EXEC, a.NM_USUARIO_EXEC), f.nm_usuario), a.NM_USUARIO_ENCER)) end ), 'TASY') ds_usuario_exec_correto
from man_equipamento c,
    man_localizacao d,
    man_ordem_servico a,
    usuario b,
    MAN_ORDEM_SERVICO_EXEC e,
    MAN_ORDEM_SERV_TECNICO f
where a.nr_seq_equipamento = c.nr_sequencia(+)
and a.nr_seq_localizacao = d.nr_sequencia(+)
and {periodo}
and a.cd_pessoa_solicitante = b.CD_PESSOA_FISICA
and b.nm_usuario = (select u.nm_usuario from usuario u where u.cd_pessoa_fisica = b.cd_pessoa_fisica and rownum <= 1)
and a.nr_sequencia = e.NR_SEQ_ORDEM (+)
and a.nr_sequencia = f.NR_SEQ_ORDEM_SERV (+)
and (f.dt_liberacao = (select min(w.dt_liberacao) from MAN_ORDEM_SERV_TECNICO w where w.NR_SEQ_ORDEM_SERV = a.nr_sequencia) or (select min(w.dt_liberacao) from MAN_ORDEM_SERV_TECNICO w where w.NR_SEQ_ORDEM_SERV = a.nr_sequencia) is null)
and (e.nr_sequencia = (select max(z.nr_sequencia) from MAN_ORDEM_SERVICO_EXEC z where z.NR_SEQ_ORDEM = a.nr_sequencia) or (select max(z.nr_sequencia) from MAN_ORDEM_SERVICO_EXEC z where z.NR_SEQ_ORDEM = a.nr_sequencia) is null)
and d.CD_SETOR = 1
and a.NR_SEQ_LOCALIZACAO = 1
and a.NR_GRUPO_PLANEJ in ({grupos})
order by a.dt_ordem_servico desc
"""

_GRUPOS = ",".join(str(g) for g in config.GRUPOS_PLANEJ)

# Quadro: não-encerrados + encerrados/movimentados nos últimos N dias.
SQL_CHAMADOS = _SQL_BASE.format(
    grupos=_GRUPOS,
    periodo="(a.ie_status_ordem <> 3 or trunc(nvl(a.dt_fim_real, a.dt_atualizacao)) "
            ">= trunc(sysdate) - {})".format(config.DIAS_ENCERRADAS),
)

# Dashboard: TODOS os chamados (inclusive encerrados) ABERTOS no período informado.
SQL_CHAMADOS_PERIODO = _SQL_BASE.format(
    grupos=_GRUPOS,
    periodo="a.dt_ordem_servico >= to_date(:inicio,'YYYY-MM-DD') "
            "and a.dt_ordem_servico < to_date(:fim,'YYYY-MM-DD') + 1",
)

# Busca por número: um chamado específico, sem limite de data/status — usado
# pela busca do quadro pra achar chamados fora da janela normal (ex.:
# encerrados há anos, como o #52).
SQL_CHAMADO_POR_NUMERO = _SQL_BASE.format(grupos=_GRUPOS, periodo="a.nr_sequencia = :nr")


def _rows_to_dicts(cur):
    cols = [d[0].lower() for d in cur.description]
    out = []
    for row in cur:
        d = {}
        for k, v in zip(cols, row):
            if isinstance(v, oracledb.LOB):
                v = v.read()
            d[k] = v
        out.append(d)
    return out


def listar_chamados():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(SQL_CHAMADOS)
        return _rows_to_dicts(cur)


def buscar_chamado_numero(nr_sequencia: int):
    """Busca um chamado específico por número, sem restrição de data/status
    (diferente de listar_chamados, que só traz o que cabe na janela do
    quadro). Continua restrito aos grupos de planejamento de TI."""
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(SQL_CHAMADO_POR_NUMERO, nr=nr_sequencia)
        rows = _rows_to_dicts(cur)
        return rows[0] if rows else None


def listar_chamados_periodo(inicio: str, fim: str):
    """Todos os chamados (inclusive encerrados) ABERTOS entre :inicio e :fim
    (datas 'YYYY-MM-DD', ambas inclusivas). Usado pelo dashboard de indicadores."""
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(SQL_CHAMADOS_PERIODO, inicio=inicio, fim=fim)
        return _rows_to_dicts(cur)


def chamado(nr_sequencia: int):
    """Retorna um único chamado (recarrega após update)."""
    sql = """
    select a.nr_sequencia, a.ie_status_ordem, a.ds_dano_breve, a.ds_dano, a.ds_solucao,
           a.ie_prioridade, a.nm_usuario_exec,
           to_char(a.dt_atualizacao,'YYYY-MM-DD"T"HH24:MI:SS') dt_atualizacao,
           SUBSTR(obter_valor_dominio(1279, a.ie_status_ordem),1,20) ds_situacao,
           SUBSTR(obter_valor_dominio(1046, a.ie_prioridade),1,20) ds_prioridade
      from man_ordem_servico a where a.nr_sequencia = :id
    """
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, id=nr_sequencia)
        rows = _rows_to_dicts(cur)
        return rows[0] if rows else None


def atualizar_status(nr_sequencia: int, novo_status: int, usuario: str):
    """Move o card entre Aberta/Processo (status 1 ou 2).
    O encerramento (status 3) é tratado por encerrar_chamado (exige solução)."""
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """update man_ordem_servico
                  set ie_status_ordem = :s,
                      dt_atualizacao = sysdate,
                      nm_usuario = :u
                where nr_sequencia = :id""",
            s=novo_status, u=usuario, id=nr_sequencia,
        )
        afetadas = cur.rowcount
        conn.commit()
        return afetadas


# Resolve o executor atual do chamado com a MESMA regra da consulta do quadro
# (coluna nm_exec_atual): registro mais recente em MAN_ORDEM_SERVICO_EXEC e, se
# não houver, cai pro executor gravado direto em MAN_ORDEM_SERVICO.NM_USUARIO_EXEC
# (chamados atribuídos nativamente no Tasy, sem linha em _EXEC). Sem esse fallback,
# a UI mostra "atribuído" (via lista) mas o encerramento não acha o executor.
_SQL_EXEC_ATUAL = """
    select nvl(
             (select z.nm_usuario_exec from man_ordem_servico_exec z
               where z.nr_seq_ordem = a.nr_sequencia
                 and z.nr_sequencia = (select max(nr_sequencia)
                                         from man_ordem_servico_exec
                                        where nr_seq_ordem = a.nr_sequencia)),
             a.nm_usuario_exec)
      from man_ordem_servico a
     where a.nr_sequencia = :id
"""


def executor_atual(nr_sequencia: int):
    """Login (nm_usuario) do executor atual do chamado. Mesma regra da lista:
    registro mais recente em MAN_ORDEM_SERVICO_EXEC, com fallback para
    MAN_ORDEM_SERVICO.NM_USUARIO_EXEC. Retorna None se não houver executor."""
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(_SQL_EXEC_ATUAL, id=nr_sequencia)
        r = cur.fetchone()
        return r[0] if r and r[0] else None


# colunas de edição que podem ser aplicadas JUNTO do encerramento (mesma UPDATE)
_ENCERRAR_CAMPOS = {
    "ds_dano_breve": "ds_dano_breve", "ds_dano": "ds_dano",
    "ie_prioridade": "ie_prioridade", "nr_grupo_planej": "nr_grupo_planej",
    "nr_grupo_trabalho": "nr_grupo_trabalho", "nr_seq_estagio": "nr_seq_estagio",
}


def encerrar_chamado(nr_sequencia: int, relato: str, usuario_app: str, campos: dict | None = None):
    """Encerra o chamado (status 3) gravando a solução/relato técnico,
    ATRIBUÍDO AO EXECUTOR atual do chamado.

    1) Insere o relato em MAN_ORDEM_SERV_TECNICO (DS_RELAT_TECNICO, liberado),
       com NM_USUARIO/NM_USUARIO_LIB = login do executor;
    2) Atualiza a OS: status 3, dt_fim_real, nm_usuario_encer (= executor), ds_solucao
       e — se `campos` vier (edição no mesmo "Salvar") — os campos editados,
       tudo numa ÚNICA UPDATE (evita disparo duplicado do trigger de e-mail).
    Exige executor definido. Tudo numa única transação.
    """
    relato = (relato or "").strip()
    if not relato:
        raise ValueError("Relato da solução é obrigatório para encerrar.")
    with _conn() as conn:
        cur = conn.cursor()
        # mesma resolução da lista/executor_atual (com fallback p/ a OS)
        cur.execute(_SQL_EXEC_ATUAL, id=nr_sequencia)
        row = cur.fetchone()
        nm_exec = row[0] if row and row[0] else None
        if not nm_exec:
            raise ValueError("Atribua um executor antes de encerrar o chamado.")
        if nm_exec != usuario_app:
            raise ValueError(
                "Este chamado está sob responsabilidade de outro executor. "
                "Assuma o chamado para poder encerrá-lo."
            )
        cur.execute(
            """insert into man_ordem_serv_tecnico
                  (nr_sequencia, nr_seq_ordem_serv, dt_atualizacao, nm_usuario,
                   ds_relat_tecnico, dt_liberacao, nm_usuario_lib)
               values (man_ordem_serv_tecnico_seq.nextval, :id, sysdate, :exec,
                       :rel, sysdate, :exec)""",
            id=nr_sequencia, exec=nm_exec, rel=relato,
        )
        sets = [
            "ie_status_ordem = 3", "dt_atualizacao = sysdate", "nm_usuario = :app",
            "dt_fim_real = nvl(dt_fim_real, sysdate)", "nm_usuario_encer = :exec",
            "ds_solucao = :sol",
        ]
        binds = {"app": usuario_app, "exec": nm_exec, "sol": relato[:255], "id": nr_sequencia}
        for chave, col in _ENCERRAR_CAMPOS.items():
            if campos and chave in campos:
                sets.append(f"{col} = :{chave}")
                binds[chave] = campos[chave]
        cur.execute(
            "update man_ordem_servico set {} where nr_sequencia = :id".format(", ".join(sets)),
            binds,
        )
        afetadas = cur.rowcount
        conn.commit()
        return afetadas


def atualizar_campos(nr_sequencia: int, dados: dict, usuario: str):
    """Edita campos do chamado (descrição, prioridade, executor, grupo de
    planejamento/trabalho)."""
    sets, binds = [], {"id": nr_sequencia, "u": usuario}
    if "ds_dano_breve" in dados and dados["ds_dano_breve"] is not None:
        sets.append("ds_dano_breve = :ds_breve")
        binds["ds_breve"] = dados["ds_dano_breve"]
    if "ds_dano" in dados and dados["ds_dano"] is not None:
        sets.append("ds_dano = :ds_dano")
        binds["ds_dano"] = dados["ds_dano"]
    if "ie_prioridade" in dados and dados["ie_prioridade"]:
        sets.append("ie_prioridade = :prio")
        binds["prio"] = dados["ie_prioridade"]
    if "nr_grupo_planej" in dados and dados["nr_grupo_planej"] is not None:
        sets.append("nr_grupo_planej = :grupo_planej")
        binds["grupo_planej"] = dados["nr_grupo_planej"]
    if "nr_grupo_trabalho" in dados:
        # grupo de trabalho é opcional — permite limpar (None -> NULL)
        sets.append("nr_grupo_trabalho = :grupo_trabalho")
        binds["grupo_trabalho"] = dados["nr_grupo_trabalho"]
    if "nr_seq_estagio" in dados:
        # estágio do processo é opcional — permite limpar (None -> NULL)
        sets.append("nr_seq_estagio = :estagio")
        binds["estagio"] = dados["nr_seq_estagio"]
    if dados.get("ie_status_ordem") in (1, 2):
        # transição Aberta/Processo junto da edição, na MESMA UPDATE (encerrar=3
        # NÃO passa por aqui — tem fluxo próprio em encerrar_chamado)
        sets.append("ie_status_ordem = :status")
        binds["status"] = dados["ie_status_ordem"]
    if not sets:
        logger.info("atualizar_campos nr=%s: sem campos reconhecidos em dados=%r — nada a fazer", nr_sequencia, dados)
        return 0
    sets.append("dt_atualizacao = sysdate")
    sets.append("nm_usuario = :u")
    sql = "update man_ordem_servico set {} where nr_sequencia = :id".format(
        ", ".join(sets)
    )
    logger.info("atualizar_campos nr=%s SQL=%s BINDS=%r", nr_sequencia, sql, binds)
    with _conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(sql, binds)
        except Exception:
            logger.exception("atualizar_campos nr=%s: UPDATE falhou (SQL=%s BINDS=%r)", nr_sequencia, sql, binds)
            raise
        afetadas = cur.rowcount
        conn.commit()
        logger.info("atualizar_campos nr=%s: rowcount=%s (commit ok)", nr_sequencia, afetadas)
        return afetadas


def atribuir_executor(nr_sequencia: int, nm_exec: str | None, usuario: str):
    """Define o responsável/executor gravando em MAN_ORDEM_SERVICO_EXEC,
    que é a tabela lida pela consulta (precedência sobre a OS).

    - Atualiza o registro mais recente SE ele foi criado por este app
      (não sobrescreve apontamentos reais do Tasy); caso contrário, insere um novo.
    - nm_exec vazio = remove o executor lançado pelo app.
    """
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """select nr_sequencia, nm_usuario
                 from man_ordem_servico_exec
                where nr_seq_ordem = :id
                  and nr_sequencia = (select max(nr_sequencia)
                                        from man_ordem_servico_exec
                                       where nr_seq_ordem = :id)""",
            id=nr_sequencia,
        )
        atual = cur.fetchone()
        do_app = bool(atual) and atual[1] == usuario

        if not nm_exec:  # limpar
            # chamado em Processo (2) ou Encerrada (3) precisa manter executor
            cur.execute(
                "select ie_status_ordem from man_ordem_servico where nr_sequencia = :id",
                id=nr_sequencia,
            )
            st = cur.fetchone()
            st = int(st[0]) if st and st[0] is not None else None
            if st in (2, 3):
                raise ValueError(
                    "Chamado em Processo/Encerrado precisa ter um executor."
                )
            if do_app:
                cur.execute(
                    "delete from man_ordem_servico_exec where nr_sequencia = :s",
                    s=atual[0],
                )
            n = cur.rowcount
            conn.commit()
            return n

        if do_app:
            cur.execute(
                """update man_ordem_servico_exec
                      set nm_usuario_exec = :e, dt_atualizacao = sysdate, nm_usuario = :u
                    where nr_sequencia = :s""",
                e=nm_exec, u=usuario, s=atual[0],
            )
        else:
            cur.execute(
                """insert into man_ordem_servico_exec
                      (nr_sequencia, nr_seq_ordem, dt_atualizacao, nm_usuario, nm_usuario_exec)
                   values (man_ordem_servico_exec_seq.nextval, :id, sysdate, :u, :e)""",
                id=nr_sequencia, u=usuario, e=nm_exec,
            )
        n = cur.rowcount
        conn.commit()
        return n


def grupos_do_usuario(nm_usuario):
    """Grupos de trabalho (nr_seq_grupo_trab) aos quais o usuário pertence,
    lidos de MAN_GRUPO_TRAB_USUARIO (coluna NM_USUARIO_PARAM = login do
    participante; NM_USUARIO é só auditoria). Retorna um set de ints.

    Considera APENAS grupos ATIVOS: junta com MAN_GRUPO_TRABALHO e filtra
    IE_SITUACAO = 'A' (grupos inativos, 'I', são ignorados — como no ERP, onde
    o usuário só enxerga/filtra as filas dos grupos ativos aos quais pertence).

    Retorna None quando NÃO dá pra determinar o vínculo — sem login, ou sem
    GRANT de SELECT nas tabelas (ORA-00942). Quem chama deve tratar None como
    'não sei' e NÃO bloquear (fail-open), pra a regra nunca travar o app por
    falta de permissão no banco."""
    if not nm_usuario:
        return None
    with _conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                """select distinct u.nr_seq_grupo_trab
                     from man_grupo_trab_usuario u
                     join man_grupo_trabalho g
                       on g.nr_sequencia = u.nr_seq_grupo_trab
                    where u.nm_usuario_param = :u
                      and u.nr_seq_grupo_trab is not null
                      and g.ie_situacao = 'A'""",
                u=nm_usuario,
            )
            return {int(r[0]) for r in cur.fetchall()}
        except oracledb.DatabaseError as e:
            if getattr(e.args[0], "code", None) == 942:
                logger.warning(
                    "grupos_do_usuario: sem GRANT em MAN_GRUPO_TRAB_USUARIO/"
                    "MAN_GRUPO_TRABALHO (ORA-00942); regra de vínculo desligada "
                    "(fail-open)"
                )
                return None
            raise


def grupo_trabalho_chamado(nr_sequencia):
    """nr_grupo_trabalho do chamado (ou None se não tiver grupo definido)."""
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "select nr_grupo_trabalho from man_ordem_servico where nr_sequencia = :id",
            id=nr_sequencia,
        )
        r = cur.fetchone()
        return int(r[0]) if r and r[0] is not None else None


_RTF_GRUPOS_IGNORADOS = (
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object",
    "themedata", "colorschememapping", "generator",
)


def _rtf_para_texto(rtf):
    """Conversão simples de RTF pra texto plano.

    O histórico do Tasy (MAN_ORDEM_SERV_TECNICO.DS_RELAT_TECNICO) tem
    registros antigos gravados em RTF (vindos do editor rico do Tasy) e
    registros novos em texto puro (gravados por este app). Não é um parser
    RTF completo — só o suficiente pra exibir de forma legível: troca
    \\par por quebra de linha, decodifica \\'XX (cp1252) e remove tabelas
    de fonte/cor e demais comandos de controle.
    """
    if not rtf:
        return ""
    if not rtf.lstrip().startswith("{\\rtf"):
        return rtf  # já é texto puro (nota criada por este app)
    texto = rtf.replace("\r\n", "\n").replace("\r", "\n")
    for grupo in _RTF_GRUPOS_IGNORADOS:
        texto = re.sub(r"\{\\" + grupo + r"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", "", texto)
    # (?![a-zA-Z]) evita casar o prefixo de \pard (comando distinto de \par)
    texto = re.sub(r"\\par(?![a-zA-Z])", "\n", texto)
    texto = re.sub(r"\\tab(?![a-zA-Z])", "\t", texto)
    texto = re.sub(
        r"\\'([0-9a-fA-F]{2})",
        lambda m: bytes([int(m.group(1), 16)]).decode("cp1252", "replace"),
        texto,
    )
    texto = re.sub(r"\\[a-zA-Z]+-?\d*\s?", "", texto)
    texto = texto.replace("{", "").replace("}", "")
    texto = re.sub(r"[ \t]+\n", "\n", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _html_para_texto(conteudo):
    """Conversão simples de HTML pra texto plano.

    Outra parte do histórico do Tasy vem do editor rico gravando HTML
    (`<html tasy="html5">...`), não RTF. Troca fechamento de parágrafo/`<br>`
    por quebra de linha, remove as demais tags e decodifica entidades
    (`&#x200B;`, `&nbsp;`, etc.)."""
    if not conteudo:
        return ""
    texto = re.sub(r"(?i)</p\s*>", "\n\n", conteudo)
    texto = re.sub(r"(?i)<br\s*/?>", "\n", texto)
    texto = _HTML_TAG_RE.sub("", texto)
    texto = html.unescape(texto)
    texto = texto.replace("​", "")  # zero-width space (comum nesses registros)
    texto = re.sub(r"[ \t]+\n", "\n", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def _relato_para_texto(bruto):
    """Detecta o formato do registro (RTF, HTML ou texto puro já gravado por
    este app) e converte pra texto plano legível."""
    if not bruto:
        return ""
    inicio = bruto.lstrip()[:20].lower()
    if inicio.startswith("{\\rtf"):
        return _rtf_para_texto(bruto)
    if inicio.startswith("<html"):
        return _html_para_texto(bruto)
    return bruto


def listar_historico(nr_sequencia: int):
    """Todo o histórico de interação do chamado (MAN_ORDEM_SERV_TECNICO),
    do mais antigo pro mais recente. Não é só a solução final de
    encerramento — é o log de idas e vindas entre executor e solicitante
    (perguntas, atualizações, aprovação), como é usado nativamente no Tasy."""
    sql = """
    select t.nr_sequencia, t.nm_usuario,
           SUBSTR(obter_nome_usuario(t.nm_usuario),1,80) nm_completo,
           t.ds_relat_tecnico,
           to_char(nvl(t.dt_liberacao, t.dt_atualizacao),'YYYY-MM-DD"T"HH24:MI:SS') dt
      from man_ordem_serv_tecnico t
     where t.nr_seq_ordem_serv = :id
     order by t.nr_sequencia
    """
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, id=nr_sequencia)
        rows = _rows_to_dicts(cur)
    for r in rows:
        r["ds_relat_tecnico"] = _relato_para_texto(r.get("ds_relat_tecnico"))
    return rows


def salvar_relato(nr_sequencia: int, texto: str, usuario_app: str):
    """Registra uma NOVA nota no histórico do chamado (MAN_ORDEM_SERV_TECNICO),
    atribuída ao usuário logado que está escrevendo (usuario_app) — não ao
    executor do chamado.

    O histórico do Tasy é um log de interações (várias entradas por chamado,
    tanto do executor quanto do solicitante) — por isso cada chamada aqui
    SEMPRE insere um registro novo, liberado (DT_LIBERACAO/NM_USUARIO_LIB),
    em vez de sobrescrever o anterior. Não permite nota vazia quando já existe
    histórico registrado.

    NÃO atualiza MAN_ORDEM_SERVICO: a nota vive só no histórico. Evita uma UPDATE
    supérflua na OS (que dispararia o trigger AACD_ORDEM_SERV_OS_EMAIL à toa).
    O resumo em DS_SOLUCAO é gravado no encerramento (encerrar_chamado).
    """
    texto = (texto or "").strip()
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "select max(nr_sequencia) from man_ordem_serv_tecnico where nr_seq_ordem_serv = :id",
            id=nr_sequencia,
        )
        mx = cur.fetchone()[0]
        if not texto:
            if mx:
                raise ValueError("A solução não pode ficar vazia.")
            return 0
        cur.execute(
            """insert into man_ordem_serv_tecnico
                  (nr_sequencia, nr_seq_ordem_serv, dt_atualizacao, nm_usuario,
                   ds_relat_tecnico, dt_liberacao, nm_usuario_lib)
               values (man_ordem_serv_tecnico_seq.nextval, :id, sysdate, :u,
                       :rel, sysdate, :u)""",
            id=nr_sequencia, u=usuario_app, rel=texto,
        )
        conn.commit()
        return 1


def listar_anexos(nr_sequencia: int):
    """Lista os anexos do chamado (nome do arquivo, quem anexou, quando)."""
    sql = """
    select nr_sequencia, ds_arquivo, nm_usuario,
           to_char(dt_atualizacao,'YYYY-MM-DD"T"HH24:MI:SS') dt_atualizacao,
           ds_observacao
      from man_ordem_serv_arq
     where nr_seq_ordem = :id and nvl(ie_deletar,'N') = 'N'
     order by dt_atualizacao desc, nr_sequencia desc
    """
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, id=nr_sequencia)
        rows = _rows_to_dicts(cur)
    for r in rows:
        bruto = r.get("ds_arquivo") or ""
        # tasy-storage://.../OS_x/aleatorio-hash-NOME.ext?NOME.ext  -> pega o nome limpo
        nome = bruto.split("?")[-1] if "?" in bruto else bruto.split("/")[-1]
        r["nome_arquivo"] = nome
    return rows


def buscar_usuarios(termo: str, limite: int = 20):
    """Autocomplete de usuários Tasy ativos (executor e solicitante).
    Inclui cd_pessoa_fisica (necessário p/ abrir chamado como solicitante)."""
    sql = """
    select * from (
      select u.nm_usuario, obter_nome_usuario(u.nm_usuario) nm_completo,
             u.cd_pessoa_fisica
        from usuario u
       where u.ie_situacao = 'A'
         and u.cd_pessoa_fisica is not null
         and (upper(u.nm_usuario) like upper(:t)
              or upper(obter_nome_usuario(u.nm_usuario)) like upper(:t))
       order by u.nm_usuario
    ) where rownum <= :lim
    """
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, t=f"%{termo}%", lim=limite)
        return _rows_to_dicts(cur)


def listar_estagios():
    """Estágios ativos do processo de atendimento, pra edição no card.

    Lê o catálogo completo de estágios ATIVOS (IE_SITUACAO = 'A') direto de
    MAN_ESTAGIO_PROCESSO — requer GRANT de SELECT em USRTASY.MAN_ESTAGIO_PROCESSO
    pro schema do app (KANBAN_APP). Caso o grant não exista (ORA-00942), cai num
    fallback que monta a lista a partir dos estágios EM USO nas OSs de TI, via
    obter_desc_estagio_proc() (sempre acessível), pra não deixar o combo vazio.
    Em ambos os casos retorna nr_sequencia = id do estágio, pra casar com
    man_ordem_servico.nr_seq_estagio."""
    with _conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                """select nr_sequencia, SUBSTR(obter_desc_estagio_proc(nr_sequencia),1,60) ds
                     from man_estagio_processo
                    where ie_situacao = 'A'
                    order by ds"""
            )
            return [{"nr_sequencia": r[0], "ds": r[1]} for r in cur.fetchall()]
        except oracledb.DatabaseError as e:
            (err,) = e.args
            if getattr(err, "code", None) != 942:
                raise
            logger.warning(
                "listar_estagios: sem GRANT em MAN_ESTAGIO_PROCESSO (ORA-00942); "
                "usando fallback de estágios em uso"
            )
            cur.execute(
                """select nr_seq_estagio, SUBSTR(obter_desc_estagio_proc(nr_seq_estagio),1,60) ds
                     from (select distinct nr_seq_estagio
                             from man_ordem_servico
                            where nr_seq_estagio is not null
                              and nr_grupo_planej in ({grupos}))
                    order by ds""".format(
                    grupos=",".join(str(g) for g in config.GRUPOS_PLANEJ)
                )
            )
            return [{"nr_sequencia": r[0], "ds": r[1]} for r in cur.fetchall()]


def listar_grupos():
    """Grupos de planejamento (TI) e os grupos de trabalho associados, com nomes."""
    planej_sql = "select * from (" + " union all ".join(
        f"select {g} cd from dual" for g in config.GRUPOS_PLANEJ
    ) + ") x"
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"select x.cd, SUBSTR(obter_desc_grupo_planej(x.cd),1,60) ds from ({planej_sql}) x order by ds"
        )
        planej = [{"cd": c, "ds": d} for c, d in cur.fetchall()]
        cur.execute(
            f"""select nr_grupo_planej, nr_grupo_trabalho,
                       SUBSTR(obter_desc_grupo_trab(nr_grupo_trabalho),1,60) ds
                  from man_ordem_servico
                 where nr_grupo_planej in ({','.join(str(g) for g in config.GRUPOS_PLANEJ)})
                   and nr_grupo_trabalho is not null
                 group by nr_grupo_planej, nr_grupo_trabalho
                 order by ds""")
        trabalho = [{"planej": p, "cd": t, "ds": d} for p, t, d in cur.fetchall()]
    return {"planej": planej, "trabalho": trabalho}


def criar_chamado(dados: dict, usuario_app: str):
    """Cria uma nova Ordem de Serviço (status Aberta) que aparece no quadro.
    Campos fixos: tipo Corretiva (1), localização 1, equipamento 2, status 1."""
    pf = (dados.get("cd_pessoa_solicitante") or "").strip()
    breve = (dados.get("ds_dano_breve") or "").strip()
    dano = (dados.get("ds_dano") or "").strip()
    prio = (dados.get("ie_prioridade") or "M").strip() or "M"
    try:
        planej = int(dados.get("nr_grupo_planej"))
    except (TypeError, ValueError):
        planej = None
    trab = dados.get("nr_grupo_trabalho")
    trab = int(trab) if str(trab or "").strip() else None

    if not pf:
        raise ValueError("Informe o solicitante.")
    if not breve:
        raise ValueError("Informe a descrição breve.")
    if not dano:
        raise ValueError("Informe a descrição do chamado.")
    if planej not in config.GRUPOS_PLANEJ:
        raise ValueError("Selecione um grupo de planejamento válido.")

    with _conn() as conn:
        cur = conn.cursor()
        out = cur.var(oracledb.NUMBER)
        cur.execute(
            """insert into man_ordem_servico
                  (nr_sequencia, cd_pessoa_solicitante, dt_ordem_servico, ie_prioridade,
                   ie_parado, ds_dano_breve, dt_atualizacao, nm_usuario, ds_dano,
                   ie_tipo_ordem, ie_status_ordem, nr_seq_localizacao, nr_seq_equipamento,
                   nr_grupo_planej, nr_grupo_trabalho)
               values (man_ordem_servico_seq.nextval, :pf, sysdate, :prio,
                   'N', :breve, sysdate, :u, :dano,
                   1, 1, 1, 2,
                   :planej, :trab)
               returning nr_sequencia into :out""",
            pf=pf, prio=prio, breve=breve[:80], u=usuario_app, dano=dano,
            planej=planej, trab=trab, out=out,
        )
        conn.commit()
        return int(out.getvalue()[0])
