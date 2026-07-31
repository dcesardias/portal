"""Configuração dos testes da API.

Os testes NÃO tocam no Oracle: a camada `db` é substituída por stubs em cada
teste. Aqui garantimos apenas que (1) o backend está no sys.path, (2) existe uma
TASY_PASSWORD qualquer para o import de `config` não falhar, e (3) o pool Oracle
nunca é realmente inicializado.
"""
import os
import sys
from pathlib import Path

# backend/ precisa estar no path para `import config`, `import db`, `import main`
BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

# senha fake só para o import de config passar (não conecta em lugar nenhum)
os.environ.setdefault("TASY_PASSWORD", "test-dummy")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import main  # noqa: E402


@pytest.fixture(autouse=True)
def _sem_oracle(monkeypatch):
    """Garante que nenhuma inicialização real do pool aconteça nos testes."""
    monkeypatch.setattr(db, "init_pool", lambda: None)
    yield


@pytest.fixture
def client():
    # sem `with` para não disparar o lifespan/startup (que abriria o pool real)
    return TestClient(main.app)


@pytest.fixture
def mock_db(monkeypatch):
    """Helper para trocar funções de `db` de forma concisa nos testes."""
    def _set(**funcs):
        for nome, fn in funcs.items():
            monkeypatch.setattr(db, nome, fn)
    return _set
