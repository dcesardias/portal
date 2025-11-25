# install-service.ps1
# Script para instalar o backend Python da aplicação de carga como serviço Windows

<#
Uso:
    .\install-excel-service.ps1
    .\install-excel-service.ps1 -BackendPathOverride "C:\caminho\para\backend"

Você também pode definir a variável de ambiente EXCEL_BACKEND_PATH para evitar editar o script:
    $env:EXCEL_BACKEND_PATH = 'C:\caminho\para\backend'
    .\install-excel-service.ps1
#>

param(
        [string]$BackendPathOverride = $env:EXCEL_BACKEND_PATH
)

Write-Host "=== Instalação do Serviço CargaExcel Backend ===" -ForegroundColor Cyan

# Verificar se está executando como Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ Este script precisa ser executado como Administrador" -ForegroundColor Red
    Write-Host "Clique com botão direito no PowerShell e selecione 'Executar como Administrador'" -ForegroundColor Yellow
    exit 1
}

# Caminhos
$defaultBackendPath = "C:\Users\dcesar\OneDrive - AACD\Documentos\GitHub\carga_adp\backend"

# Se o usuário forneceu um caminho via parâmetro ou variável de ambiente, use-o.
if ($BackendPathOverride) {
    # Não falhar automaticamente se o caminho não existir — só avisar. O script
    # continuará e Test-Path verificará os arquivos específicos depois.
    Write-Host "ℹ️  Usando BackendPathOverride: $BackendPathOverride" -ForegroundColor Cyan
    $backendPath = $BackendPathOverride
} else {
    $backendPath = $defaultBackendPath
}

$pythonExe = "$backendPath\venv\Scripts\python.exe"
$mainPy = "$backendPath\main.py"
$serviceName = "CargaExcel_Backend"

# Verificar se os arquivos existem
if (-not (Test-Path $pythonExe)) {
    Write-Host "❌ Python não encontrado em: $pythonExe" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $mainPy)) {
    Write-Host "❌ main.py não encontrado em: $mainPy" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Arquivos verificados" -ForegroundColor Green

# Verificar se NSSM está instalado
$nssmPath = (Get-Command nssm -ErrorAction SilentlyContinue).Source

if (-not $nssmPath) {
    Write-Host "⚠️  NSSM não encontrado. Tentando instalar via Chocolatey..." -ForegroundColor Yellow
    
    # Verificar se Chocolatey está instalado
    $chocoPath = (Get-Command choco -ErrorAction SilentlyContinue).Source
    
    if (-not $chocoPath) {
        Write-Host "❌ Chocolatey não está instalado" -ForegroundColor Red
        Write-Host ""
        Write-Host "Opção 1: Instalar Chocolatey primeiro:" -ForegroundColor Cyan
        Write-Host "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Opção 2: Baixar NSSM manualmente:" -ForegroundColor Cyan
        Write-Host "1. Baixe de: https://nssm.cc/download" -ForegroundColor Gray
        Write-Host "2. Extraia e adicione ao PATH do sistema" -ForegroundColor Gray
        Write-Host "3. Execute este script novamente" -ForegroundColor Gray
        exit 1
    }
    
    Write-Host "Instalando NSSM..." -ForegroundColor Yellow
    choco install nssm -y
    
    # Recarregar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $nssmPath = (Get-Command nssm -ErrorAction SilentlyContinue).Source
    
    if (-not $nssmPath) {
        Write-Host "❌ Falha ao instalar NSSM" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ NSSM encontrado: $nssmPath" -ForegroundColor Green

# Verificar se o serviço já existe
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existingService) {
    Write-Host "⚠️  Serviço '$serviceName' já existe" -ForegroundColor Yellow
    $response = Read-Host "Deseja remover e reinstalar? (S/N)"
    
    if ($response -eq 'S' -or $response -eq 's') {
        Write-Host "Parando serviço..." -ForegroundColor Yellow
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        
        Write-Host "Removendo serviço..." -ForegroundColor Yellow
        & nssm remove $serviceName confirm
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Instalação cancelada" -ForegroundColor Yellow
        exit 0
    }
}

# Instalar serviço
Write-Host ""
Write-Host "Instalando serviço '$serviceName'..." -ForegroundColor Cyan

& nssm install $serviceName $pythonExe $mainPy

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao instalar serviço" -ForegroundColor Red
    exit 1
}

# Configurar serviço
Write-Host "Configurando serviço..." -ForegroundColor Cyan

# Diretório de trabalho
& nssm set $serviceName AppDirectory $backendPath

# Nome de exibição
& nssm set $serviceName DisplayName "Portal - Carga Excel Backend"

# Descrição
& nssm set $serviceName Description "Backend Python (FastAPI) para aplicação de carga de planilhas Excel do Portal Power BI"

# Iniciar automaticamente
& nssm set $serviceName Start SERVICE_AUTO_START

# Logs
$logPath = "$backendPath\logs"
if (-not (Test-Path $logPath)) {
    New-Item -Path $logPath -ItemType Directory -Force | Out-Null
}

& nssm set $serviceName AppStdout "$logPath\stdout.log"
& nssm set $serviceName AppStderr "$logPath\stderr.log"

# Rotação de logs (10MB)
& nssm set $serviceName AppStdoutCreationDisposition 4
& nssm set $serviceName AppStderrCreationDisposition 4
& nssm set $serviceName AppRotateFiles 1
& nssm set $serviceName AppRotateOnline 1
& nssm set $serviceName AppRotateBytes 10485760

# Reiniciar em caso de falha
& nssm set $serviceName AppExit Default Restart
& nssm set $serviceName AppRestartDelay 5000

Write-Host "✅ Serviço configurado" -ForegroundColor Green

# Iniciar serviço
Write-Host ""
Write-Host "Iniciando serviço..." -ForegroundColor Cyan
Start-Service -Name $serviceName

Start-Sleep -Seconds 3

# Verificar status
$service = Get-Service -Name $serviceName
Write-Host ""
if ($service.Status -eq 'Running') {
    Write-Host "✅ Serviço instalado e iniciado com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Informações do Serviço:" -ForegroundColor Cyan
    Write-Host "  Nome: $serviceName" -ForegroundColor White
    Write-Host "  Status: Running" -ForegroundColor Green
    Write-Host "  Logs: $logPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Comandos úteis:" -ForegroundColor Cyan
    Write-Host "  Parar:     Stop-Service -Name $serviceName" -ForegroundColor Gray
    Write-Host "  Iniciar:   Start-Service -Name $serviceName" -ForegroundColor Gray
    Write-Host "  Status:    Get-Service -Name $serviceName" -ForegroundColor Gray
    Write-Host "  Remover:   nssm remove $serviceName confirm" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Testando backend..." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 5
        Write-Host "✅ Backend respondendo corretamente!" -ForegroundColor Green
        Write-Host "Resposta: $($response.Content)" -ForegroundColor Gray
    } catch {
        Write-Host "⚠️  Backend ainda inicializando ou erro de conexão" -ForegroundColor Yellow
        Write-Host "Verifique os logs em: $logPath" -ForegroundColor Gray
    }
} else {
    Write-Host "❌ Erro ao iniciar serviço" -ForegroundColor Red
    Write-Host "Status: $($service.Status)" -ForegroundColor Red
    Write-Host "Verifique os logs em: $logPath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Instalação Concluída ===" -ForegroundColor Cyan
