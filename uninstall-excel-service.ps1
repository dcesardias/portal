# uninstall-service.ps1
# Script para desinstalar o serviço CargaExcel Backend

Write-Host "=== Desinstalação do Serviço CargaExcel Backend ===" -ForegroundColor Cyan

# Verificar se está executando como Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ Este script precisa ser executado como Administrador" -ForegroundColor Red
    exit 1
}

$serviceName = "CargaExcel_Backend"

# Verificar se o serviço existe
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $service) {
    Write-Host "⚠️  Serviço '$serviceName' não encontrado" -ForegroundColor Yellow
    exit 0
}

Write-Host "Serviço encontrado: $serviceName" -ForegroundColor Green
Write-Host "Status: $($service.Status)" -ForegroundColor Gray
Write-Host ""

$response = Read-Host "Deseja realmente remover o serviço? (S/N)"

if ($response -ne 'S' -and $response -ne 's') {
    Write-Host "Operação cancelada" -ForegroundColor Yellow
    exit 0
}

# Parar serviço se estiver rodando
if ($service.Status -eq 'Running') {
    Write-Host "Parando serviço..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force
    Start-Sleep -Seconds 2
}

# Remover serviço
Write-Host "Removendo serviço..." -ForegroundColor Yellow
$nssmPath = (Get-Command nssm -ErrorAction SilentlyContinue).Source

if ($nssmPath) {
    & nssm remove $serviceName confirm
    Write-Host "✅ Serviço removido com sucesso" -ForegroundColor Green
} else {
    Write-Host "❌ NSSM não encontrado. Tentando remover via sc.exe..." -ForegroundColor Yellow
    sc.exe delete $serviceName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Serviço removido com sucesso" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao remover serviço" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Desinstalação Concluída ===" -ForegroundColor Cyan
