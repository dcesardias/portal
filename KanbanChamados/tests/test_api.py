"""Testes da API do Kanban — foco nas REGRAS DE NEGÓCIO do caminho de escrita.

A camada `db` é mockada: não há Oracle envolvido. O que importa aqui é que a API
imponha as regras (executor obrigatório, solução obrigatória, validações) e
traduza os erros corretamente (422/400), protegendo a tabela do Tasy.
"""
CHAMADO_FAKE = {
    "nr_sequencia": 123,
    "ie_status_ordem": 2,
    "ds_situacao": "Processo",
    "ds_dano_breve": "PC não liga",
}


# ----------------------------- smoke / leitura -----------------------------
def test_meta_ok(client):
    r = client.get("/api/meta")
    assert r.status_code == 200
    body = r.json()
    assert "status" in body and "app_user" in body
    # o domínio de status deve conter as 3 colunas do quadro
    assert set(map(str, body["status"].keys())) >= {"1", "2", "3"}


def test_listar_chamados(client, mock_db):
    mock_db(listar_chamados=lambda: [CHAMADO_FAKE])
    r = client.get("/api/chamados")
    assert r.status_code == 200
    assert r.json() == {"chamados": [CHAMADO_FAKE]}


def test_periodo_ok(client, mock_db):
    visto = {}
    def _periodo(ini, fim):
        visto["args"] = (ini, fim)
        return [CHAMADO_FAKE]
    mock_db(listar_chamados_periodo=_periodo)
    r = client.get("/api/chamados/periodo", params={"inicio": "2025-01-01", "fim": "2025-12-31"})
    assert r.status_code == 200
    assert r.json() == {"chamados": [CHAMADO_FAKE]}
    assert visto["args"] == ("2025-01-01", "2025-12-31")


def test_periodo_data_invalida_400(client):
    r = client.get("/api/chamados/periodo", params={"inicio": "01/01/2025", "fim": "2025-12-31"})
    assert r.status_code == 400


def test_periodo_inicio_maior_que_fim_400(client):
    r = client.get("/api/chamados/periodo", params={"inicio": "2025-12-31", "fim": "2025-01-01"})
    assert r.status_code == 400


# ----------------------------- mover: Processo (2) -------------------------
def test_mover_processo_sem_executor_422(client, mock_db):
    """Regra: colocar em Processo sem executor é proibido."""
    mock_db(executor_atual=lambda nr: None)
    r = client.patch("/api/chamados/123/status", json={"ie_status_ordem": 2})
    assert r.status_code == 422
    assert "executor" in r.json()["detail"].lower()


def test_mover_processo_com_executor_ok(client, mock_db):
    chamadas = {}
    mock_db(
        atribuir_executor=lambda nr, ex, u: chamadas.setdefault("exec", (nr, ex)),
        executor_atual=lambda nr: "joao",
        atualizar_status=lambda nr, s, u: 1,
        chamado=lambda nr: CHAMADO_FAKE,
    )
    r = client.patch(
        "/api/chamados/123/status",
        json={"ie_status_ordem": 2, "nm_usuario_exec": "joao"},
    )
    assert r.status_code == 200
    assert chamadas["exec"] == (123, "joao")  # executor foi atribuído junto


# ----------------------------- mover: Encerrar (3) -------------------------
def test_encerrar_sem_relato_422(client, mock_db):
    """Regra: encerrar exige a solução (ds_relato)."""
    r = client.patch("/api/chamados/123/status", json={"ie_status_ordem": 3})
    assert r.status_code == 422
    assert "solução" in r.json()["detail"].lower() or "relato" in r.json()["detail"].lower()


def test_encerrar_com_relato_ok(client, mock_db):
    capturado = {}
    mock_db(
        encerrar_chamado=lambda nr, rel, u: capturado.setdefault("rel", rel) or 1,
        chamado=lambda nr: {**CHAMADO_FAKE, "ie_status_ordem": 3},
    )
    r = client.patch(
        "/api/chamados/123/status",
        json={"ie_status_ordem": 3, "ds_relato": "Troca de fonte; testado OK."},
    )
    assert r.status_code == 200
    assert capturado["rel"].startswith("Troca de fonte")


def test_encerrar_sem_executor_propaga_422(client, mock_db):
    """Se o db recusar (sem executor), a API responde 422 com a mensagem."""
    def _encerra(nr, rel, u):
        raise ValueError("Atribua um executor antes de encerrar o chamado.")
    mock_db(encerrar_chamado=_encerra)
    r = client.patch(
        "/api/chamados/123/status",
        json={"ie_status_ordem": 3, "ds_relato": "qualquer"},
    )
    assert r.status_code == 422
    assert "executor" in r.json()["detail"].lower()


