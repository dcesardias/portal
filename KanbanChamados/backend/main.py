"""API FastAPI do Kanban de Chamados (Ordens de Serviço Tasy - HML)."""
import logging
import mimetypes
import re
from contextlib import asynccontextmanager
from pathlib import Path

# No Windows, o registro pode mapear .js → text/plain; garantir tipos corretos.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")

from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
import db

# Log de auditoria dos PATCHes de edição — grava exatamente o que chegou no
# corpo da requisição e o que foi de fato enviado pro banco, pra diagnosticar
# casos como "diz que salvou mas o campo não muda" sem precisar adivinhar.
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    filename=str(LOG_DIR / "app.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("kanban")


def get_usuario(x_kanban_user: Optional[str] = Header(default=None)) -> str:
    """Retorna o login do usuário logado (injetado pelo proxy Express via X-Kanban-User)
    ou o APP_USER da config como fallback."""
    return x_kanban_user or config.APP_USER


def pode_trabalhar(usuario: str, nr_sequencia: int) -> bool:
    """Regra de vínculo (Kanban): só quem pertence ao GRUPO DE TRABALHO do
    chamado pode TRABALHÁ-LO (mover de coluna, encerrar/reabrir, editar). Os
    demais têm o chamado apenas para consulta.

    Fail-open (libera) quando não dá pra determinar com segurança:
    - usuário não identificado (caiu no APP_USER, ex.: chamada fora do proxy);
    - sem GRANT na tabela de vínculo (grupos_do_usuario == None);
    - chamado sem grupo de trabalho definido.
    Assim a regra nunca trava o app por um problema de permissão/config."""
    if not usuario or usuario == config.APP_USER:
        return True
    grupos = db.grupos_do_usuario(usuario)
    if grupos is None:
        return True
    grp = db.grupo_trabalho_chamado(nr_sequencia)
    if grp is None:
        return True
    return grp in grupos


def exigir_vinculo(usuario: str, nr_sequencia: int) -> None:
    """Levanta 403 se o usuário não puder trabalhar o chamado (regra de vínculo)."""
    if not pode_trabalhar(usuario, nr_sequencia):
        raise HTTPException(
            403,
            "Você não pertence ao grupo de trabalho deste chamado — "
            "somente consulta.",
        )

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_pool()        # abre o pool Oracle ao subir
    yield


app = FastAPI(title="Kanban de Chamados - Tasy", lifespan=lifespan)


@app.middleware("http")
async def _no_cache(request, call_next):
    """Evita cache de html/js/css (frontend serve sempre a versão atual)."""
    resp = await call_next(request)
    path = request.url.path
    if path in ("/", "/metricas") or path.endswith((".js", ".css", ".html")):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


# ----------------------------- modelos -------------------------------------
class StatusIn(BaseModel):
    ie_status_ordem: int
    ds_relato: str | None = None       # obrigatório quando ie_status_ordem == 3
    nm_usuario_exec: str | None = None  # executor a atribuir junto da transição


class CamposIn(BaseModel):
    ds_dano_breve: str | None = None
    ds_dano: str | None = None
    ie_prioridade: str | None = None
    nm_usuario_exec: str | None = None
    nr_grupo_planej: int | None = None
    nr_grupo_trabalho: int | None = None
    nr_seq_estagio: int | None = None
    # Transição de status junto da edição (modal): permite salvar campos + status
    # numa ÚNICA operação de escrita na OS — evita 2 UPDATEs (e o disparo em
    # duplicidade do trigger de e-mail AACD_ORDEM_SERV_OS_EMAIL).
    ie_status_ordem: int | None = None
    ds_relato: str | None = None   # obrigatório quando ie_status_ordem == 3 (encerrar)


# ----------------------------- API -----------------------------------------
@app.get("/api/meta")
def meta():
    return {"status": config.STATUS, "app_user": config.APP_USER}


@app.get("/api/chamados")
def chamados():
    return {"chamados": db.listar_chamados()}


_DATA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@app.get("/api/chamados/periodo")
def chamados_periodo(inicio: str, fim: str):
    """Todos os chamados (inclusive encerrados) abertos entre inicio e fim
    (YYYY-MM-DD, inclusivas). Base do dashboard de indicadores."""
    if not (_DATA_RE.match(inicio or "") and _DATA_RE.match(fim or "")):
        raise HTTPException(400, "Datas devem estar no formato YYYY-MM-DD.")
    if inicio > fim:
        raise HTTPException(400, "Data inicial não pode ser maior que a final.")
    return {"chamados": db.listar_chamados_periodo(inicio, fim)}


@app.get("/api/grupos")
def grupos():
    return db.listar_grupos()


@app.get("/api/estagios")
def estagios():
    return {"estagios": db.listar_estagios()}


@app.get("/api/meus-grupos")
def meus_grupos(usuario: str = Depends(get_usuario)):
    """Grupos de trabalho do usuário logado + flag 'gate' indicando se a regra
    de vínculo está ativa. gate=False (usuário não identificado ou sem grant na
    tabela) faz o frontend liberar tudo — mesmo critério do pode_trabalhar."""
    grupos = None if (not usuario or usuario == config.APP_USER) else db.grupos_do_usuario(usuario)
    if grupos is None:
        return {"grupos": [], "gate": False}
    return {"grupos": sorted(grupos), "gate": True}


class ChamadoIn(BaseModel):
    cd_pessoa_solicitante: str
    ds_dano_breve: str
    ds_dano: str
    ie_prioridade: str | None = "M"
    nr_grupo_planej: int
    nr_grupo_trabalho: int | None = None


@app.post("/api/chamados")
def criar(body: ChamadoIn, usuario: str = Depends(get_usuario)):
    try:
        nr = db.criar_chamado(body.model_dump(), usuario)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"nr_sequencia": nr, "chamado": db.chamado(nr)}


