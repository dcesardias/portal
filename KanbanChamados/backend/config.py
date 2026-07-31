"""Configuração de conexão e parâmetros do Kanban de Chamados (Tasy HML)."""
import os
from pathlib import Path


def _carregar_env():
    """Carrega variáveis de um arquivo .env (KEY=VALUE) ao lado do backend,
    sem dependência externa. Variáveis de ambiente já definidas têm precedência.
    O .env NÃO é versionado (ver .gitignore) — é onde mora a senha do banco."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for linha in env_path.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        chave, valor = chave.strip(), valor.strip().strip('"').strip("'")
        os.environ.setdefault(chave, valor)


_carregar_env()

# Caminho do Oracle Instant Client (modo thick é obrigatório:
# o banco usa verificador de senha 0x939, não suportado no modo thin).
ORACLE_CLIENT_DIR = os.getenv(
    "ORACLE_CLIENT_DIR", r"C:\oracle\instantclient_19_23"
)

_senha = os.getenv("TASY_PASSWORD")
if not _senha:
    raise RuntimeError(
        "TASY_PASSWORD não definida. Crie backend/.env (a partir de "
        ".env.example) ou exporte a variável de ambiente antes de iniciar."
    )

DB = dict(
    user=os.getenv("TASY_USER", "usrtasy"),
    password=_senha,
    host=os.getenv("TASY_HOST", "odascan"),
    port=int(os.getenv("TASY_PORT", "1521")),
    service_name=os.getenv("TASY_SERVICE", "tasyhmlg.spcentral.iaacd.org.br"),
)

# Usuário Tasy gravado em nm_usuario/nm_usuario_exec ao alterar pelo Kanban.
APP_USER = os.getenv("KANBAN_APP_USER", "Kanban")

# Quantos dias de chamados ENCERRADOS trazer para a coluna "Encerrada".
# (encerrados/atualizados nos últimos N dias). Padrão: 7.
DIAS_ENCERRADAS = int(os.getenv("KANBAN_DIAS_ENCERRADAS", "7"))

# Grupos de planejamento que pertencem aos chamados de TI.
GRUPOS_PLANEJ = [
    102, 602, 603, 604, 605, 1102, 1603, 1604, 1605, 2602, 3102, 3602,
    4102, 4602, 5102, 8102, 9102, 8602, 5602, 18604, 14103, 14102,
]

# Status (domínio 1279) -> colunas do Kanban
STATUS = {
    1: "Aberta",
    2: "Processo",
    3: "Encerrada",
}