def test_status_invalido_400(client):
    r = client.patch("/api/chamados/123/status", json={"ie_status_ordem": 9})
    assert r.status_code == 400


# ----------------------------- edição --------------------------------------
def test_editar_campos_ok(client, mock_db):
    vistos = {}
    mock_db(
        atualizar_campos=lambda nr, dados, u: vistos.setdefault("dados", dados),
        chamado=lambda nr: CHAMADO_FAKE,
    )
    r = client.patch("/api/chamados/123", json={"ds_dano_breve": "Novo título", "ie_prioridade": "A"})
    assert r.status_code == 200
    assert vistos["dados"]["ds_dano_breve"] == "Novo título"
    assert "nm_usuario_exec" not in vistos["dados"]  # executor é tratado à parte


def test_editar_transferir_grupo_ok(client, mock_db):
    """Regra: transferir grupo de planejamento/trabalho passa pelo mesmo PATCH
    de edição de campos (nenhuma rota nova)."""
    vistos = {}
    mock_db(
        atualizar_campos=lambda nr, dados, u: vistos.setdefault("dados", dados),
        chamado=lambda nr: CHAMADO_FAKE,
    )
    r = client.patch(
        "/api/chamados/123",
        json={"nr_grupo_planej": 10, "nr_grupo_trabalho": 55},
    )
    assert r.status_code == 200
    assert vistos["dados"]["nr_grupo_planej"] == 10
    assert vistos["dados"]["nr_grupo_trabalho"] == 55


def test_editar_limpar_grupo_trabalho_ok(client, mock_db):
    """Grupo de trabalho é opcional — enviar null deve limpá-lo (vira NULL)."""
    vistos = {}
    mock_db(
        atualizar_campos=lambda nr, dados, u: vistos.setdefault("dados", dados),
        chamado=lambda nr: CHAMADO_FAKE,
    )
    r = client.patch("/api/chamados/123", json={"nr_grupo_trabalho": None})
    assert r.status_code == 200
    assert "nr_grupo_trabalho" in vistos["dados"]
    assert vistos["dados"]["nr_grupo_trabalho"] is None


def test_editar_remover_executor_em_processo_422(client, mock_db):
    """Limpar executor de chamado em Processo/Encerrado é proibido (db levanta ValueError)."""
    def _atrib(nr, ex, u):
        raise ValueError("Chamado em Processo/Encerrado precisa ter um executor.")
    mock_db(atribuir_executor=_atrib, chamado=lambda nr: CHAMADO_FAKE)
    r = client.patch("/api/chamados/123", json={"nm_usuario_exec": ""})
    assert r.status_code == 422


# ----------------------------- criação -------------------------------------
def _payload_novo(**over):
    base = {
        "cd_pessoa_solicitante": "999",
        "ds_dano_breve": "Mouse quebrado",
        "ds_dano": "Mouse não funciona no setor X",
        "ie_prioridade": "M",
        "nr_grupo_planej": 102,
    }
    base.update(over)
    return base


def test_criar_ok(client, mock_db):
    mock_db(criar_chamado=lambda dados, u: 555, chamado=lambda nr: {**CHAMADO_FAKE, "nr_sequencia": 555})
    r = client.post("/api/chamados", json=_payload_novo())
    assert r.status_code == 200
    assert r.json()["nr_sequencia"] == 555


def test_criar_invalido_propaga_422(client, mock_db):
    def _cria(dados, u):
        raise ValueError("Selecione um grupo de planejamento válido.")
    mock_db(criar_chamado=_cria)
    r = client.post("/api/chamados", json=_payload_novo(nr_grupo_planej=1))
    assert r.status_code == 422
    assert "grupo" in r.json()["detail"].lower()


def test_criar_falta_campo_obrigatorio_422(client):
    """Pydantic deve rejeitar payload sem campo obrigatório (sem chegar no db)."""
    r = client.post("/api/chamados", json={"ds_dano_breve": "só isso"})
    assert r.status_code == 422


# ----------------------------- usuários (autocomplete) ---------------------
def test_usuarios_termo_curto_vazio(client):
    r = client.get("/api/usuarios", params={"q": "a"})
    assert r.status_code == 200
    assert r.json() == {"usuarios": []}


def test_usuarios_busca(client, mock_db):
    mock_db(buscar_usuarios=lambda q: [{"nm_usuario": "ana", "nm_completo": "Ana Lima", "cd_pessoa_fisica": "1"}])
    r = client.get("/api/usuarios", params={"q": "ana"})
    assert r.status_code == 200
    assert r.json()["usuarios"][0]["nm_usuario"] == "ana"
