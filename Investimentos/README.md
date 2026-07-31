# Investimentos AACD — Onda 2: Fundação

Monorepo pnpm + Turborepo. Stack: NestJS 11 (API) + React 19/Vite 8 (Web) + Prisma 6 + MSSQL 2022 Docker.

## Estrutura

```
apps/api/        NestJS 11 — auth, prisma, users
apps/web/        React 19 + Vite 8 + TanStack Query 5
packages/shared/ Zod schemas compartilhados
tooling/         tsconfig + eslint configs
docker-compose.yml  MSSQL 2022 Developer
```

## Setup inicial

### 1. Pré-requisitos

- Node >= 24 LTS
- pnpm >= 9
- Docker Desktop (para o MSSQL)

### 2. Variáveis de ambiente

```bash
cp .env.example .env
# Edite .env: defina DATABASE_URL, JWT_ACCESS_SECRET e JWT_REFRESH_SECRET
# Gere segredos com: openssl rand -base64 48
```

**Importante:** o Prisma CLI e o `ConfigModule` do NestJS carregam o `.env` a partir do
diretório de execução (`apps/api`), não da raiz do monorepo. Depois de editar o `.env` na
raiz, copie (ou mantenha sincronizado) para `apps/api/.env`:

```bash
cp .env apps/api/.env
```

Este projeto pode conectar em dois tipos de banco (veja `.env.example`):

- **Opção A — SQL Server já existente** (ex: servidor legado): as tabelas do app ficam
  isoladas em um schema próprio (`investimentos.*`), sem tocar nas tabelas legadas do
  schema `dbo`. O login precisa de permissão `CREATE SCHEMA` na primeira execução.
- **Opção B — MSSQL via Docker** (`docker-compose.yml`): banco dedicado só para dev local.

### 3. Instalar dependências

```bash
pnpm install
```

### 4. Banco de dados

**Se usar SQL Server existente (Opção A):** garanta que o schema de destino existe antes
da primeira migration (Prisma não cria schemas automaticamente no SQL Server):

```sql
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'investimentos')
  EXEC('CREATE SCHEMA investimentos');
```

**Se usar Docker (Opção B):**

```bash
docker compose up -d

# Aguardar healthcheck OK (~30s):
docker compose ps
# Status: healthy

# Criar banco 'investimentos' no container:
docker exec investimentos-mssql /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$SA_PASSWORD" -C \
  -Q "IF DB_ID('investimentos') IS NULL CREATE DATABASE investimentos"
```

### 5. Rodar migrations

```bash
pnpm --filter @investimentos/api exec prisma migrate dev --name init
```

### 6. Rodar seed

```bash
pnpm --filter @investimentos/api exec ts-node prisma/seed.ts
# Esperado: 2 fluxos, 4 etapas total
```

### 7. Desativar o mock do front-end

Por padrão o front-end usa um adapter mock (dados fictícios em memória) para abrir sem
depender do backend. Para conectar ao NestJS real, crie `apps/web/.env.local`:

```bash
echo "VITE_USE_MOCK=false" > apps/web/.env.local
```

Com o mock desativado, o banner "Modo demonstração" some automaticamente.

### 8. Desenvolvimento

```bash
# API + Web em paralelo:
pnpm dev

# Só API:
pnpm --filter @investimentos/api dev

# Só Web:
pnpm --filter @investimentos/web dev
```

> **Nota (pasta sincronizada com OneDrive):** se o repositório estiver dentro de uma pasta
> do OneDrive, `nest start --watch` (que usa `deleteOutDir: true`) pode entrar em race
> condition com a sincronização e apagar `dist/` antes do reload terminar, quebrando o
> cache incremental do `tsconfig.tsbuildinfo`. Se isso acontecer, rode:
> ```bash
> rm apps/api/tsconfig.tsbuildinfo
> pnpm --filter @investimentos/api build
> node apps/api/dist/main.js
> ```

### 9. Build

```bash
pnpm build
```

## Endpoints Auth (base: /api/v1)

| Método | Rota | Corpo | Retorno |
|--------|------|-------|---------|
| POST | /auth/login | `{login, senha}` | `{accessToken}` + cookie `refresh_token` httpOnly |
| POST | /auth/refresh | — (cookie) | `{accessToken}` + cookie rotacionado |
| POST | /auth/logout | — (cookie) | 204 |

## Segurança

- Senha: argon2id (m=19456, t=2, p=1), min 12 chars, maiúsc+minúsc+número+símbolo
- Access token: HS256, TTL 15min
- Refresh token: httpOnly cookie, TTL 7d, rotação automática, revogação de family em reuse
- Rate limit: 100 req/60s por IP (ThrottlerModule)
- Helmet habilitado

## NUNCA

- Commitar o arquivo `.env` (está no .gitignore)
