@echo off
echo ========================================
echo   REINICIAR SERVIDOR NODE.JS
echo ========================================
echo.
echo Este script vai parar e reiniciar o servidor automaticamente.
echo.
echo Pressione Ctrl+C para cancelar, ou
pause

echo.
echo [1/3] Parando processos Node.js na porta 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Matando processo %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/3] Aguardando 2 segundos...
timeout /t 2 /nobreak >nul

echo.
echo [3/3] Iniciando servidor...
echo.
start "Portal Server" cmd /k "cd /d %~dp0 && npm start"

echo.
echo ========================================
echo   SERVIDOR REINICIADO!
echo ========================================
echo.
echo Uma nova janela foi aberta com o servidor rodando.
echo Aguarde alguns segundos e acesse:
echo   http://localhost:3000/excel/admin
echo.
pause
