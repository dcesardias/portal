# Integracao do MapDB no portal

O MapDB foi embutido neste projeto e fica disponivel em `/mapdb/`.

## Estrutura adicionada

- `public/mapdb`: frontend buildado do MapDB
- `mapdb-backend/src`: backend compilado do MapDB montado dentro do Express do portal
- `mapdb-backend/data/connections.json`: armazenamento local das conexoes salvas do MapDB

## Como funciona

- O portal continua sendo servido por `server.js` via IIS/iisnode
- Durante o startup, `server.js` monta:
  - frontend SPA em `/mapdb`
  - API em `/mapdb/api/connections/*`
- Nao existe segundo processo Node para o MapDB

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
