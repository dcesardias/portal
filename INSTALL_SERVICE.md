# 🚀 Instalação Rápida - Serviço Backend Excel

## ⚡ Instalação Automática (Recomendado)

### 1. Executar como Administrador

Clique com botão direito no **PowerShell** e selecione **"Executar como Administrador"**

### 2. Executar Script de Instalação

```powershell
cd "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\portal"
.\install-excel-service.ps1
```

O script vai:
- ✅ Verificar se Python e arquivos existem
- ✅ Instalar NSSM (se necessário)
- ✅ Criar serviço Windows
- ✅ Configurar para iniciar automaticamente
- ✅ Iniciar o serviço
- ✅ Testar se está funcionando

### 3. Pronto!

O backend estará rodando como serviço Windows na porta 8000 e iniciará automaticamente com o servidor.

---

## 📋 Instalação Manual (Alternativa)

Se preferir instalar manualmente:

### 1. Instalar NSSM

```powershell
# Via Chocolatey
choco install nssm -y

# OU baixar de: https://nssm.cc/download
```

### 2. Criar Serviço

```powershell
$pythonExe = "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\venv\Scripts\python.exe"
$mainPy = "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\main.py"
$backendPath = "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend"

nssm install CargaExcel_Backend $pythonExe $mainPy
nssm set CargaExcel_Backend AppDirectory $backendPath
nssm set CargaExcel_Backend DisplayName "Portal - Carga Excel Backend"
nssm set CargaExcel_Backend Start SERVICE_AUTO_START
```

### 3. Iniciar Serviço

```powershell
Start-Service -Name CargaExcel_Backend
```

---

## 🔧 Gerenciar Serviço

### Ver Status
```powershell
Get-Service -Name CargaExcel_Backend
```

### Iniciar
```powershell
Start-Service -Name CargaExcel_Backend
```

### Parar
```powershell
Stop-Service -Name CargaExcel_Backend
```

### Reiniciar
```powershell
Restart-Service -Name CargaExcel_Backend
```

### Ver Logs
```powershell
# Logs ficam em:
notepad "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\logs\stdout.log"
notepad "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\logs\stderr.log"
```

### Remover Serviço
```powershell
# Usar script automático
.\uninstall-excel-service.ps1

# OU manualmente
Stop-Service -Name CargaExcel_Backend -Force
nssm remove CargaExcel_Backend confirm
```

---

## ✅ Verificar Instalação

### 1. Testar Backend Diretamente
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing
```

Resposta esperada:
```json
{"status":"healthy","database":"connected","timestamp":"2025-11-25T..."}
```

### 2. Testar Proxy do Portal
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/excel/health" -UseBasicParsing
```

### 3. Acessar Interface
Abra no navegador: `http://localhost:3000/excel`

---

## 🎯 Para Produção no IIS

Após instalar o serviço, a aplicação `/excel` funcionará automaticamente no IIS porque:

1. ✅ Serviço inicia automaticamente com Windows
2. ✅ Portal IIS faz proxy para localhost:8000
3. ✅ Sem necessidade de configuração extra

Acesse via intranet: `http://[seu-servidor-iis]/excel`

---

## 🐛 Troubleshooting

### Erro: "Backend Python não está disponível"

1. Verificar se serviço está rodando:
   ```powershell
   Get-Service -Name CargaExcel_Backend
   ```

2. Se não estiver rodando:
   ```powershell
   Start-Service -Name CargaExcel_Backend
   ```

3. Ver logs para diagnosticar:
   ```powershell
   Get-Content "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\logs\stderr.log" -Tail 50
   ```

### Porta 8000 já em uso

```powershell
# Ver o que está usando a porta
netstat -ano | findstr :8000

# Matar processo se necessário
Stop-Process -Id [PID] -Force
```

### Serviço não inicia

1. Verificar se Python existe:
   ```powershell
   Test-Path "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend\venv\Scripts\python.exe"
   ```

2. Testar manualmente:
   ```powershell
   cd "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend"
   .\venv\Scripts\activate
   python main.py
   ```

3. Ver erro nos logs do serviço

---

## 📊 Arquivos do Projeto

```
portal/
├── install-excel-service.ps1      # Script de instalação
├── uninstall-excel-service.ps1    # Script de desinstalação
├── INSTALL_SERVICE.md             # Este arquivo
├── INTEGRACAO_EXCEL.md            # Documentação completa
├── server.js                      # Rotas proxy configuradas
└── public/excel/                  # Frontend React
    ├── index.html
    ├── config.js
    └── index-*.js

carga_adp/
└── backend/
    ├── main.py                    # Backend FastAPI
    ├── venv/                      # Ambiente virtual Python
    └── logs/                      # Logs do serviço
        ├── stdout.log
        └── stderr.log
```

---

## 💡 Dicas

- **Logs**: Sempre verifique os logs em caso de problema
- **Autostart**: O serviço inicia automaticamente, não precisa iniciar manualmente
- **Atualização**: Para atualizar o código Python, reinicie o serviço
- **Monitoring**: Use `Get-Service` periodicamente para verificar se está rodando