@app.get("/api/chamados/{nr_sequencia}")
def chamado_por_numero(nr_sequencia: int):
    """Busca um chamado específico por número, sem limite de data/status —
    usado pela busca do quadro pra achar chamados fora da janela normal
    (ex.: encerrados há muito tempo, fora do quadro)."""
    c = db.buscar_chamado_numero(nr_sequencia)
    if not c:
        raise HTTPException(404, "Chamado não encontrado")
    return c


@app.get("/api/usuarios")
def usuarios(q: str = ""):
    if len(q.strip()) < 2:
        return {"usuarios": []}
    return {"usuarios": db.buscar_usuarios(q.strip())}


@app.patch("/api/chamados/{nr_sequencia}/status")
def mover(nr_sequencia: int, body: StatusIn, usuario: str = Depends(get_usuario)):
    status = body.ie_status_ordem
    if status not in config.STATUS:
        raise HTTPException(400, "Status inválido")

    exigir_vinculo(usuario, nr_sequencia)  # regra: só trabalha quem é do grupo

    # atribui o executor enviado junto da transição (se houver)
    if (body.nm_usuario_exec or "").strip():
        db.atribuir_executor(nr_sequencia, body.nm_usuario_exec.strip(), usuario)

    if status == 2:  # Processo exige executor
        if not db.executor_atual(nr_sequencia):
            raise HTTPException(422, "Atribua um executor para colocar o chamado em Processo.")
        n = db.atualizar_status(nr_sequencia, 2, usuario)
    elif status == 3:  # Encerrar exige relato + executor
        if not (body.ds_relato or "").strip():
            raise HTTPException(422, "Informe a solução (relato técnico) para encerrar.")
        try:
            n = db.encerrar_chamado(nr_sequencia, body.ds_relato, usuario)
        except ValueError as e:
            raise HTTPException(422, str(e))
    else:  # status 1 (Aberta / reabertura)
        n = db.atualizar_status(nr_sequencia, 1, usuario)

    if n == 0:
        raise HTTPException(404, "Chamado não encontrado")
    return db.chamado(nr_sequencia)


