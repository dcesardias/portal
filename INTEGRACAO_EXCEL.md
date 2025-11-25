# Aplicação de Carga Excel - Integração

## 📋 Visão Geral

A aplicação de carga de planilhas Excel foi integrada ao Portal Power BI na rota `/excel`.

## 🚀 Como Usar

### 1. Iniciar o Backend Python

O backend Python (FastAPI) precisa estar rodando na porta 8000:

```powershell
# Navegar até a pasta do backend
cd "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend"

# Ativar ambiente virtual
.\venv\Scripts\activate

# Iniciar servidor
python main.py
```

O backend estará disponível em: `http://localhost:8000`

### 2. Acessar a Aplicação

Com o portal rodando, acesse:
- **URL Local**: `http://localhost:3000/excel`
- **URL Intranet**: `http://[servidor-iis]/excel`

## 🔧 Arquitetura

### Frontend
- **Localização**: `public/excel/`
- **Build**: React + Vite (estático)
- **Rotas**: Servido diretamente pelo Express

### Backend
- **Tecnologia**: Python + FastAPI
- **Porta**: 8000
- **Proxy**: Express faz proxy de `/api/excel/*` → `http://localhost:8000/api/*`

### Fluxo de Requisições

```
Browser → Express (porta 3000)
   ├─→ GET /excel → serve public/excel/index.html
   ├─→ GET /api/excel/* → proxy para localhost:8000/api/*
   └─→ WS /ws → proxy para localhost:8000/ws
```

## ⚙️ Configuração no IIS

### web.config (já configurado no portal)

O web.config do portal já tem regras de rewrite que funcionam com a nova estrutura.

### Iniciar Backend como Serviço

Para produção, configure o backend Python como serviço Windows:

```powershell
# Instalar nssm (Non-Sucking Service Manager)
choco install nssm

# Criar serviço
nssm install "CargaExcel_Backend" "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\venv\Scripts\python.exe" "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\main.py"

# Configurar diretório de trabalho
nssm set "CargaExcel_Backend" AppDirectory "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend"

# Iniciar serviço
nssm start "CargaExcel_Backend"
```

## 🔍 Verificação

### 1. Testar Backend Python
```powershell
curl http://localhost:8000/api/health
```

### 2. Testar Proxy do Portal
```powershell
curl http://localhost:3000/api/excel/health
```

### 3. Acessar Frontend
Navegue para: `http://localhost:3000/excel`

## 📊 Tabelas Disponíveis

A aplicação permite carga das seguintes tabelas:
- AFASTAMENTO - Afastamentos de funcionários
- FERIAS - Registros de férias
- MATRICULA - Dados de matrículas
- MOVIMENTO_PESSOAL - Movimentações de pessoal
- MOVIMENTO_PESSOAL_CC - Movimentações por Centro de Custo
- ADP_BENEFICIOS - Benefícios ADP
- ADP_MOTIVO_RESCISAO - Motivos de rescisão

## 🐛 Troubleshooting

### Erro "Backend Python não está disponível"
- Verifique se o backend está rodando: `curl http://localhost:8000/api/health`
- Inicie o backend manualmente (veja seção 1)

### Erro de CORS
- O backend já está configurado com CORS permitindo todas origens
- Se necessário, ajuste em `carga_adp/backend/main.py`

### WebSocket não conecta
- Verifique se o proxy do Express está configurado com `ws: true`
- Confirme que não há firewall bloqueando porta 8000

## 📁 Arquivos Modificados

- `server.js` - Adicionadas rotas proxy e /excel
- `public/excel/` - Frontend React buildado
- `public/excel/config.js` - Configuração de URLs dinâmicas
- `public/excel/index.html` - Ajustado paths e config

## 🔄 Atualizar Frontend

Se precisar atualizar o frontend:

```powershell
# 1. Fazer mudanças no código fonte
cd "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\frontend"

# 2. Build
npm run build

# 3. Copiar para o portal
Copy-Item -Path "dist\*" -Destination "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\portal\public\excel" -Recurse -Force

# 4. Aplicar patch nas URLs
cd "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\portal\public\excel"
$file = "index-B_FJmS8A.js"
$content = Get-Content $file -Raw
$content = $content -replace 'http://localhost:8000', '"+window.EXCEL_API_URL+"' -replace 'ws://localhost:8000', '"+window.EXCEL_WS_URL+"'
Set-Content $file $content

# 5. Atualizar paths no index.html se o hash do arquivo mudou
```
