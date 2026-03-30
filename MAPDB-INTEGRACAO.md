# Integracao do MapDB no portal

O MapDB foi embutido neste projeto e fica disponivel em `/mapdb/`.

Agora o acesso ao MapDB exige login com a tabela `Users` do PowerBIPortal, e cada usuario enxerga apenas as proprias conexoes salvas.

## Estrutura adicionada

- `public/mapdb`: frontend buildado do MapDB
- `mapdb-backend/src`: backend compilado do MapDB montado dentro do Express do portal
- `mapdb-backend/data/connections.json`: artefato legado do MapDB standalone; no portal, a persistencia principal fica no banco
- `dbo.MapDBConnections`: tabela no banco PowerBIPortal para persistencia das conexoes por usuario

## Como funciona

- O portal continua sendo servido por `server.js` via IIS/iisnode
- Durante o startup, `server.js` monta:
  - frontend SPA em `/mapdb`
  - API em `/mapdb/api/connections/*`
- O login do MapDB reutiliza `Users` e `/api/login`
- Nao existe segundo processo Node para o MapDB

## Usuarios

- O admin do portal pode criar, editar e remover usuarios na aba `Usuarios` do painel administrativo
- Usuarios comuns podem entrar no MapDB, mas nao recebem acesso ao painel administrativo do portal
- Conexoes do MapDB ficam segregadas por `UserId`

## Deploy

1. Rode `npm install` na raiz do portal
2. Publique o projeto normalmente no IIS
3. Acesse `/mapdb/`

## Oracle

O backend do MapDB agora tenta carregar Oracle apenas quando uma conexao Oracle e usada.

Se precisar Oracle no servidor, configure uma destas variaveis:

- `MAPDB_ORACLE_CLIENT_LIB_DIR`
- `ORACLE_CLIENT_LIB_DIR`

Exemplo:

```text
C:\oracle\instantclient_19_23
```

Se o uso for apenas SQL Server, nao e necessario instalar Oracle Client.