@app.patch("/api/chamados/{nr_sequencia}")
async def editar(nr_sequencia: int, request: Request, body: CamposIn, usuario: str = Depends(get_usuario)):
    exigir_vinculo(usuario, nr_sequencia)  # regra: só edita quem é do grupo
    raw = await request.body()
    dados = body.model_dump(exclude_unset=True)
    logger.info(
        "PATCH /api/chamados/%s usuario=%s raw_body=%r campos_parseados=%r",
        nr_sequencia, usuario, raw.decode("utf-8", "replace"), dados,
    )
    tem_exec = "nm_usuario_exec" in dados
    nm_exec = dados.pop("nm_usuario_exec", None)
    novo_status = dados.pop("ie_status_ordem", None)
    relato = dados.pop("ds_relato", None)

    # 1) executor primeiro — vai para MAN_ORDEM_SERVICO_EXEC (não é a OS, não
    #    dispara o trigger de e-mail); e o encerramento precisa dele resolvido.
    if tem_exec:
        try:
            db.atribuir_executor(nr_sequencia, (nm_exec or "").strip() or None, usuario)
        except ValueError as e:
            logger.warning("atribuir_executor nr=%s falhou: %s", nr_sequencia, e)
            raise HTTPException(422, str(e))

    # 2) campos + status numa ÚNICA UPDATE na OS (1 disparo do trigger).
    try:
        if novo_status == 3:
            # Encerrar: aplica os campos editados JUNTO do status=3/solução, tudo
            # numa só UPDATE (+ insere o relato no histórico).
            if not (relato or "").strip():
                raise HTTPException(422, "Informe a solução (relato técnico) para encerrar.")
            db.encerrar_chamado(nr_sequencia, relato, usuario, campos=dados or None)
        elif novo_status in (1, 2):
            if novo_status == 2 and not db.executor_atual(nr_sequencia):
                raise HTTPException(422, "Atribua um executor para colocar o chamado em Processo.")
            dados["ie_status_ordem"] = novo_status
            afetadas = db.atualizar_campos(nr_sequencia, dados, usuario)
            logger.info("atualizar_campos(+status=%s) nr=%s linhas=%s", novo_status, nr_sequencia, afetadas)
        else:
            # sem mudança de status: só campos (se houver)
            if dados:
                afetadas = db.atualizar_campos(nr_sequencia, dados, usuario)
                logger.info("atualizar_campos nr=%s campos=%r linhas=%s", nr_sequencia, dados, afetadas)
            else:
                logger.info("PATCH /api/chamados/%s: nenhum campo (corpo vazio ou só executor)", nr_sequencia)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return db.chamado(nr_sequencia)


@app.get("/api/chamados/{nr_sequencia}/anexos")
def anexos(nr_sequencia: int):
    return {"anexos": db.listar_anexos(nr_sequencia)}


class RelatoIn(BaseModel):
    ds_relato: str


@app.get("/api/chamados/{nr_sequencia}/historico")
def historico(nr_sequencia: int):
    return {"historico": db.listar_historico(nr_sequencia)}


@app.put("/api/chamados/{nr_sequencia}/relato")
def relato_put(nr_sequencia: int, body: RelatoIn, usuario: str = Depends(get_usuario)):
    exigir_vinculo(usuario, nr_sequencia)  # regra: só interage quem é do grupo
    try:
        db.salvar_relato(nr_sequencia, body.ds_relato, usuario)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"historico": db.listar_historico(nr_sequencia)}


# ----------------------------- frontend ------------------------------------
@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


@app.get("/metricas")
def metricas():
    """Página dedicada de indicadores (URL limpa, sem .html)."""
    return FileResponse(FRONTEND / "metricas.html")


app.mount("/", StaticFiles(directory=str(FRONTEND)), name="static")
